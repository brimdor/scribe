import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { decryptJson, encryptJson } from '../utils/crypto.js';

function now() {
  return Date.now();
}

function deserializeHeartbeat(row) {
  if (!row) {
    return null;
  }

  const checklist = decryptJson(row.checklist_blob) || [];
  return {
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    checklist,
    rating: row.rating,
    status: row.status,
  };
}

function asBooleanInt(value) {
  return value ? 1 : 0;
}

function deserializeThread(row) {
  if (!row) {
    return null;
  }

  const payload = decryptJson(row.title_blob) || {};
  return {
    id: row.id,
    title: payload.title || 'New Chat',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPinned: Boolean(row.is_pinned),
  };
}

function deserializeMessage(row) {
  if (!row) {
    return null;
  }

  const payload = decryptJson(row.payload_blob) || {};
  return {
    id: row.id,
    threadId: row.thread_id,
    role: payload.role || 'assistant',
    content: payload.content || '',
    timestamp: row.timestamp,
    modelMeta: payload.modelMeta || null,
  };
}

function deserializeSchema(row) {
  if (!row) {
    return null;
  }

  const payload = decryptJson(row.payload_blob) || {};
  return {
    ...payload,
    id: row.id,
    name: row.name,
  };
}

export function getSetting(userId, key) {
  const db = getDatabase();
  const row = db
    .prepare('SELECT value_blob FROM settings WHERE user_id = ? AND setting_key = ?')
    .get(userId, key);

  return row ? decryptJson(row.value_blob) : null;
}

export function getSettings(userId, keys) {
  return Object.fromEntries(keys.map((key) => [key, getSetting(userId, key)]));
}

export function setSetting(userId, key, value) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO settings (user_id, setting_key, value_blob, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, setting_key) DO UPDATE SET
      value_blob = excluded.value_blob,
      updated_at = excluded.updated_at
  `).run(userId, key, encryptJson(value), now());
}

export function setSettings(userId, entries) {
  const db = getDatabase();
  const writeSetting = db.prepare(`
    INSERT INTO settings (user_id, setting_key, value_blob, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, setting_key) DO UPDATE SET
      value_blob = excluded.value_blob,
      updated_at = excluded.updated_at
  `);

  const persistSettings = db.transaction((settingEntries) => {
    const timestamp = now();
    for (const [key, value] of settingEntries) {
      writeSetting.run(userId, key, encryptJson(value), timestamp);
    }
  });

  persistSettings(entries);
}

export function listThreads(userId) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, title_blob, is_pinned, created_at, updated_at
    FROM threads
    WHERE user_id = ?
    ORDER BY is_pinned DESC, updated_at DESC
  `).all(userId);

  return rows.map(deserializeThread);
}

export function getThread(userId, threadId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, title_blob, is_pinned, created_at, updated_at
    FROM threads
    WHERE user_id = ? AND id = ?
  `).get(userId, threadId);

  return deserializeThread(row);
}

export function saveThread(userId, thread) {
  const db = getDatabase();
  const existingOwner = db.prepare('SELECT user_id FROM threads WHERE id = ?').get(thread.id);
  if (existingOwner && existingOwner.user_id !== userId) {
    throw new Error('Thread identifier conflict for another user.');
  }

  const createdAt = Number(thread.createdAt) || now();
  const updatedAt = Number(thread.updatedAt) || now();
  const title = typeof thread.title === 'string' && thread.title.trim() ? thread.title.trim() : 'New Chat';

  db.prepare(`
    INSERT INTO threads (id, user_id, title_blob, is_pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title_blob = excluded.title_blob,
      is_pinned = excluded.is_pinned,
      updated_at = excluded.updated_at
  `).run(
    thread.id,
    userId,
    encryptJson({ title }),
    asBooleanInt(thread.isPinned),
    createdAt,
    updatedAt,
  );

  return getThread(userId, thread.id);
}

export function updateThread(userId, threadId, updates) {
  const current = getThread(userId, threadId);
  if (!current) {
    return null;
  }

  const merged = {
    ...current,
    ...updates,
    updatedAt: now(),
  };

  return saveThread(userId, merged);
}

export function deleteThread(userId, threadId) {
  const db = getDatabase();
  db.prepare('DELETE FROM threads WHERE user_id = ? AND id = ?').run(userId, threadId);
}

export function listMessagesByThread(userId, threadId) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT messages.id, messages.thread_id, messages.payload_blob, messages.timestamp
    FROM messages
    INNER JOIN threads ON threads.id = messages.thread_id
    WHERE messages.user_id = ? AND messages.thread_id = ? AND threads.user_id = ?
    ORDER BY messages.timestamp ASC
  `).all(userId, threadId, userId);

  return rows.map(deserializeMessage);
}

