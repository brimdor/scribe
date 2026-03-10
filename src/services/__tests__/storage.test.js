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
      agentBaseUrl: 'http://localhost:11434/v1/',
      agentApiKey: ' ',
      agentModel: ' llama3 ',
    });

    await expect(getAppSettings()).resolves.toEqual({
      environmentName: 'Local',
      githubOwner: 'brimdor',
      githubRepo: 'vault',
      agentBaseUrl: 'http://localhost:11434/v1',
      agentApiKey: '',
      agentModel: 'llama3',
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
