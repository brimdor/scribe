import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appendEventLog = vi.fn();
const createGitHubClient = vi.fn();
const deleteRepoFileForUser = vi.fn();
const findRepoNotesByTagForUser = vi.fn();
const getRepoGitDiffForUser = vi.fn();
const getRepoGitLogForUser = vi.fn();
const getRepoGitStatusForUser = vi.fn();
const listRepoNotesForUser = vi.fn();
const listRepoTreeForUser = vi.fn();
const listRepoNoteTagsForUser = vi.fn();
const moveRepoFileForUser = vi.fn();
const publishRepoChangesForUser = vi.fn();
const readRepoNoteFrontmatterForUser = vi.fn();
const readRepoFileForUser = vi.fn();
const resolveAssignedRepoForUser = vi.fn();
const searchRepoFilesForUser = vi.fn();
const syncAssignedRepoForUser = vi.fn();
const writeRepoFileForUser = vi.fn();
const getTokenForUser = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.auth = {
      userId: 'user-1',
      user: { login: 'brimdor' },
    };
    next();
  },
}));

vi.mock('../../services/event-log.js', () => ({
  appendEventLog,
}));

vi.mock('../../services/github-auth.js', () => ({
  createGitHubClient,
}));

vi.mock('../../services/github-repo-files.js', () => ({
  deleteRepoFileForUser,
  findRepoNotesByTagForUser,
  getRepoGitDiffForUser,
  getRepoGitLogForUser,
  getRepoGitStatusForUser,
  listRepoNotesForUser,
  listRepoTreeForUser,
  listRepoNoteTagsForUser,
  moveRepoFileForUser,
  readRepoNoteFrontmatterForUser,
  readRepoFileForUser,
  searchRepoFilesForUser,
  writeRepoFileForUser,
}));

vi.mock('../../services/github-repo-sync.js', () => ({
  publishRepoChangesForUser,
  resolveAssignedRepoForUser,
  syncAssignedRepoForUser,
}));

vi.mock('../../services/user-store.js', () => ({
  getTokenForUser,
}));

