import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let repoSyncRoot = '';
let tempRoot = '';

const getSetting = vi.fn();

vi.mock('../../config/env.js', () => ({
  getConfig: () => ({ repoSyncRoot }),
}));

vi.mock('../storage-store.js', () => ({
  getSetting,
}));

vi.mock('../user-store.js', () => ({
  getTokenForUser: vi.fn(() => 'token-123'),
}));

function initRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath });
}

function commitRepo(repoPath) {
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoPath });
  execFileSync('git', ['add', '.'], { cwd: repoPath });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoPath });
}

describe('github repo files service', () => {
  beforeEach(() => {
    vi.resetModules();
    getSetting.mockReset();

    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scribe-repo-files-'));
    repoSyncRoot = path.join(tempRoot, 'repos');

    getSetting.mockImplementation((_userId, key) => {
      if (key === 'githubOwner') return 'brimdor';
      if (key === 'githubRepo') return 'ScribeVault';
      return '';
    });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('lists repository tree and reads text files', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    fs.mkdirSync(path.join(repoPath, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# ScribeVault\n', 'utf8');
    fs.writeFileSync(path.join(repoPath, 'docs', 'guide.md'), 'Guide\n', 'utf8');

    const { listRepoTreeForUser, readRepoFileForUser } = await import('../github-repo-files.js');
    const tree = listRepoTreeForUser({ userId: 'user-1', username: 'brimdor' });
    const file = readRepoFileForUser({ userId: 'user-1', username: 'brimdor', filePath: 'README.md' });

    expect(tree.entries.length).toBeGreaterThan(0);
    expect(tree.entries.some((entry) => entry.path === 'README.md')).toBe(true);
    expect(file.path).toBe('README.md');
    expect(file.content).toContain('ScribeVault');
  });

  it('searches, writes, and inspects git state safely', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    fs.mkdirSync(path.join(repoPath, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# ScribeVault\nRepository overview\n', 'utf8');
    fs.writeFileSync(path.join(repoPath, 'docs', 'guide.md'), 'Search target lives here.\n', 'utf8');
    commitRepo(repoPath);

    fs.writeFileSync(path.join(repoPath, 'README.md'), '# ScribeVault\nRepository overview\nUpdated locally.\n', 'utf8');

    const {
      getRepoGitDiffForUser,
      getRepoGitLogForUser,
      getRepoGitStatusForUser,
      searchRepoFilesForUser,
      writeRepoFileForUser,
    } = await import('../github-repo-files.js');

    const search = searchRepoFilesForUser({ userId: 'user-1', username: 'brimdor', query: 'search target' });
    const written = writeRepoFileForUser({
      userId: 'user-1',
      username: 'brimdor',
      filePath: 'notes/todo.md',
      content: '- [ ] verify tool suite\n',
    });
    const status = await getRepoGitStatusForUser({ userId: 'user-1', username: 'brimdor' });
    const diff = await getRepoGitDiffForUser({ userId: 'user-1', username: 'brimdor', filePath: 'README.md' });
    const log = await getRepoGitLogForUser({ userId: 'user-1', username: 'brimdor', limit: 5 });

    expect(search.results[0]).toEqual(expect.objectContaining({ path: 'docs/guide.md' }));
    expect(written).toEqual(expect.objectContaining({ path: 'notes/todo.md', created: true }));
    expect(fs.readFileSync(path.join(repoPath, 'notes', 'todo.md'), 'utf8')).toContain('verify tool suite');
    expect(status.clean).toBe(false);
    expect(status.output).toContain('README.md');
    expect(diff.hasChanges).toBe(true);
    expect(diff.output).toContain('Updated locally');
    expect(log.entries[0]?.subject).toBe('init');
  });

  it('extracts note tags from markdown frontmatter and inline tags', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    fs.mkdirSync(path.join(repoPath, 'Projects'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'Projects', 'Watchtower.md'), [
      '---',
      'tags:',
      '  - homelab',
      '  - project',
      '---',
      '',
      'This note references #ops and #project.',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(repoPath, 'README.md'), 'General repo docs with #overview\n', 'utf8');

    const { listRepoNoteTagsForUser } = await import('../github-repo-files.js');
    const summary = listRepoNoteTagsForUser({ userId: 'user-1', username: 'brimdor' });

    expect(summary.scannedFiles).toBe(2);
    expect(summary.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'project', count: 1 }),
      expect.objectContaining({ tag: 'homelab', count: 1 }),
      expect.objectContaining({ tag: 'ops', count: 1 }),
      expect.objectContaining({ tag: 'overview', count: 1 }),
    ]));
  });

  it('lists notes, finds notes by tag, and reads frontmatter', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    fs.mkdirSync(path.join(repoPath, 'Projects'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'Projects', 'Watchtower.md'), [
      '---',
      'title: Watchtower',
      'tags: [project, homelab]',
      'status: active',
      '---',
      '',
      '# Watchtower',
      '',
      'Track #ops work.',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(repoPath, 'Inbox.md'), '# Inbox\n#capture\n', 'utf8');

    const {
      findRepoNotesByTagForUser,
      listRepoNotesForUser,
      readRepoNoteFrontmatterForUser,
    } = await import('../github-repo-files.js');

    const notes = listRepoNotesForUser({ userId: 'user-1', username: 'brimdor', limit: 10 });
    const tagged = findRepoNotesByTagForUser({ userId: 'user-1', username: 'brimdor', tag: 'project', limit: 10 });
    const note = readRepoNoteFrontmatterForUser({ userId: 'user-1', username: 'brimdor', filePath: 'Projects/Watchtower.md' });

    expect(notes.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'Projects/Watchtower.md', title: 'Watchtower' }),
      expect.objectContaining({ path: 'Inbox.md', title: 'Inbox' }),
    ]));
    expect(tagged.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'Projects/Watchtower.md', tags: expect.arrayContaining(['project', 'homelab']) }),
    ]));
    expect(note.frontmatter).toEqual(expect.objectContaining({
      title: 'Watchtower',
      status: 'active',
      tags: ['project', 'homelab'],
    }));
    expect(note.tags).toEqual(expect.arrayContaining(['project', 'homelab', 'ops']));
  });

  it('moves and deletes repository files safely', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    fs.mkdirSync(path.join(repoPath, 'Inbox'), { recursive: true });
    fs.mkdirSync(path.join(repoPath, 'Archive'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'Inbox', 'draft-note.md'), '# Draft\n', 'utf8');
    fs.writeFileSync(path.join(repoPath, 'Inbox', 'delete-me.md'), '# Delete\n', 'utf8');

    const {
      deleteRepoFileForUser,
      moveRepoFileForUser,
    } = await import('../github-repo-files.js');

    const moved = moveRepoFileForUser({
      userId: 'user-1',
      username: 'brimdor',
      fromPath: 'Inbox/draft-note.md',
      toPath: 'Archive/draft-note.md',
    });
    const deleted = deleteRepoFileForUser({
      userId: 'user-1',
      username: 'brimdor',
      filePath: 'Inbox/delete-me.md',
    });

    expect(moved).toEqual(expect.objectContaining({
      fromPath: 'Inbox/draft-note.md',
      path: 'Archive/draft-note.md',
    }));
    expect(fs.existsSync(path.join(repoPath, 'Inbox', 'draft-note.md'))).toBe(false);
    expect(fs.existsSync(path.join(repoPath, 'Archive', 'draft-note.md'))).toBe(true);
    expect(deleted).toEqual(expect.objectContaining({
      path: 'Inbox/delete-me.md',
      deleted: true,
    }));
    expect(fs.existsSync(path.join(repoPath, 'Inbox', 'delete-me.md'))).toBe(false);
  });

  it('rejects path traversal when reading files', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);

    const { readRepoFileForUser } = await import('../github-repo-files.js');

    expect(() => readRepoFileForUser({
      userId: 'user-1',
      username: 'brimdor',
      filePath: '../secrets.txt',
    })).toThrow(/invalid path segment|outside the repository/i);
  });

  it('rejects path traversal when writing files', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);

    const { writeRepoFileForUser } = await import('../github-repo-files.js');

    expect(() => writeRepoFileForUser({
      userId: 'user-1',
      username: 'brimdor',
      filePath: '../notes.md',
      content: 'secret',
    })).toThrow(/invalid path segment|outside the repository/i);
  });
});
