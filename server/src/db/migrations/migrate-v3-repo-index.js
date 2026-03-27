import { runMigrations } from '../database.js';

export const SCHEMA_VERSION = 3;

export function migrateToV3(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repo_index_entries (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      owner           TEXT NOT NULL,
      repo            TEXT NOT NULL,
      path            TEXT NOT NULL,
      title           TEXT NOT NULL DEFAULT '',
      tags            TEXT NOT NULL DEFAULT '[]',
      headings        TEXT NOT NULL DEFAULT '[]',
      content_snippet TEXT NOT NULL DEFAULT '',
      modified_at     TEXT NOT NULL,
      indexed_at      TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_entry_lookup
      ON repo_index_entries(user_id, owner, repo, path);

    CREATE TABLE IF NOT EXISTS repo_index_meta (
      user_id      TEXT NOT NULL,
      owner        TEXT NOT NULL,
      repo         TEXT NOT NULL,
      indexed_head TEXT NOT NULL DEFAULT '',
      indexed_at   TEXT NOT NULL,
      entry_count  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, owner, repo)
    );
  `);

  // FTS5 virtual table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS repo_index_fts USING fts5(
      path,
      title,
      tags,
      headings,
      content_snippet,
      content='repo_index_entries',
      content_rowid='rowid'
    );
  `);

  db.pragma('user_version = 3');
}

export function runIndexMigrations(db) {
  const currentVersion = db.pragma('user_version', { simple: true });
  if (currentVersion < 3) {
    migrateToV3(db);
  }
}
