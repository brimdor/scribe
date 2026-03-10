import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = {
  settings: new Map(),
  threads: new Map(),
};

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    objectStoreNames: { contains: () => true },
    get: async (storeName, key) => stores[storeName].get(key),
    put: async (storeName, value) => {
      const key = value.key ?? value.id;
      stores[storeName].set(key, value);
    },
  })),
}));

describe('storage settings helpers', () => {
  beforeEach(() => {
    Object.values(stores).forEach((store) => store.clear());
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

  it('persists normalized oauth session and callback pending flow values', async () => {
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

  it('persists normalized device pending flow values', async () => {
    const {
      getOpenAIOAuthPendingFlow,
      saveOpenAIOAuthPendingFlow,
    } = await import('../storage');

    await saveOpenAIOAuthPendingFlow({
      type: 'device',
      deviceAuthId: ' device-auth-123 ',
      userCode: ' CODE-1234 ',
      verificationUrl: ' https://auth.openai.com/codex/device ',
      intervalMs: 7000,
      expiresAt: 99999,
      startedAt: 67890,
      returnPath: ' /settings ',
    });

    await expect(getOpenAIOAuthPendingFlow()).resolves.toEqual({
      type: 'device',
      deviceAuthId: 'device-auth-123',
      userCode: 'CODE-1234',
      verificationUrl: 'https://auth.openai.com/codex/device',
      intervalMs: 7000,
      expiresAt: 99999,
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
