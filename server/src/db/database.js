import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getConfig } from '../config/env.js';

let dbInstance = null;

function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

function migrateToV1(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      profile_blob TEXT NOT NULL,
      token_blob TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      value_blob TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, setting_key),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title_blob TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payload_blob TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schemas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      payload_blob TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON threads(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_thread_time ON messages(thread_id, timestamp ASC);
    CREATE INDEX IF NOT EXISTS idx_schemas_user_name ON schemas(user_id, name);
  `);

  db.pragma('user_version = 1');
}

function runMigrations(db) {
  const currentVersion = db.pragma('user_version', { simple: true });
  if (currentVersion < 1) {
    migrateToV1(db);
  }
}

export function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const { dbPath } = getConfig();
  ensureDirectory(dbPath);

  dbInstance = new Database(dbPath);
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('journal_mode = WAL');
  runMigrations(dbInstance);

  return dbInstance;
}
