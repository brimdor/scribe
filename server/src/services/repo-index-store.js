import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';

// ── Entry upsert ──────────────────────────────────────────────────────────────

export function upsertIndexEntry({ userId, owner, repo, path: filePath, title, tags, headings, contentSnippet, modifiedAt }) {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const indexedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO repo_index_entries
      (id, user_id, owner, repo, path, title, tags, headings, content_snippet, modified_at, indexed_at)
    VALUES
      (@id, @userId, @owner, @repo, @path, @title, @tags, @headings, @contentSnippet, @modifiedAt, @indexedAt)
    ON CONFLICT(user_id, owner, repo, path) DO UPDATE SET
      title           = excluded.title,
      tags            = excluded.tags,
      headings        = excluded.headings,
      content_snippet = excluded.content_snippet,
      modified_at     = excluded.modified_at,
      indexed_at      = excluded.indexed_at
  `).run({
    id,
    userId,
    owner,
    repo,
    path: filePath,
    title: String(title || ''),
    tags: JSON.stringify(Array.isArray(tags) ? tags : []),
    headings: JSON.stringify(Array.isArray(headings) ? headings : []),
    contentSnippet: String(contentSnippet || '').slice(0, 500),
    modifiedAt: String(modifiedAt || ''),
    indexedAt,
  });

  return id;
}

export function upsertIndexEntries(batch) {
  const db = getDatabase();
  const indexedAt = new Date().toISOString();
  const writeEntry = db.prepare(`
    INSERT INTO repo_index_entries
      (id, user_id, owner, repo, path, title, tags, headings, content_snippet, modified_at, indexed_at)
    VALUES
      (@id, @userId, @owner, @repo, @path, @title, @tags, @headings, @contentSnippet, @modifiedAt, @indexedAt)
    ON CONFLICT(user_id, owner, repo, path) DO UPDATE SET
      title           = excluded.title,
      tags            = excluded.tags,
      headings        = excluded.headings,
      content_snippet = excluded.content_snippet,
      modified_at     = excluded.modified_at,
      indexed_at      = excluded.indexed_at
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      writeEntry.run({
        id: crypto.randomUUID(),
        userId: row.userId,
        owner: row.owner,
        repo: row.repo,
        path: row.filePath,
        title: String(row.title || ''),
        tags: JSON.stringify(Array.isArray(row.tags) ? row.tags : []),
        headings: JSON.stringify(Array.isArray(row.headings) ? row.headings : []),
        contentSnippet: String(row.contentSnippet || '').slice(0, 500),
        modifiedAt: String(row.modifiedAt || ''),
        indexedAt,
      });
    }
  });

  insertMany(batch);
  return batch.length;
}

// ── Entry delete ─────────────────────────────────────────────────────────────

export function deleteIndexEntry({ userId, owner, repo, path: filePath }) {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM repo_index_entries
    WHERE user_id = ? AND owner = ? AND repo = ? AND path = ?
  `).run(userId, owner, repo, filePath);
}

export function deleteIndexEntriesForRepo({ userId, owner, repo }) {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM repo_index_entries
    WHERE user_id = ? AND owner = ? AND repo = ?
  `).run(userId, owner, repo);
}

export function deleteStaleIndexEntries({ userId, owner, repo }, existingPaths) {
  const db = getDatabase();
  const placeholders = existingPaths.map(() => '?').join(',');
  const stalePaths = db.prepare(`
    SELECT path FROM repo_index_entries
    WHERE user_id = ? AND owner = ? AND repo = ? AND path NOT IN (${placeholders})
  `).all(userId, owner, repo, ...existingPaths);

  const deleteStale = db.transaction((paths) => {
    for (const { path: stalePath } of paths) {
      db.prepare(`
        DELETE FROM repo_index_entries
        WHERE user_id = ? AND owner = ? AND repo = ? AND path = ?
      `).run(userId, owner, repo, stalePath);
    }
  });

  deleteStale(stalePaths);
  return stalePaths.length;
}

// ── FTS search ────────────────────────────────────────────────────────────────

