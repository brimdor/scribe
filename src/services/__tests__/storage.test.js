import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsStore = new Map();
const threadStore = new Map();

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (headerName) => (headerName.toLowerCase() === 'content-type' ? 'application/json' : ''),
    },
    json: async () => payload,
  };
}

function emptyResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => '',
    },
    json: async () => {
      throw new Error('No JSON body');
    },
  };
}

function parseUrl(url) {
  return new URL(url, 'http://localhost');
}

function createFetchMock() {
  return vi.fn(async (url, options = {}) => {
    const parsed = parseUrl(url);
    const method = (options.method || 'GET').toUpperCase();
    const path = parsed.pathname;
    const body = options.body ? JSON.parse(options.body) : {};

    if (path.startsWith('/api/storage/settings/')) {
      const key = decodeURIComponent(path.replace('/api/storage/settings/', ''));
      if (method === 'GET') {
        return jsonResponse(200, { value: settingsStore.has(key) ? settingsStore.get(key) : null });
      }
      if (method === 'PUT') {
        settingsStore.set(key, body.value ?? null);
        return emptyResponse(204);
      }
    }

    if (path === '/api/storage/threads' && method === 'POST') {
      threadStore.set(body.id, body);
      return jsonResponse(201, { thread: body });
    }

    if (path.startsWith('/api/storage/threads/') && method === 'PATCH') {
      const threadId = decodeURIComponent(path.replace('/api/storage/threads/', ''));
      const existing = threadStore.get(threadId);
      if (!existing) {
        return jsonResponse(404, { error: 'Thread not found.' });
      }

      const updated = {
        ...existing,
        ...body,
        updatedAt: Date.now(),
      };
      threadStore.set(threadId, updated);
      return jsonResponse(200, { thread: updated });
    }

    throw new Error(`Unhandled fetch request: ${method} ${path}`);
  });
}

describe('storage service', () => {
  beforeEach(() => {
    settingsStore.clear();
    threadStore.clear();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', createFetchMock());
  });

  it('saves and loads normalized app settings', async () => {
    const { getAppSettings, saveAppSettings } = await import('../storage');

    await saveAppSettings({
      environmentName: ' Local ',
      githubOwner: ' brimdor ',
      githubRepo: ' vault ',
      openaiConnectionMethod: ' oauth ',
      agentBaseUrl: 'http://localhost:11434/v1/',
      agentApiKey: ' ',
      agentModel: ' llama3 ',
    });

    await expect(getAppSettings()).resolves.toEqual({
      environmentName: 'Local',
      githubOwner: 'brimdor',
      githubRepo: 'vault',
      openaiConnectionMethod: 'oauth',
      agentBaseUrl: 'http://localhost:11434/v1',
      agentApiKey: '',
      agentModel: 'llama3',
    });
  });

  it('persists normalized oauth session and pending flow values', async () => {
    const {
      getOpenAIOAuthPendingFlow,
      getOpenAIOAuthSession,
      saveOpenAIOAuthPendingFlow,
      saveOpenAIOAuthSession,
    } = await import('../storage');

    await saveOpenAIOAuthSession({
      status: 'connected',
      accessToken: ' access ',
      refreshToken: ' refresh ',
      expiresAt: 12345,
      accountId: ' account ',
      email: ' person@example.com ',
      lastError: ' ',
    });

    await saveOpenAIOAuthPendingFlow({
      codeVerifier: ' verifier ',
      state: ' state ',
      startedAt: 67890,
      returnPath: ' /settings ',
    });

    await expect(getOpenAIOAuthSession()).resolves.toEqual({
      status: 'connected',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 12345,
      accountId: 'account',
      email: 'person@example.com',
      lastError: '',
    });

    await expect(getOpenAIOAuthPendingFlow()).resolves.toEqual({
      type: 'callback',
      codeVerifier: 'verifier',
      state: 'state',
      startedAt: 67890,
      returnPath: '/settings',
    });
  });

  it('updates thread titles and refreshes updatedAt timestamps', async () => {
    const { createThread, updateThread } = await import('../storage');

    await createThread({
      id: 'thread-1',
      title: 'New Chat',
      createdAt: 100,
      updatedAt: 100,
      isPinned: false,
    });

    const updated = await updateThread('thread-1', { title: 'Release Checklist' });

    expect(updated).toEqual(expect.objectContaining({
      id: 'thread-1',
      title: 'Release Checklist',
      isPinned: false,
    }));
    expect(updated.updatedAt).toBeGreaterThanOrEqual(100);
  });
});
