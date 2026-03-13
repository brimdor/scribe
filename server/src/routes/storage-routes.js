import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteMessage,
  deleteThread,
  getSetting,
  getThread,
  listMessagesByThread,
  listSchemas,
  listThreads,
  saveMessage,
  saveSchema,
  saveThread,
  setSetting,
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

function normalizeSettingString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildAppSettings(userId) {
  const settings = Object.fromEntries(
    APP_SETTINGS_KEYS.map((key) => [key, normalizeSettingString(getSetting(userId, key))]),
  );

  return {
    ...settings,
    openaiConnectionMethod: settings.openaiConnectionMethod === 'oauth' ? 'oauth' : 'manual',
    agentBaseUrl: settings.agentBaseUrl.replace(/\/+$/, ''),
    agentApiKey: '',
    agentApiKeyConfigured: Boolean(normalizeSettingString(getSetting(userId, 'agentApiKey'))),
  };
}

router.use(requireAuth);

router.get('/app-settings', (req, res) => {
  res.status(200).json({ settings: buildAppSettings(req.auth.userId) });
});

router.put('/app-settings', (req, res) => {
  const userId = req.auth.userId;
  const payload = req.body || {};

  for (const key of APP_SETTINGS_KEYS) {
    const nextValue = normalizeSettingString(payload[key]);
    if (key === 'openaiConnectionMethod') {
      setSetting(userId, key, nextValue === 'oauth' ? 'oauth' : 'manual');
      continue;
    }

    if (key === 'agentBaseUrl') {
      setSetting(userId, key, nextValue.replace(/\/+$/, ''));
      continue;
    }

    setSetting(userId, key, nextValue);
  }

  if (payload.clearAgentApiKey) {
    setSetting(userId, 'agentApiKey', '');
  } else {
    const nextApiKey = normalizeSettingString(payload.agentApiKey);
    if (nextApiKey) {
      setSetting(userId, 'agentApiKey', nextApiKey);
    }
  }

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

export default router;