export function searchIndex({ userId, owner, repo, query, limit = 20 }) {
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  if (!query || !String(query).trim()) {
    return [];
  }

  const ftsQuery = String(query)
    .trim()
    .replace(/[^\w\s/-]/g, ' ')
    .split(/\s+/)
    .map((term) => `"${term}"*`)
    .join(' ');

  let results;
  try {
    results = db.prepare(`
      SELECT
        e.path,
        e.title,
        e.tags,
        e.headings,
        e.content_snippet,
        e.modified_at,
        rank
      FROM repo_index_fts fts
      JOIN repo_index_entries e ON e.rowid = fts.rowid
      WHERE fts MATCH ? AND e.user_id = ? AND e.owner = ? AND e.repo = ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, userId, owner, repo, safeLimit);
  } catch {
    // FTS query syntax error — fall back to LIKE
    results = db.prepare(`
      SELECT
        e.path,
        e.title,
        e.tags,
        e.headings,
        e.content_snippet,
        e.modified_at,
        0 AS rank
      FROM repo_index_entries e
      WHERE e.user_id = ? AND e.owner = ? AND e.repo = ?
        AND (e.title LIKE ? OR e.content_snippet LIKE ? OR e.tags LIKE ?)
      LIMIT ?
    `).all(userId, owner, repo, `%${query}%`, `%${query}%`, `%${query}%`, safeLimit);
  }

  return results.map((row) => ({
    path: row.path,
    title: row.title,
    tags: JSON.parse(row.tags || '[]'),
    headings: JSON.parse(row.headings || '[]'),
    snippet: row.content_snippet,
    modifiedAt: row.modified_at,
    rank: row.rank ?? 0,
  }));
}

// ── List notes ───────────────────────────────────────────────────────────────

export function listIndexNotes({ userId, owner, repo, dir = '', limit = 60, offset = 0 }) {
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 250);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const dirPattern = dir ? `${dir.replace(/\\/g, '/').replace(/\/+$/, '')}/` : '';

  const rows = db.prepare(`
    SELECT path, title, tags, modified_at
    FROM repo_index_entries
    WHERE user_id = ? AND owner = ? AND repo = ?
      AND (path LIKE ? || '%')
    ORDER BY modified_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, owner, repo, dirPattern, safeLimit, safeOffset);

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM repo_index_entries
    WHERE user_id = ? AND owner = ? AND repo = ?
      AND (path LIKE ? || '%')
  `).get(userId, owner, repo, dirPattern);

  return {
    notes: rows.map((row) => ({
      path: row.path,
      title: row.title,
      tags: JSON.parse(row.tags || '[]'),
      modifiedAt: row.modified_at,
    })),
    total: countRow?.total || 0,
    truncated: rows.length === safeLimit,
  };
}

// ── List tags ─────────────────────────────────────────────────────────────────

export function listIndexTags({ userId, owner, repo }) {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT path, tags
    FROM repo_index_entries
    WHERE user_id = ? AND owner = ? AND repo = ?
  `).all(userId, owner, repo);

  const tagMap = new Map();
  for (const row of rows) {
    const tags = JSON.parse(row.tags || '[]');
    for (const tag of tags) {
      const normalized = String(tag).toLowerCase();
      if (!normalized) continue;
      const existing = tagMap.get(normalized) || { tag: normalized, count: 0, files: [] };
      existing.count += 1;
      if (existing.files.length < 5) {
        existing.files.push(row.path);
      }
      tagMap.set(normalized, existing);
    }
  }

  return {
    tags: Array.from(tagMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.tag.localeCompare(b.tag);
    }),
  };
}

// ── Meta ─────────────────────────────────────────────────────────────────────

export function getIndexMeta({ userId, owner, repo }) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT indexed_head, indexed_at, entry_count
    FROM repo_index_meta
    WHERE user_id = ? AND owner = ? AND repo = ?
  `).get(userId, owner, repo);

  if (!row) {
    return { indexed: false, entryCount: 0, indexedAt: null, indexedHead: null };
  }

  return {
    indexed: true,
    entryCount: row.entry_count,
    indexedAt: row.indexed_at,
    indexedHead: row.indexed_head,
  };
}

export function setIndexMeta({ userId, owner, repo, indexedHead, entryCount }) {
  const db = getDatabase();
  const indexedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO repo_index_meta (user_id, owner, repo, indexed_head, indexed_at, entry_count)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, owner, repo) DO UPDATE SET
      indexed_head  = excluded.indexed_head,
      indexed_at    = excluded.indexed_at,
      entry_count   = excluded.entry_count
  `).run(userId, owner, repo, String(indexedHead || ''), indexedAt, Number(entryCount) || 0);
}