async function createTestServer() {
  const { default: githubRoutes } = await import('../github-routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/github', githubRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

describe('github routes', () => {
  let currentServer = null;
  let baseUrl = '';

  beforeEach(async () => {
    vi.resetModules();
    appendEventLog.mockReset();
    createGitHubClient.mockReset();
    deleteRepoFileForUser.mockReset();
    findRepoNotesByTagForUser.mockReset();
    getRepoGitDiffForUser.mockReset();
    getRepoGitLogForUser.mockReset();
    getRepoGitStatusForUser.mockReset();
    listRepoNotesForUser.mockReset();
    listRepoTreeForUser.mockReset();
    listRepoNoteTagsForUser.mockReset();
    moveRepoFileForUser.mockReset();
    publishRepoChangesForUser.mockReset();
    readRepoNoteFrontmatterForUser.mockReset();
    readRepoFileForUser.mockReset();
    resolveAssignedRepoForUser.mockReset();
    searchRepoFilesForUser.mockReset();
    syncAssignedRepoForUser.mockReset();
    writeRepoFileForUser.mockReset();
    getTokenForUser.mockReset();

    const serverInfo = await createTestServer();
    currentServer = serverInfo.server;
    baseUrl = serverInfo.baseUrl;
  });

  afterEach(async () => {
    if (currentServer) {
      await new Promise((resolve, reject) => {
        currentServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    currentServer = null;
    baseUrl = '';
  });

  it.each([
    {
      name: 'tree listing',
      url: '/api/github/repo/tree?owner=acme&repo=scribe&dir=docs&limit=5',
      mock: listRepoTreeForUser,
      mockValue: { dir: 'docs', entries: [{ path: 'docs/guide.md' }], truncated: false },
      expectedCall: { userId: 'user-1', username: 'brimdor', owner: 'acme', repo: 'scribe', dir: 'docs', limit: '5' },
      expectedBody: { tree: { dir: 'docs', entries: [{ path: 'docs/guide.md' }], truncated: false } },
    },
    {
      name: 'file read',
      url: '/api/github/repo/file?owner=acme&repo=scribe&path=README.md&maxBytes=100&maxLines=10',
      mock: readRepoFileForUser,
      mockValue: { path: 'README.md', content: '# Scribe' },
      expectedCall: { userId: 'user-1', username: 'brimdor', owner: 'acme', repo: 'scribe', filePath: 'README.md', maxBytes: '100', maxLines: '10' },
      expectedBody: { file: { path: 'README.md', content: '# Scribe' } },
    },
    {
      name: 'repo search',
      url: '/api/github/repo/search?owner=acme&repo=scribe&q=notes&dir=docs&limit=3',
      mock: searchRepoFilesForUser,
      mockValue: { query: 'notes', results: [{ path: 'docs/guide.md', line: 4 }] },
      expectedCall: { userId: 'user-1', username: 'brimdor', owner: 'acme', repo: 'scribe', query: 'notes', dir: 'docs', limit: '3' },
      expectedBody: { search: { query: 'notes', results: [{ path: 'docs/guide.md', line: 4 }] } },
    },
    {
      name: 'note tags',
      url: '/api/github/repo/note-tags?owner=acme&repo=scribe',
      mock: listRepoNoteTagsForUser,
      mockValue: { scannedFiles: 2, tags: [{ tag: 'project', count: 1 }] },
      expectedCall: { userId: 'user-1', username: 'brimdor', owner: 'acme', repo: 'scribe' },
      expectedBody: { noteTags: { scannedFiles: 2, tags: [{ tag: 'project', count: 1 }] } },
    },
    {
      name: 'note listing',
      url: '/api/github/repo/notes?owner=acme&repo=scribe&dir=Projects&limit=10',
      mock: listRepoNotesForUser,
      mockValue: { dir: 'Projects', notes: [{ path: 'Projects/Watchtower.md' }], truncated: false },
      expectedCall: { userId: 'user-1', username: 'brimdor', owner: 'acme', repo: 'scribe', dir: 'Projects', limit: '10' },
      expectedBody: { notes: { dir: 'Projects', notes: [{ path: 'Projects/Watchtower.md' }], truncated: false } },
    },
    {
      name: 'note frontmatter read',
      url: '/api/github/repo/note/frontmatter?owner=acme&repo=scribe&path=Projects/Watchtower.md',
      mock: readRepoNoteFrontmatterForUser,
      mockValue: { path: 'Projects/Watchtower.md', title: 'Watchtower' },
      expectedCall: { userId: 'user-1', username: 'brimdor', owner: 'acme', repo: 'scribe', filePath: 'Projects/Watchtower.md' },
      expectedBody: { note: { path: 'Projects/Watchtower.md', title: 'Watchtower' } },
    },
    {
      name: 'notes by tag',
      url: '/api/github/repo/notes/by-tag?owner=acme&repo=scribe&tag=project&limit=8',
      mock: findRepoNotesByTagForUser,
      mockValue: { tag: 'project', notes: [{ path: 'Projects/Watchtower.md' }] },
      expectedCall: { userId: 'user-1', username: 'brimdor', owner: 'acme', repo: 'scribe', tag: 'project', limit: '8' },
      expectedBody: { notes: { tag: 'project', notes: [{ path: 'Projects/Watchtower.md' }] } },
    },
  ])('awaits async repo inspection service for $name', async ({ url, mock, mockValue, expectedCall, expectedBody }) => {
    mock.mockResolvedValue(mockValue);

    const response = await fetch(`${baseUrl}${url}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expectedBody);
    expect(mock).toHaveBeenCalledWith(expectedCall);
  });

  it('awaits async repo file mutation services before responding', async () => {
    writeRepoFileForUser.mockResolvedValue({ path: 'notes/todo.md', created: true });
    moveRepoFileForUser.mockResolvedValue({ fromPath: 'notes/todo.md', path: 'archive/todo.md' });
    deleteRepoFileForUser.mockResolvedValue({ path: 'archive/todo.md', deleted: true });

    const writeResponse = await fetch(`${baseUrl}/api/github/repo/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'acme', repo: 'scribe', path: 'notes/todo.md', content: 'hello' }),
    });
    const moveResponse = await fetch(`${baseUrl}/api/github/repo/file`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'acme', repo: 'scribe', fromPath: 'notes/todo.md', toPath: 'archive/todo.md' }),
    });
    const deleteResponse = await fetch(`${baseUrl}/api/github/repo/file?owner=acme&repo=scribe&path=archive/todo.md`, {
      method: 'DELETE',
    });

    expect(writeResponse.status).toBe(200);
    expect(await writeResponse.json()).toEqual({ file: { path: 'notes/todo.md', created: true } });
    expect(writeRepoFileForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      username: 'brimdor',
      owner: 'acme',
      repo: 'scribe',
      filePath: 'notes/todo.md',
      content: 'hello',
      createDirectories: undefined,
    });

    expect(moveResponse.status).toBe(200);
    expect(await moveResponse.json()).toEqual({ file: { fromPath: 'notes/todo.md', path: 'archive/todo.md' } });
    expect(moveRepoFileForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      username: 'brimdor',
      owner: 'acme',
      repo: 'scribe',
      fromPath: 'notes/todo.md',
      toPath: 'archive/todo.md',
      createDirectories: undefined,
    });

    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ file: { path: 'archive/todo.md', deleted: true } });
    expect(deleteRepoFileForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      username: 'brimdor',
      owner: 'acme',
      repo: 'scribe',
      filePath: 'archive/todo.md',
    });
  });
});
