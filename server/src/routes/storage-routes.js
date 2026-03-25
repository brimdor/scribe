import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteMessage,
  deleteThread,
  getSetting,
  getSettings,
  getThread,
  listHeartbeats,
  listMessagesByThread,
  listSchemas,
  listThreads,
  saveHeartbeat,
  saveMessage,
  saveSchema,
  saveThread,
  setSetting,
  setSettings,
  updateMessage,
  updateThread,
} from '../services/storage-store.js';

const router = Router();
const APP_SETTINGS_KEYS = [
  'environmentName',
  'githubOwner',
  'githubRepo',
  'openaiConnectionMethod',
  'agentBaseUrl',
  'agentModel',
];
const BOOTSTRAP_SETTING_KEYS = [
  ...APP_SETTINGS_KEYS,
  'agentApiKey',
  'selectedRepo',
  'openaiOAuthSession',
  'openaiOAuthPendingFlow',
];

function normalizeSettingString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAppSettingsPayload(payload = {}) {
  return Object.fromEntries(APP_SETTINGS_KEYS.map((key) => {
    const nextValue = normalizeSettingString(payload[key]);

    if (key === 'openaiConnectionMethod') {
      return [key, nextValue === 'oauth' ? 'oauth' : 'manual'];
    }

    if (key === 'agentBaseUrl') {
      return [key, nextValue.replace(/\/+$/, '')];
    }

    return [key, nextValue];
  }));
}

function normalizeOpenAIOAuthSession(session) {
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
    accessToken: normalizeSettingString(session.accessToken),
    refreshToken: normalizeSettingString(session.refreshToken),
    expiresAt: Number.isFinite(session.expiresAt) ? Number(session.expiresAt) : 0,
    accountId: normalizeSettingString(session.accountId),
    email: normalizeSettingString(session.email),
    lastError: normalizeSettingString(session.lastError),
  };

  if (!normalized.refreshToken && !normalized.accessToken && normalized.status !== 'connecting') {
    return null;
  }

  return normalized;
}

function normalizeOpenAIOAuthPendingFlow(flow) {
  if (!flow || typeof flow !== 'object') {
    return null;
  }

  if (flow.type === 'device' || (!flow.codeVerifier && flow.deviceAuthId)) {
    const normalized = {
      type: 'device',
      startedAt: Number.isFinite(flow.startedAt) ? Number(flow.startedAt) : 0,
      returnPath: normalizeSettingString(flow.returnPath) || '/',
      deviceAuthId: normalizeSettingString(flow.deviceAuthId),
      userCode: normalizeSettingString(flow.userCode),
      verificationUrl: normalizeSettingString(flow.verificationUrl) || 'https://auth.openai.com/codex/device',
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
    codeVerifier: normalizeSettingString(flow.codeVerifier),
    state: normalizeSettingString(flow.state),
    startedAt: Number.isFinite(flow.startedAt) ? Number(flow.startedAt) : 0,
    returnPath: normalizeSettingString(flow.returnPath) || '/',
  };

  if (!normalized.codeVerifier || !normalized.state || !normalized.startedAt) {
    return null;
  }

  return normalized;
}

function buildAppSettingsFromValues(values) {
  const settings = Object.fromEntries(
    APP_SETTINGS_KEYS.map((key) => [key, normalizeSettingString(values[key])]),
  );

  return {
    ...settings,
    openaiConnectionMethod: settings.openaiConnectionMethod === 'oauth' ? 'oauth' : 'manual',
    agentBaseUrl: settings.agentBaseUrl.replace(/\/+$/, ''),
    agentApiKey: '',
    agentApiKeyConfigured: Boolean(normalizeSettingString(values.agentApiKey)),
  };
}

function buildAppSettings(userId) {
  return buildAppSettingsFromValues(getSettings(userId, [...APP_SETTINGS_KEYS, 'agentApiKey']));
}

function buildBootstrapPayload(req) {
  const values = getSettings(req.auth.userId, BOOTSTRAP_SETTING_KEYS);

  return {
    user: req.auth.user,
    selectedRepo: values.selectedRepo ?? null,
    settings: buildAppSettingsFromValues(values),
    openAIOAuthSession: normalizeOpenAIOAuthSession(values.openaiOAuthSession),
    openAIOAuthPendingFlow: normalizeOpenAIOAuthPendingFlow(values.openaiOAuthPendingFlow),
  };
}

function persistBootstrapPayload(userId, payload = {}) {
  const entries = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'settings')) {
    const normalizedSettings = normalizeAppSettingsPayload(payload.settings || {});
    for (const key of APP_SETTINGS_KEYS) {
      entries.push([key, normalizedSettings[key]]);
    }

    if (payload.settings?.clearAgentApiKey) {
      entries.push(['agentApiKey', '']);
    } else if (typeof payload.settings?.agentApiKey === 'string' && payload.settings.agentApiKey.trim()) {
      entries.push(['agentApiKey', payload.settings.agentApiKey.trim()]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'selectedRepo')) {
    entries.push(['selectedRepo', payload.selectedRepo ?? null]);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'openAIOAuthSession')) {
    entries.push(['openaiOAuthSession', normalizeOpenAIOAuthSession(payload.openAIOAuthSession)]);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'openAIOAuthPendingFlow')) {
    entries.push(['openaiOAuthPendingFlow', normalizeOpenAIOAuthPendingFlow(payload.openAIOAuthPendingFlow)]);
  }

  if (entries.length) {
    setSettings(userId, entries);
  }
}

