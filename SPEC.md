# Indexed Knowledge Base — SPEC

**Status:** Draft  
**Feature:** Replace synchronous repo scanning with background SQLite FTS5 indexing  
**App:** Scribe

---

## Why This Matters

Currently, every AI response that needs repo context triggers synchronous `fs.readdirSync`/`fs.readFileSync` traversal across the entire vault. For small repos this is acceptable; for vault-sized repos it blocks the Node event loop and adds seconds of latency per request.

The fix is a persistent FTS5 index that is built and updated incrementally after sync/publish, then queried in milliseconds at request time.

---

## Architecture

```
GitHub Repo Checkout (local .git repo)
         │
         │ sync / publish
         ▼
  Indexing Service
    - walks changed files
    - extracts metadata (title, tags, headings)
    - writes to SQLite FTS5
         │
         ▼
  Indexed Query API
    - full-text search
    - tag browsing
    - note listing
    - ranked results
         │
         ▼
  buildRepoContextForPrompt()  ← replaces heuristic scanning
```

---

## Database Schema

### Table: `repo_index_entries`

```sql
CREATE TABLE IF NOT EXISTS repo_index_entries (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  owner           TEXT NOT NULL,
  repo            TEXT NOT NULL,
  path            TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  tags            TEXT NOT NULL DEFAULT '[]',   -- JSON array
  headings        TEXT NOT NULL DEFAULT '[]',   -- JSON array
  content_snippet TEXT NOT NULL DEFAULT '',     -- first 500 chars for search excerpts
  modified_at     TEXT NOT NULL,                -- ISO timestamp
  indexed_at      TEXT NOT NULL                 -- ISO timestamp
);

CREATE UNIQUE INDEX idx_repo_entry_lookup
  ON repo_index_entries(user_id, owner, repo, path);
```

### Table: `repo_index_meta`

Tracks the last indexed commit per repo so the indexer can diff only what changed.

```sql
CREATE TABLE IF NOT EXISTS repo_index_meta (
  user_id   TEXT NOT NULL,
  owner     TEXT NOT NULL,
  repo      TEXT NOT NULL,
  indexed_head   TEXT NOT NULL DEFAULT '',   -- commit hash of last index run
  indexed_at     TEXT NOT NULL,              -- ISO timestamp
  entry_count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, owner, repo)
);
```

### FTS5 Virtual Table: `repo_index_fts`

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS repo_index_fts USING fts5(
  path,
  title,
  tags,
  headings,
  content_snippet,
  content='repo_index_entries',
  content_rowid='rowid'
);
```

---

## Indexing Logic

### Trigger Points

1. **After `syncAssignedRepo()`** — full or incremental re-index
2. **After note publish** — update only the published file entry
3. **On demand via API** — `POST /api/repo-index/reindex`

### Incremental vs Full Index

The indexer compares `indexed_head` (last commit hash) against current `HEAD`:

- **Same commit** (sync was a no-op pull) → skip entirely
- **Diverged/forward** → diff commit range, index only changed/added files
- **No prior meta entry** → full index

### File Processing

For each markdown file:

1. Read file content (skip if binary or > 512 KB)
2. Extract:
   - **Title**: frontmatter `title` → first `# heading` → filename
   - **Tags**: frontmatter `tags` + inline `#tag` patterns
   - **Headings**: all `##` and `###` lines
   - **Content snippet**: first 500 chars of body (no frontmatter)
3. Upsert into `repo_index_entries`
4. Insert into FTS index

### File Deletions

After indexing, delete from both tables any entries whose paths no longer exist in the working tree.

### Performance

- Files processed in batches of 50 (prevent memory spikes)
- Runs in background — `syncAssignedRepo` resolves immediately, indexing continues
- Rate-limit org/repo re-index calls (once per 60s per repo)

---

## API Endpoints

### `POST /api/repo-index/search`

Full-text search across the active repo.

**Request:**
```json
{ "query": "string", "limit": 20 }
```

**Response:**
```json
{
  "results": [
    {
      "path": "Projects/research.md",
      "title": "Research Notes",
      "tags": ["research", "project"],
      "headings": ["Background", "Findings"],
      "snippet": "First 500 chars of content...",
      "modifiedAt": "2026-03-25T10:00:00Z",
      "rank": 0.95
    }
  ],
  "query": "research",
  "total": 12
}
```

### `GET /api/repo-index/notes`

List all indexed notes (no full-text query).

**Request:** `?dir=Projects&limit=20&offset=0`

**Response:**
```json
{
  "notes": [
    {
      "path": "Projects/research.md",
      "title": "Research Notes",
      "tags": ["research"],
      "modifiedAt": "2026-03-25T10:00:00Z"
    }
  ],
  "total": 45,
  "truncated": false
}
```

