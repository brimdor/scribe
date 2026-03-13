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

    if (path === '/api/storage/app-settings') {
      if (method === 'GET') {
        return jsonResponse(200, {
          settings: {
            environmentName: settingsStore.get('environmentName') || '',
            githubOwner: settingsStore.get('githubOwner') || '',
            githubRepo: settingsStore.get('githubRepo') || '',
            openaiConnectionMethod: settingsStore.get('openaiConnectionMethod') || 'manual',
            agentBaseUrl: settingsStore.get('agentBaseUrl') || '',
            agentApiKey: '',
            agentApiKeyConfigured: Boolean(settingsStore.get('agentApiKey')),
            agentModel: settingsStore.get('agentModel') || '',
          },
        });
      }

      if (method === 'PUT') {
        settingsStore.set('environmentName', body.environmentName || '');
        settingsStore.set('githubOwner', body.githubOwner || '');
        settingsStore.set('githubRepo', body.githubRepo || '');
        settingsStore.set('openaiConnectionMethod', body.openaiConnectionMethod || 'manual');
        settingsStore.set('agentBaseUrl', body.agentBaseUrl || '');
        settingsStore.set('agentModel', body.agentModel || '');
        if (body.clearAgentApiKey) {
          settingsStore.set('agentApiKey', '');
        } else if (typeof body.agentApiKey === 'string' && body.agentApiKey.trim()) {
          settingsStore.set('agentApiKey', body.agentApiKey.trim());
        }

        return jsonResponse(200, {
          settings: {
            environmentName: settingsStore.get('environmentName') || '',
            githubOwner: settingsStore.get('githubOwner') || '',
            githubRepo: settingsStore.get('githubRepo') || '',
            openaiConnectionMethod: settingsStore.get('openaiConnectionMethod') || 'manual',
            agentBaseUrl: settingsStore.get('agentBaseUrl') || '',
            agentApiKey: '',
            agentApiKeyConfigured: Boolean(settingsStore.get('agentApiKey')),
            agentModel: settingsStore.get('agentModel') || '',
          },
        });
      }
    }

    if (path === '/api/storage/bootstrap') {
      if (method === 'GET') {
        return jsonResponse(200, {
          user: { id: 'user-1', login: 'brimdor' },
          selectedRepo: settingsStore.get('selectedRepo') || null,
          settings: {
            environmentName: settingsStore.get('environmentName') || '',
            githubOwner: settingsStore.get('githubOwner') || '',
            githubRepo: settingsStore.get('githubRepo') || '',
            openaiConnectionMethod: settingsStore.get('openaiConnectionMethod') || 'manual',
            agentBaseUrl: settingsStore.get('agentBaseUrl') || '',
            agentApiKey: '',
            agentApiKeyConfigured: Boolean(settingsStore.get('agentApiKey')),
            agentModel: settingsStore.get('agentModel') || '',
          },
          openAIOAuthSession: settingsStore.get('openaiOAuthSession') || null,
          openAIOAuthPendingFlow: settingsStore.get('openaiOAuthPendingFlow') || null,
        });
      }

      if (method === 'PUT') {
        if (body.settings) {
          settingsStore.set('environmentName', body.settings.environmentName || '');
          settingsStore.set('githubOwner', body.settings.githubOwner || '');
          settingsStore.set('githubRepo', body.settings.githubRepo || '');
          settingsStore.set('openaiConnectionMethod', body.settings.openaiConnectionMethod || 'manual');
          settingsStore.set('agentBaseUrl', body.settings.agentBaseUrl || '');
          settingsStore.set('agentModel', body.settings.agentModel || '');
          if (body.settings.clearAgentApiKey) {
            settingsStore.set('agentApiKey', '');
          } else if (typeof body.settings.agentApiKey === 'string' && body.settings.agentApiKey.trim()) {
            settingsStore.set('agentApiKey', body.settings.agentApiKey.trim());
          }
        }

        if (Object.prototype.hasOwnProperty.call(body, 'selectedRepo')) {
          settingsStore.set('selectedRepo', body.selectedRepo ?? null);
        }

        if (Object.prototype.hasOwnProperty.call(body, 'openAIOAuthSession')) {
          settingsStore.set('openaiOAuthSession', body.openAIOAuthSession ?? null);
        }

        if (Object.prototype.hasOwnProperty.call(body, 'openAIOAuthPendingFlow')) {
          settingsStore.set('openaiOAuthPendingFlow', body.openAIOAuthPendingFlow ?? null);
        }

        return jsonResponse(200, {
          user: { id: 'user-1', login: 'brimdor' },
          selectedRepo: settingsStore.get('selectedRepo') || null,
          settings: {
            environmentName: settingsStore.get('environmentName') || '',
            githubOwner: settingsStore.get('githubOwner') || '',
            githubRepo: settingsStore.get('githubRepo') || '',
            openaiConnectionMethod: settingsStore.get('openaiConnectionMethod') || 'manual',
            agentBaseUrl: settingsStore.get('agentBaseUrl') || '',
            agentApiKey: '',
            agentApiKeyConfigured: Boolean(settingsStore.get('agentApiKey')),
            agentModel: settingsStore.get('agentModel') || '',
          },
          openAIOAuthSession: settingsStore.get('openaiOAuthSession') || null,
          openAIOAuthPendingFlow: settingsStore.get('openaiOAuthPendingFlow') || null,
        });
      }
    }

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
      agentApiKeyConfigured: false,
      agentModel: 'llama3',
    });
  });

  it('does not return a saved manual api key to the browser', async () => {
    const { getAppSettings, saveAppSettings } = await import('../storage');

    await saveAppSettings({
      agentBaseUrl: 'http://localhost:11434/v1',
      agentApiKey: 'secret-key',
      agentModel: 'gpt-4o-mini',
    });

    await expect(getAppSettings()).resolves.toEqual(expect.objectContaining({
      agentApiKey: '',
      agentApiKeyConfigured: true,
      agentBaseUrl: 'http://localhost:11434/v1',
      agentModel: 'gpt-4o-mini',
    }));
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

  it('loads and saves bootstrap data in one payload', async () => {
    const { getBootstrapData, saveBootstrapData } = await import('../storage');

    const saved = await saveBootstrapData({
      selectedRepo: { owner: 'brimdor', repo: 'scribe' },
      settings: {
        environmentName: ' Local ',
        openaiConnectionMethod: 'oauth',
      },
      openAIOAuthSession: {
        status: 'connected',
        accessToken: ' access ',
        refreshToken: ' refresh ',
        expiresAt: 123,
      },
      openAIOAuthPendingFlow: {
        type: 'device',
        deviceAuthId: ' device ',
        userCode: ' code ',
        startedAt: 456,
      },
    });

    expect(saved).toEqual(expect.objectContaining({
      user: { id: 'user-1', login: 'brimdor' },
      selectedRepo: { owner: 'brimdor', repo: 'scribe' },
      settings: expect.objectContaining({
        environmentName: 'Local',
        openaiConnectionMethod: 'oauth',
      }),
      openAIOAuthSession: expect.objectContaining({
        accessToken: 'access',
        refreshToken: 'refresh',
      }),
      openAIOAuthPendingFlow: expect.objectContaining({
        type: 'device',
        deviceAuthId: 'device',
        userCode: 'code',
      }),
    }));

    await expect(getBootstrapData()).resolves.toEqual(saved);
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
