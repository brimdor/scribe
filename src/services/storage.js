import { ApiError, apiRequest } from './api';

export const DEFAULT_APP_SETTINGS = {
  environmentName: '',
  githubOwner: '',
  githubRepo: '',
  openaiConnectionMethod: 'manual',
  agentBaseUrl: '',
  agentApiKey: '',
  agentModel: '',
};

const OPENAI_OAUTH_SESSION_KEY = 'openaiOAuthSession';
const OPENAI_OAUTH_PENDING_FLOW_KEY = 'openaiOAuthPendingFlow';

function isAuthError(error) {
  return error instanceof ApiError && error.status === 401;
}

async function requestValueOrNull(request) {
  try {
    return await request();
  } catch (error) {
    if (isAuthError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getAllThreads() {
  const response = await apiRequest('/api/storage/threads');
  return response.threads;
}

export async function getThread(id) {
  try {
    const response = await apiRequest(`/api/storage/threads/${encodeURIComponent(id)}`);
    return response.thread;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function createThread(thread) {
  const response = await apiRequest('/api/storage/threads', {
    method: 'POST',
    body: thread,
  });
  return response.thread;
}

export async function updateThread(id, updates) {
  try {
    const response = await apiRequest(`/api/storage/threads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: updates,
    });
    return response.thread;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function deleteThread(id) {
  await apiRequest(`/api/storage/threads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getMessagesByThread(threadId) {
  const response = await apiRequest(`/api/storage/threads/${encodeURIComponent(threadId)}/messages`);
  return response.messages;
}

export async function addMessage(message) {
  const response = await apiRequest('/api/storage/messages', {
    method: 'POST',
    body: message,
  });
  return response.message;
}

export async function updateMessage(id, updates) {
  try {
    const response = await apiRequest(`/api/storage/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: updates,
    });
    return response.message;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function deleteMessage(id) {
  await apiRequest(`/api/storage/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getSetting(key) {
  const value = await requestValueOrNull(async () => {
    const response = await apiRequest(`/api/storage/settings/${encodeURIComponent(key)}`);
    return response.value;
  });

  return value;
}

export async function setSetting(key, value) {
  await apiRequest(`/api/storage/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { value },
  });
}

export function normalizeAppSettings(settings = {}) {
  const normalizedEntries = Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value ?? '']),
  );

  return {
    ...DEFAULT_APP_SETTINGS,
    ...normalizedEntries,
    openaiConnectionMethod: normalizedEntries.openaiConnectionMethod === 'oauth' ? 'oauth' : 'manual',
    agentBaseUrl: typeof settings.agentBaseUrl === 'string'
      ? settings.agentBaseUrl.trim().replace(/\/+$/, '')
      : '',
  };
}

export function normalizeOpenAIOAuthSession(session = null) {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const normalized = {
    status: session.status === 'error'
      ? 'error'
      : session.status === 'connecting'
        ? 'connecting'
        : session.status === 'connected'
          ? 'connected'
          : 'disconnected',
    accessToken: typeof session.accessToken === 'string' ? session.accessToken.trim() : '',
    refreshToken: typeof session.refreshToken === 'string' ? session.refreshToken.trim() : '',
    expiresAt: Number.isFinite(session.expiresAt) ? Number(session.expiresAt) : 0,
    accountId: typeof session.accountId === 'string' ? session.accountId.trim() : '',
    email: typeof session.email === 'string' ? session.email.trim() : '',
    lastError: typeof session.lastError === 'string' ? session.lastError.trim() : '',
  };

  if (!normalized.refreshToken && !normalized.accessToken && normalized.status !== 'connecting') {
    return null;
  }

  return normalized;
}

export function normalizeOpenAIOAuthPendingFlow(flow = null) {
  if (!flow || typeof flow !== 'object') {
    return null;
  }

  if (flow.type === 'device' || (!flow.codeVerifier && flow.deviceAuthId)) {
    const normalized = {
      type: 'device',
      startedAt: Number.isFinite(flow.startedAt) ? Number(flow.startedAt) : 0,
      returnPath: typeof flow.returnPath === 'string' && flow.returnPath.trim() ? flow.returnPath.trim() : '/',
      deviceAuthId: typeof flow.deviceAuthId === 'string' ? flow.deviceAuthId.trim() : '',
      userCode: typeof flow.userCode === 'string' ? flow.userCode.trim() : '',
      verificationUrl: typeof flow.verificationUrl === 'string' && flow.verificationUrl.trim()
        ? flow.verificationUrl.trim()
        : 'https://auth.openai.com/codex/device',
      intervalMs: Number.isFinite(flow.intervalMs) && Number(flow.intervalMs) > 0 ? Number(flow.intervalMs) : 5000,
      expiresAt: Number.isFinite(flow.expiresAt) ? Number(flow.expiresAt) : 0,
    };

    if (!normalized.deviceAuthId || !normalized.userCode || !normalized.startedAt) {
      return null;
    }

    return normalized;
  }

  const normalized = {
    type: 'callback',
    codeVerifier: typeof flow.codeVerifier === 'string' ? flow.codeVerifier.trim() : '',
    state: typeof flow.state === 'string' ? flow.state.trim() : '',
    startedAt: Number.isFinite(flow.startedAt) ? Number(flow.startedAt) : 0,
    returnPath: typeof flow.returnPath === 'string' && flow.returnPath.trim() ? flow.returnPath.trim() : '/',
  };

  if (!normalized.codeVerifier || !normalized.state || !normalized.startedAt) {
    return null;
  }

  return normalized;
}

export async function getAppSettings() {
  const keys = Object.keys(DEFAULT_APP_SETTINGS);
  const entries = await Promise.all(keys.map(async (key) => [key, await getSetting(key)]));
  return normalizeAppSettings(Object.fromEntries(entries));
}

export async function saveAppSettings(settings) {
  const normalized = normalizeAppSettings(settings);
  await Promise.all(
    Object.entries(normalized).map(([key, value]) => setSetting(key, value)),
  );
  return normalized;
}

export async function getOpenAIOAuthSession() {
  const session = await getSetting(OPENAI_OAUTH_SESSION_KEY);
  return normalizeOpenAIOAuthSession(session);
}

export async function saveOpenAIOAuthSession(session) {
  const normalized = normalizeOpenAIOAuthSession(session);
  if (!normalized) {
    await clearOpenAIOAuthSession();
    return null;
  }

  await setSetting(OPENAI_OAUTH_SESSION_KEY, normalized);
  return normalized;
}

export async function clearOpenAIOAuthSession() {
  await setSetting(OPENAI_OAUTH_SESSION_KEY, null);
}

export async function getOpenAIOAuthPendingFlow() {
  const pendingFlow = await getSetting(OPENAI_OAUTH_PENDING_FLOW_KEY);
  return normalizeOpenAIOAuthPendingFlow(pendingFlow);
}

export async function saveOpenAIOAuthPendingFlow(flow) {
  const normalized = normalizeOpenAIOAuthPendingFlow(flow);
  if (!normalized) {
    await clearOpenAIOAuthPendingFlow();
    return null;
  }

  await setSetting(OPENAI_OAUTH_PENDING_FLOW_KEY, normalized);
  return normalized;
}

export async function clearOpenAIOAuthPendingFlow() {
  await setSetting(OPENAI_OAUTH_PENDING_FLOW_KEY, null);
}

export async function getCustomSchemas() {
  const response = await requestValueOrNull(async () => apiRequest('/api/storage/schemas'));
  return response?.schemas || [];
}

export async function saveSchema(schema) {
  const response = await apiRequest(`/api/storage/schemas/${encodeURIComponent(schema.id)}`, {
    method: 'PUT',
    body: schema,
  });
  return response.schema;
}
