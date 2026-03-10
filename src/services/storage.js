import { openDB } from 'idb';
import { DB_NAME, DB_VERSION } from '../utils/constants';

let dbPromise = null;

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

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Threads store
        if (!db.objectStoreNames.contains('threads')) {
          const threadStore = db.createObjectStore('threads', { keyPath: 'id' });
          threadStore.createIndex('createdAt', 'createdAt');
          threadStore.createIndex('updatedAt', 'updatedAt');
          threadStore.createIndex('isPinned', 'isPinned');
        }

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('threadId', 'threadId');
          messageStore.createIndex('timestamp', 'timestamp');
        }

        // Custom schemas store
        if (!db.objectStoreNames.contains('schemas')) {
          const schemaStore = db.createObjectStore('schemas', { keyPath: 'id' });
          schemaStore.createIndex('name', 'name', { unique: true });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ──── Thread Operations ────

export async function getAllThreads() {
  const db = await getDB();
  const threads = await db.getAll('threads');
  return threads.sort((a, b) => {
    // Pinned first, then by updatedAt descending
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function getThread(id) {
  const db = await getDB();
  return db.get('threads', id);
}

export async function createThread(thread) {
  const db = await getDB();
  await db.put('threads', thread);
  return thread;
}

export async function updateThread(id, updates) {
  const db = await getDB();
  const thread = await db.get('threads', id);
  if (!thread) return null;
  const updated = { ...thread, ...updates, updatedAt: Date.now() };
  await db.put('threads', updated);
  return updated;
}

export async function deleteThread(id) {
  const db = await getDB();
  // Delete all messages in this thread
  const messages = await getMessagesByThread(id);
  const tx = db.transaction(['threads', 'messages'], 'readwrite');
  for (const msg of messages) {
    await tx.objectStore('messages').delete(msg.id);
  }
  await tx.objectStore('threads').delete(id);
  await tx.done;
}

// ──── Message Operations ────

export async function getMessagesByThread(threadId) {
  const db = await getDB();
  const index = db.transaction('messages').store.index('threadId');
  const messages = await index.getAll(threadId);
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export async function addMessage(message) {
  const db = await getDB();
  await db.put('messages', message);
  // Update thread's updatedAt
  await updateThread(message.threadId, {});
  return message;
}

export async function updateMessage(id, updates) {
  const db = await getDB();
  const msg = await db.get('messages', id);
  if (!msg) return null;
  const updated = { ...msg, ...updates };
  await db.put('messages', updated);
  return updated;
}

export async function deleteMessage(id) {
  const db = await getDB();
  await db.delete('messages', id);
}

// ──── Settings Operations ────

export async function getSetting(key) {
  const db = await getDB();
  const setting = await db.get('settings', key);
  return setting?.value ?? null;
}

export async function setSetting(key, value) {
  const db = await getDB();
  await db.put('settings', { key, value });
}

export function normalizeAppSettings(settings = {}) {
  const normalizedEntries = Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value ?? ''])
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
    status: session.status === 'error' ? 'error' : session.status === 'connecting' ? 'connecting' : session.status === 'connected' ? 'connected' : 'disconnected',
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
      verificationUrl: typeof flow.verificationUrl === 'string' && flow.verificationUrl.trim() ? flow.verificationUrl.trim() : 'https://auth.openai.com/codex/device',
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
    Object.entries(normalized).map(([key, value]) => setSetting(key, value))
  );
  return normalized;
}

export async function getOpenAIOAuthSession() {
  return normalizeOpenAIOAuthSession(await getSetting(OPENAI_OAUTH_SESSION_KEY));
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
  return normalizeOpenAIOAuthPendingFlow(await getSetting(OPENAI_OAUTH_PENDING_FLOW_KEY));
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

// ──── Schema Operations ────

export async function getCustomSchemas() {
  const db = await getDB();
  return db.getAll('schemas');
}

export async function saveSchema(schema) {
  const db = await getDB();
  await db.put('schemas', schema);
  return schema;
}
