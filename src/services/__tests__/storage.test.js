import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    objectStoreNames: { contains: () => true },
    get: async (_name, key) => store.get(key),
    put: async (_name, value) => {
      store.set(value.key, value);
    },
  })),
}));

describe('storage settings helpers', () => {
  beforeEach(() => {
    store.clear();
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
});
