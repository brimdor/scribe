import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsStore = new Map();

const getSetting = vi.fn((userId, key) => settingsStore.get(`${userId}:${key}`) ?? null);
const getSettings = vi.fn((userId, keys) => Object.fromEntries(keys.map((key) => [key, getSetting(userId, key)])));
const setSetting = vi.fn((userId, key, value) => {
  settingsStore.set(`${userId}:${key}`, value);
});
const setSettings = vi.fn((userId, entries) => {
  for (const [key, value] of entries) {
    settingsStore.set(`${userId}:${key}`, value);
  }
});

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.auth = {
      userId: 'user-1',
      user: { id: 'user-1', login: 'brimdor' },
    };
    next();
  },
}));

vi.mock('../../services/storage-store.js', () => ({
  deleteMessage: vi.fn(),
  deleteThread: vi.fn(),
  getSetting,
  getSettings,
  getThread: vi.fn(),
  listMessagesByThread: vi.fn(() => []),
  listSchemas: vi.fn(() => []),
  listThreads: vi.fn(() => []),
  saveMessage: vi.fn(),
  saveSchema: vi.fn(),
  saveThread: vi.fn(),
  setSetting,
  setSettings,
  updateMessage: vi.fn(),
  updateThread: vi.fn(),
}));

async function createTestServer() {
  const { default: storageRoutes } = await import('../storage-routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/storage', storageRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

describe('storage routes', () => {
  let currentServer = null;
  let baseUrl = '';

  beforeEach(async () => {
    vi.resetModules();
    settingsStore.clear();
    getSetting.mockClear();
    getSettings.mockClear();
    setSetting.mockClear();
    setSettings.mockClear();
    const serverInfo = await createTestServer();
    currentServer = serverInfo.server;
    baseUrl = serverInfo.baseUrl;
  });

  afterEach(async () => {
    if (currentServer) {
      await new Promise((resolve, reject) => {
        currentServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    currentServer = null;
    baseUrl = '';
  });

  it('returns a normalized bootstrap payload', async () => {
    settingsStore.set('user-1:selectedRepo', { owner: 'brimdor', repo: 'scribe' });
    settingsStore.set('user-1:environmentName', ' Local ');
    settingsStore.set('user-1:openaiConnectionMethod', 'oauth');
    settingsStore.set('user-1:agentApiKey', 'secret');
    settingsStore.set('user-1:openaiOAuthSession', {
      status: 'connected',
      accessToken: ' access ',
      refreshToken: ' refresh ',
      expiresAt: 123,
    });

    const response = await fetch(`${baseUrl}/api/storage/bootstrap`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      user: { id: 'user-1', login: 'brimdor' },
      selectedRepo: { owner: 'brimdor', repo: 'scribe' },
      settings: expect.objectContaining({
        environmentName: 'Local',
        openaiConnectionMethod: 'oauth',
        agentApiKeyConfigured: true,
      }),
      openAIOAuthSession: expect.objectContaining({
        accessToken: 'access',
        refreshToken: 'refresh',
      }),
    }));
  });

  it('persists bootstrap updates atomically through batched settings writes', async () => {
    const response = await fetch(`${baseUrl}/api/storage/bootstrap`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedRepo: { owner: 'brimdor', repo: 'scribe' },
        settings: {
          environmentName: ' Local ',
          agentBaseUrl: 'http://localhost:11434/v1/',
          agentApiKey: 'secret-key',
          openaiConnectionMethod: 'oauth',
        },
        openAIOAuthPendingFlow: {
          type: 'device',
          deviceAuthId: ' device ',
          userCode: ' code ',
          startedAt: 123,
        },
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(payload).toEqual(expect.objectContaining({
      selectedRepo: { owner: 'brimdor', repo: 'scribe' },
      settings: expect.objectContaining({
        environmentName: 'Local',
        agentBaseUrl: 'http://localhost:11434/v1',
        openaiConnectionMethod: 'oauth',
        agentApiKeyConfigured: true,
      }),
      openAIOAuthPendingFlow: expect.objectContaining({
        deviceAuthId: 'device',
        userCode: 'code',
      }),
    }));
  });
});
