import { openDB } from 'idb';
import { DB_NAME, DB_VERSION } from '../utils/constants';

let dbPromise = null;

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
