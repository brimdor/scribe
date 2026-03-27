import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// hoisted — evaluated before module body, shares scope with the mock factory
const { setMockDb, getMockDb } = vi.hoisted(() => {
  let db = null;
  return {
    setMockDb: (instance) => { db = instance; },
    getMockDb: () => db,
  };
});

vi.mock('../../db/database.js', () => ({
  getDatabase: () => getMockDb(),
}));

const {
  upsertIndexEntry,
  upsertIndexEntries,
  deleteIndexEntry,
  deleteIndexEntriesForRepo,
  searchIndex,
  listIndexNotes,
  listIndexTags,
  getIndexMeta,
  setIndexMeta,
} = await import('../repo-index-store.js');

// Import after mock so the store uses our mocked getDatabase
let Database;
beforeEach(async () => {
  const mod = await import('better-sqlite3');
  Database = mod.default;
  const db = new Database(':memory:');

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

    CREATE UNIQUE INDEX idx_repo_entry_lookup
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

  setMockDb(db);
});

afterEach(() => {
  getMockDb()?.close();
  vi.restoreAllMocks();
});

describe('repo-index-store', () => {
  const userId = 'user-1';
  const owner = 'brimdor';
  const repo = 'ScribeVault';

  describe('upsertIndexEntry', () => {
    it('inserts a new entry and returns an id', () => {
      const id = upsertIndexEntry({
        userId, owner, repo,
        path: 'Notes/test.md',
        title: 'Test Note',
        tags: ['research', 'project'],
        headings: ['Background', 'Findings'],
        contentSnippet: 'This is the note body content.',
        modifiedAt: '2026-03-26T10:00:00Z',
      });

      expect(id).toBeTruthy();

      const row = getMockDb()
        .prepare('SELECT title, tags, headings, content_snippet FROM repo_index_entries WHERE path = ?')
        .get('Notes/test.md');

      expect(row.title).toBe('Test Note');
      expect(JSON.parse(row.tags)).toEqual(['research', 'project']);
      expect(JSON.parse(row.headings)).toEqual(['Background', 'Findings']);
      expect(row.content_snippet).toBe('This is the note body content.');
    });

    it('updates existing entry on conflict (user+owner+repo+path)', () => {
      upsertIndexEntry({
        userId, owner, repo, path: 'Notes/test.md',
        title: 'Original', tags: [], headings: [], contentSnippet: '', modifiedAt: '2026-03-26T10:00:00Z',
      });

      upsertIndexEntry({
        userId, owner, repo, path: 'Notes/test.md',
        title: 'Updated', tags: ['updated'], headings: ['New'], contentSnippet: 'Updated',
        modifiedAt: '2026-03-27T10:00:00Z',
      });

      const count = getMockDb().prepare('SELECT COUNT(*) as c FROM repo_index_entries WHERE path = ?').get('Notes/test.md');
      expect(count.c).toBe(1);

      const row = getMockDb().prepare('SELECT title FROM repo_index_entries WHERE path = ?').get('Notes/test.md');
      expect(row.title).toBe('Updated');
    });

    it('treats same path with different owners as distinct entries', () => {
      upsertIndexEntry({ userId, owner, repo, path: 'shared.md', title: 'A', tags: [], headings: [], contentSnippet: '', modifiedAt: '' });
      upsertIndexEntry({ userId, owner: 'other', repo, path: 'shared.md', title: 'B', tags: [], headings: [], contentSnippet: '', modifiedAt: '' });

      const count = getMockDb().prepare('SELECT COUNT(*) as c FROM repo_index_entries').get();
      expect(count.c).toBe(2);
    });
  });

  describe('upsertIndexEntries (batch)', () => {
    it('inserts multiple entries in a single transaction', () => {
      const count = upsertIndexEntries([
        { userId, owner, repo, filePath: 'a.md', title: 'A', tags: [], headings: [], contentSnippet: '', modifiedAt: '' },
        { userId, owner, repo, filePath: 'b.md', title: 'B', tags: [], headings: [], contentSnippet: '', modifiedAt: '' },
        { userId, owner, repo, filePath: 'c.md', title: 'C', tags: [], headings: [], contentSnippet: '', modifiedAt: '' },
      ]);

      expect(count).toBe(3);
      const total = getMockDb().prepare('SELECT COUNT(*) as c FROM repo_index_entries').get();
      expect(total.c).toBe(3);
    });

    it('handles empty batch', () => {
      const count = upsertIndexEntries([]);
      expect(count).toBe(0);
    });
  });

  describe('searchIndex', () => {
    beforeEach(() => {
      upsertIndexEntries([
        { userId, owner, repo, filePath: 'Notes/research.md', title: 'Research Notes', tags: ['research'], headings: ['Background'], contentSnippet: 'Deep learning transformer architectures are powerful.', modifiedAt: '' },
        { userId, owner, repo, filePath: 'Notes/todo.md', title: 'TODO List', tags: ['todo'], headings: [], contentSnippet: 'Buy groceries and pick up the kids.', modifiedAt: '' },
        { userId, owner, repo, filePath: 'Notes/project.md', title: 'Project Plan', tags: ['project', 'research'], headings: ['Goals'], contentSnippet: 'Research and develop a new feature for the platform.', modifiedAt: '' },
      ]);
    });

    it('returns matching entries for a keyword in title or content', () => {
      const results = searchIndex({ userId, owner, repo, query: 'research', limit: 10 });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.path === 'Notes/research.md')).toBe(true);
    });

    it('returns empty array when no matches exist', () => {
      const results = searchIndex({ userId, owner, repo, query: 'nonexistentterm12345', limit: 10 });
      expect(results).toEqual([]);
    });

    it('respects limit parameter', () => {
      const results = searchIndex({ userId, owner, repo, query: 'research', limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('caps limit at 100', () => {
      const results = searchIndex({ userId, owner, repo, query: 'research', limit: 999 });
      expect(results.length).toBeLessThanOrEqual(100);
    });

    it('returns empty for blank query', () => {
      const results = searchIndex({ userId, owner, repo, query: '', limit: 10 });
      expect(results).toEqual([]);
    });
  });

  describe('listIndexNotes', () => {
    beforeEach(() => {
      upsertIndexEntries([
        { userId, owner, repo, filePath: 'a.md', title: 'A', tags: [], modifiedAt: '2026-01-01T00:00:00Z' },
        { userId, owner, repo, filePath: 'b.md', title: 'B', tags: ['x'], modifiedAt: '2026-02-01T00:00:00Z' },
        { userId, owner, repo, filePath: 'c.md', title: 'C', tags: [], modifiedAt: '2026-03-01T00:00:00Z' },
      ]);
    });

    it('returns notes sorted by modified date descending', () => {
      const result = listIndexNotes({ userId, owner, repo });
      expect(result.notes[0].path).toBe('c.md');
      expect(result.total).toBe(3);
    });

    it('filters by directory prefix', () => {
      upsertIndexEntries([
        { userId, owner, repo, filePath: 'Notes/a.md', title: 'NA', tags: [], modifiedAt: '' },
      ]);
      const result = listIndexNotes({ userId, owner, repo, dir: 'Notes' });
      expect(result.notes.every((n) => n.path.startsWith('Notes/'))).toBe(true);
    });

    it('respects pagination parameters', () => {
      const result = listIndexNotes({ userId, owner, repo, limit: 2, offset: 1 });
      expect(result.notes.length).toBeLessThanOrEqual(2);
    });
  });

  describe('listIndexTags', () => {
    beforeEach(() => {
      upsertIndexEntries([
        { userId, owner, repo, filePath: 'a.md', title: 'A', tags: ['research', 'project'], modifiedAt: '' },
        { userId, owner, repo, filePath: 'b.md', title: 'B', tags: ['research'], modifiedAt: '' },
        { userId, owner, repo, filePath: 'c.md', title: 'C', tags: ['project'], modifiedAt: '' },
      ]);
    });

    it('returns tags sorted by count descending', () => {
      const { tags } = listIndexTags({ userId, owner, repo });
      // Both research and project have count 2, so tiebreak is alphabetical:
      // "project" < "research", so project comes first
      expect(tags[0].tag).toBe('project');
      expect(tags[0].count).toBe(2);
      expect(tags[1].tag).toBe('research');
      expect(tags[1].count).toBe(2);
    });

    it('deduplicates and normalizes tags', () => {
      upsertIndexEntries([
        { userId, owner, repo, filePath: 'd.md', title: 'D', tags: ['RESEARCH', 'Research', ' research '], modifiedAt: '' },
      ]);
      const { tags } = listIndexTags({ userId, owner, repo });
      const researchTags = tags.filter((t) => t.tag === 'research');
      expect(researchTags.length).toBe(1);
    });

    it('caps file list per tag at 5', () => {
      for (let i = 1; i <= 6; i++) {
        upsertIndexEntry({ userId, owner, repo, path: `f${i}.md`, title: `F${i}`, tags: ['many'], headings: [], contentSnippet: '', modifiedAt: '' });
      }
      const { tags } = listIndexTags({ userId, owner, repo });
      const manyTag = tags.find((t) => t.tag === 'many');
      expect(manyTag.files.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getIndexMeta / setIndexMeta', () => {
    it('returns indexed: false when no meta exists', () => {
      const meta = getIndexMeta({ userId, owner, repo });
      expect(meta.indexed).toBe(false);
      expect(meta.entryCount).toBe(0);
    });

    it('persists and retrieves meta correctly', () => {
      setIndexMeta({ userId, owner, repo, indexedHead: 'abc123def', entryCount: 42 });
      const meta = getIndexMeta({ userId, owner, repo });
      expect(meta.indexed).toBe(true);
      expect(meta.indexedHead).toBe('abc123def');
      expect(meta.entryCount).toBe(42);
    });

    it('updates existing meta on second call', () => {
      setIndexMeta({ userId, owner, repo, indexedHead: 'first', entryCount: 1 });
      setIndexMeta({ userId, owner, repo, indexedHead: 'second', entryCount: 99 });
      const meta = getIndexMeta({ userId, owner, repo });
      expect(meta.indexedHead).toBe('second');
      expect(meta.entryCount).toBe(99);
    });
  });

  describe('deleteIndexEntry', () => {
    it('removes a single entry', () => {
      upsertIndexEntry({ userId, owner, repo, path: 'to-delete.md', title: 'X', tags: [], headings: [], contentSnippet: '', modifiedAt: '' });
      deleteIndexEntry({ userId, owner, repo, path: 'to-delete.md' });
      const row = getMockDb().prepare('SELECT * FROM repo_index_entries WHERE path = ?').get('to-delete.md');
      expect(row).toBeUndefined();
    });

    it('only deletes within correct user/owner/repo scope', () => {
      upsertIndexEntry({ userId, owner, repo, path: 'target.md', title: 'X', tags: [], headings: [], contentSnippet: '', modifiedAt: '' });
      upsertIndexEntry({ userId, owner: 'other', repo, path: 'target.md', title: 'Y', tags: [], headings: [], contentSnippet: '', modifiedAt: '' });
      deleteIndexEntry({ userId, owner, repo, path: 'target.md' });
      const remaining = getMockDb().prepare('SELECT COUNT(*) as c FROM repo_index_entries').get();
      expect(remaining.c).toBe(1);
    });
  });

  describe('deleteIndexEntriesForRepo', () => {
    it('removes all entries for a user/owner/repo', () => {
      upsertIndexEntries([
        { userId, owner, repo, filePath: 'a.md', title: 'A', tags: [], headings: [], contentSnippet: '', modifiedAt: '' },
        { userId, owner, repo, filePath: 'b.md', title: 'B', tags: [], headings: [], contentSnippet: '', modifiedAt: '' },
      ]);
      upsertIndexEntries([
        { userId, owner: 'other', repo, filePath: 'c.md', title: 'C', tags: [], headings: [], contentSnippet: '', modifiedAt: '' },
      ]);

      deleteIndexEntriesForRepo({ userId, owner, repo });

      const remaining = getMockDb().prepare('SELECT COUNT(*) as c FROM repo_index_entries').get();
      expect(remaining.c).toBe(1);
    });
  });
});