export function saveMessage(userId, message) {
  const db = getDatabase();
  const existingOwner = db.prepare('SELECT user_id FROM messages WHERE id = ?').get(message.id);
  if (existingOwner && existingOwner.user_id !== userId) {
    throw new Error('Message identifier conflict for another user.');
  }

  const timestamp = Number(message.timestamp) || now();
  db.prepare(`
    INSERT INTO messages (id, thread_id, user_id, payload_blob, timestamp)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload_blob = excluded.payload_blob,
      timestamp = excluded.timestamp
  `).run(
    message.id,
    message.threadId,
    userId,
    encryptJson({
      role: message.role,
      content: message.content,
      modelMeta: message.modelMeta || null,
    }),
    timestamp,
  );

  updateThread(userId, message.threadId, {});
  return getMessage(userId, message.id);
}

export function getMessage(userId, messageId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, thread_id, payload_blob, timestamp
    FROM messages
    WHERE id = ? AND user_id = ?
  `).get(messageId, userId);

  return deserializeMessage(row);
}

export function updateMessage(userId, messageId, updates) {
  const current = getMessage(userId, messageId);
  if (!current) {
    return null;
  }

  const merged = {
    ...current,
    ...updates,
  };

  return saveMessage(userId, merged);
}

export function deleteMessage(userId, messageId) {
  const db = getDatabase();
  db.prepare('DELETE FROM messages WHERE id = ? AND user_id = ?').run(messageId, userId);
}

export function listSchemas(userId) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, name, payload_blob
    FROM schemas
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId);

  return rows.map(deserializeSchema);
}

export function saveSchema(userId, schema) {
  const db = getDatabase();
  const existingOwner = db.prepare('SELECT user_id FROM schemas WHERE id = ?').get(schema.id);
  if (existingOwner && existingOwner.user_id !== userId) {
    throw new Error('Schema identifier conflict for another user.');
  }

  const schemaName = String(schema.name || '').trim();

  db.prepare(`
    INSERT INTO schemas (id, user_id, name, payload_blob, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      payload_blob = excluded.payload_blob,
      updated_at = excluded.updated_at
  `).run(schema.id, userId, schemaName, encryptJson(schema), now());

  const row = db.prepare(`
    SELECT id, name, payload_blob
    FROM schemas
    WHERE id = ? AND user_id = ?
  `).get(schema.id, userId);

  return deserializeSchema(row);
}

export function listHeartbeats(userId, { limit = 20, offset = 0 } = {}) {
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const rows = db.prepare(`
    SELECT id, started_at, completed_at, checklist_blob, rating, status
    FROM heartbeat_executions
    WHERE user_id = ?
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, safeLimit, safeOffset);

  const countRow = db.prepare('SELECT COUNT(*) as total FROM heartbeat_executions WHERE user_id = ?').get(userId);

  return {
    heartbeats: rows.map(deserializeHeartbeat),
    total: countRow?.total || 0,
  };
}

export function saveHeartbeat(userId, heartbeat) {
  const db = getDatabase();
  const id = heartbeat.id || crypto.randomUUID();
  const startedAt = Number(heartbeat.startedAt) || now();
  const completedAt = Number(heartbeat.completedAt) || now();
  const checklist = Array.isArray(heartbeat.checklist) ? heartbeat.checklist : [];
  const rating = Math.min(Math.max(Number(heartbeat.rating) || 0, 0), 5);
  const status = rating >= 4 ? 'passed' : 'failed';

  db.prepare(`
    INSERT INTO heartbeat_executions (id, user_id, started_at, completed_at, checklist_blob, rating, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, startedAt, completedAt, encryptJson(checklist), rating, status);

  const row = db.prepare(`
    SELECT id, started_at, completed_at, checklist_blob, rating, status
    FROM heartbeat_executions
    WHERE id = ? AND user_id = ?
  `).get(id, userId);

  return deserializeHeartbeat(row);
}

export function getHeartbeat(userId, heartbeatId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, started_at, completed_at, checklist_blob, rating, status
    FROM heartbeat_executions
    WHERE id = ? AND user_id = ?
  `).get(heartbeatId, userId);

  return deserializeHeartbeat(row);
}