router.use(requireAuth);

router.get('/bootstrap', (req, res) => {
  res.status(200).json(buildBootstrapPayload(req));
});

router.put('/bootstrap', (req, res) => {
  persistBootstrapPayload(req.auth.userId, req.body || {});
  res.status(200).json(buildBootstrapPayload(req));
});

router.get('/app-settings', (req, res) => {
  res.status(200).json({ settings: buildAppSettings(req.auth.userId) });
});

router.put('/app-settings', (req, res) => {
  const userId = req.auth.userId;
  persistBootstrapPayload(userId, { settings: req.body || {} });

  res.status(200).json({ settings: buildAppSettings(userId) });
});

router.get('/settings/:key', (req, res) => {
  if (req.params.key === 'agentApiKey') {
    res.status(403).json({ error: 'Manual provider secrets are write-only.' });
    return;
  }

  const value = getSetting(req.auth.userId, req.params.key);
  res.status(200).json({ value });
});

router.put('/settings/:key', (req, res) => {
  setSetting(req.auth.userId, req.params.key, req.body?.value ?? null);
  res.status(204).end();
});

router.get('/threads', (req, res) => {
  const threads = listThreads(req.auth.userId);
  res.status(200).json({ threads });
});

router.post('/threads', (req, res) => {
  const thread = req.body || {};
  if (!thread.id) {
    res.status(400).json({ error: 'Thread id is required.' });
    return;
  }

  const saved = saveThread(req.auth.userId, thread);
  res.status(201).json({ thread: saved });
});

router.get('/threads/:threadId', (req, res) => {
  const thread = getThread(req.auth.userId, req.params.threadId);
  if (!thread) {
    res.status(404).json({ error: 'Thread not found.' });
    return;
  }

  res.status(200).json({ thread });
});

router.patch('/threads/:threadId', (req, res) => {
  const updated = updateThread(req.auth.userId, req.params.threadId, req.body || {});
  if (!updated) {
    res.status(404).json({ error: 'Thread not found.' });
    return;
  }

  res.status(200).json({ thread: updated });
});

router.delete('/threads/:threadId', (req, res) => {
  deleteThread(req.auth.userId, req.params.threadId);
  res.status(204).end();
});

router.get('/threads/:threadId/messages', (req, res) => {
  const messages = listMessagesByThread(req.auth.userId, req.params.threadId);
  res.status(200).json({ messages });
});

router.post('/messages', (req, res) => {
  const message = req.body || {};
  if (!message.id || !message.threadId) {
    res.status(400).json({ error: 'Message id and threadId are required.' });
    return;
  }

  const saved = saveMessage(req.auth.userId, message);
  res.status(201).json({ message: saved });
});

router.patch('/messages/:messageId', (req, res) => {
  const updated = updateMessage(req.auth.userId, req.params.messageId, req.body || {});
  if (!updated) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }

  res.status(200).json({ message: updated });
});

router.delete('/messages/:messageId', (req, res) => {
  deleteMessage(req.auth.userId, req.params.messageId);
  res.status(204).end();
});

router.get('/schemas', (req, res) => {
  const schemas = listSchemas(req.auth.userId);
  res.status(200).json({ schemas });
});

router.put('/schemas/:schemaId', (req, res) => {
  const schema = {
    ...(req.body || {}),
    id: req.params.schemaId,
  };

  if (!schema.name) {
    res.status(400).json({ error: 'Schema name is required.' });
    return;
  }

  const saved = saveSchema(req.auth.userId, schema);
  res.status(201).json({ schema: saved });
});

router.get('/heartbeats', (req, res) => {
  const limit = req.query.limit;
  const offset = req.query.offset;
  const result = listHeartbeats(req.auth.userId, { limit, offset });
  res.status(200).json(result);
});

router.post('/heartbeats', (req, res) => {
  const body = req.body || {};
  if (!body.startedAt || !body.completedAt) {
    res.status(400).json({ error: 'startedAt and completedAt are required.' });
    return;
  }

  if (!Array.isArray(body.checklist)) {
    res.status(400).json({ error: 'checklist array is required.' });
    return;
  }

  if (typeof body.rating !== 'number' || body.rating < 0 || body.rating > 5) {
    res.status(400).json({ error: 'rating must be a number between 0 and 5.' });
    return;
  }

  const heartbeat = saveHeartbeat(req.auth.userId, body);
  res.status(201).json({ heartbeat });
});

export default router;
