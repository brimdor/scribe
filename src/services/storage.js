import { ApiError, apiRequest } from './api';

export const DEFAULT_APP_SETTINGS = {
  environmentName: '',
  githubOwner: '',
  githubRepo: '',
  openaiConnectionMethod: 'manual',
  agentBaseUrl: '',
  agentApiKey: '',
  agentApiKeyConfigured: false,
  agentModel: '',
  heartbeatEnabled: false,
  heartbeatIntervalMinutes: 60,
  agentVerbosity: 'detailed',
  agentAutoPublish: 'ask',
};

const OPENAI_OAUTH_SESSION_KEY = 'openaiOAuthSession';
const OPENAI_OAUTH_PENDING_FLOW_KEY = 'openaiOAuthPendingFlow';

function normalizeBootstrapPayload(payload = {}) {
  return {
    user: payload.user || null,
    selectedRepo: payload.selectedRepo || null,
    settings: normalizeAppSettings(payload.settings),
    openAIOAuthSession: normalizeOpenAIOAuthSession(payload.openAIOAuthSession),
    openAIOAuthPendingFlow: normalizeOpenAIOAuthPendingFlow(payload.openAIOAuthPendingFlow),
  };
}

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

export async function getBootstrapData() {
  const response = await apiRequest('/api/storage/bootstrap');
  return normalizeBootstrapPayload(response);
}

export async function saveBootstrapData(payload) {
  const response = await apiRequest('/api/storage/bootstrap', {
    method: 'PUT',
    body: payload,
  });
  return normalizeBootstrapPayload(response);
}

export function normalizeAppSettings(settings = {}) {
  const normalizedEntries = Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value ?? '']),
  );

  const heartbeatInterval = Number(normalizedEntries.heartbeatIntervalMinutes);

  return {
    ...DEFAULT_APP_SETTINGS,
    ...normalizedEntries,
    openaiConnectionMethod: normalizedEntries.openaiConnectionMethod === 'oauth' ? 'oauth' : 'manual',
    agentBaseUrl: typeof settings.agentBaseUrl === 'string'
      ? settings.agentBaseUrl.trim().replace(/\/+$/, '')
      : '',
    agentApiKey: typeof settings.agentApiKey === 'string' ? settings.agentApiKey.trim() : '',
    agentApiKeyConfigured: Boolean(settings.agentApiKeyConfigured),
    heartbeatEnabled: normalizedEntries.heartbeatEnabled === true || normalizedEntries.heartbeatEnabled === 'true',
    heartbeatIntervalMinutes: Number.isFinite(heartbeatInterval) && heartbeatInterval >= 15 && heartbeatInterval <= 1440
      ? heartbeatInterval
      : 60,
    agentVerbosity: normalizedEntries.agentVerbosity === 'concise' ? 'concise' : 'detailed',
    agentAutoPublish: ['ask', 'auto', 'never'].includes(normalizedEntries.agentAutoPublish)
      ? normalizedEntries.agentAutoPublish
      : 'ask',
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
  const response = await apiRequest('/api/storage/app-settings');
  return normalizeAppSettings(response.settings);
}

export async function saveAppSettings(settings) {
  const normalized = normalizeAppSettings(settings);
  const response = await apiRequest('/api/storage/app-settings', {
    method: 'PUT',
    body: {
      ...normalized,
      clearAgentApiKey: Boolean(settings.clearAgentApiKey),
    },
  });
  return normalizeAppSettings(response.settings);
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

export async function getHeartbeats({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));

  const response = await apiRequest(`/api/storage/heartbeats?${params.toString()}`);
  return response;
}

export async function saveHeartbeatResult(heartbeat) {
  const response = await apiRequest('/api/storage/heartbeats', {
    method: 'POST',
    body: heartbeat,
  });
  return response.heartbeat;
}