### `GET /api/repo-index/tags`

List all tags with file counts.

**Response:**
```json
{
  "tags": [
    { "tag": "research", "count": 5, "files": ["Projects/research.md", ...] },
    { "tag": "project", "count": 3, "files": [...] }
  ]
}
```

### `POST /api/repo-index/reindex`

Force a full re-index of the active repo. Returns immediately; runs in background.

**Response:**
```json
{ "status": "indexing", "message": "Full re-index started." }
```

### `GET /api/repo-index/status`

Index status for the active repo.

**Response:**
```json
{
  "indexed": true,
  "entryCount": 247,
  "indexedAt": "2026-03-26T08:00:00Z",
  "indexedHead": "a1b2c3d"
}
```

---

## Frontend Changes

### `src/services/github-prompt-context.js`

Replace `buildRepoContextForPrompt()` heuristic scanning:

**Before:** `listLocalRepoTree()`, `listLocalRepoNoteTags()`, `listLocalRepoNotes()`, `searchLocalRepoFiles()`, `readLocalRepoFile()` — all synchronous filesystem calls on every prompt.

**After:**
1. If no indexed data → fall back to existing local-repo calls (backward compatible for unindexed repos)
2. If indexed → call `searchRepoIndex({ query, tags, limit })` and `listRepoIndexNotes({ limit })`
3. Attach indexed results to prompt context in the same shape `buildRepoContextForPrompt` currently returns

### `src/services/github-local-repo.js`

Add new functions:
- `searchRepoIndex({ query, limit })` → calls `POST /api/repo-index/search`
- `listRepoIndexNotes({ dir, limit, offset })` → calls `GET /api/repo-index/notes`
- `listRepoIndexTags()` → calls `GET /api/repo-index/tags`
- `getRepoIndexStatus()` → calls `GET /api/repo-index/status`
- `reindexRepo()` → calls `POST /api/repo-index/reindex`

### Settings Panel

Add an "Index Status" row in the GitHub section:
- Shows entry count and last indexed time
- "Re-index" button to force re-index

---

## Backend Files

| File | Role |
|------|------|
| `server/src/services/repo-index-service.js` | Core indexing: walk, extract metadata, write to SQLite |
| `server/src/services/repo-index-store.js` | SQLite read/write for index tables and FTS |
| `server/src/routes/repo-index-routes.js` | API endpoints |
| `server/src/db/database.js` | DB schema migrations (add tables if not exist) |
| `server/src/db/migrations/` | Migration runner |

---

## Rollout Plan

### Phase 1: Infrastructure (no behavior change)
- [ ] Add migration for `repo_index_entries`, `repo_index_meta`, `repo_index_fts`
- [ ] `repo-index-store.js`: `upsertEntry`, `deleteEntries`, `searchEntries`, `listNotes`, `listTags`, `getMeta`, `setMeta`
- [ ] `repo-index-routes.js`: all 5 endpoints wired up

### Phase 2: Indexing Service
- [ ] `repo-index-service.js`: `indexRepo({ userId, owner, repo })` — full and incremental modes
- [ ] Hook into `syncAssignedRepo` post-completion to trigger background indexing
- [ ] Hook into note publish to update single entry

### Phase 3: Query API (backend complete)
- [ ] All 5 endpoints functional and returning data
- [ ] Index status visible in settings panel

### Phase 4: Frontend Integration
- [ ] `github-local-repo.js`: add index query functions
- [ ] `github-prompt-context.js`: replace heuristic with indexed calls
- [ ] Graceful fallback if index is empty

### Phase 5: Polish
- [ ] Loading indicator on re-index
- [ ] Error surface if indexing fails (non-blocking toast)
- [ ] Settings panel shows index stats

---

## Constraints & Decisions

1. **SQLite FTS5** — uses `better-sqlite3` already in the stack; no new dependencies
2. **Background indexing** — does NOT block sync/publish responses; resolve immediately
3. **Backward compatible** — if index is empty/missing, fall back to existing local-repo calls
4. **One active repo at a time** — index is scoped to the currently assigned repo for a user
5. **No semantic/embedding search** — keyword FTS5 only; vector search is a future phase
6. **Index freshness** — index is updated incrementally; `indexed_head` tracks which commit was last indexed

---

## Success Metrics

- `buildRepoContextForPrompt` resolves in < 100ms for repos with 500+ notes (vs 2-5s scanning)
- Search queries return in < 50ms
- Index build for 500 files completes in < 10s (background, non-blocking)
- Zero behavior change for users with unindexed repos (graceful fallback)
