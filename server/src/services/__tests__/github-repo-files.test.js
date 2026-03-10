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
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'ScribeVault');
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

  it('rejects path traversal when reading files', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'ScribeVault');
    initRepo(repoPath);

    const { readRepoFileForUser } = await import('../github-repo-files.js');

    expect(() => readRepoFileForUser({
      userId: 'user-1',
      username: 'brimdor',
      filePath: '../secrets.txt',
    })).toThrow(/invalid path segment|outside the repository/i);
  });
});
