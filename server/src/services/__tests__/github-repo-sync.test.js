import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let repoSyncRoot = '';
let tempRoot = '';

const getSetting = vi.fn();
const getTokenForUser = vi.fn();

vi.mock('../../config/env.js', () => ({
  getConfig: () => ({ repoSyncRoot }),
}));

vi.mock('../storage-store.js', () => ({
  getSetting,
}));

vi.mock('../user-store.js', () => ({
  getTokenForUser,
}));

function initRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath });
}

function commitRepo(repoPath) {
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoPath });
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test\n', 'utf8');
  execFileSync('git', ['add', 'README.md'], { cwd: repoPath });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoPath });
}

describe('github repo sync service', () => {
  beforeEach(() => {
    vi.resetModules();
    getSetting.mockReset();
    getTokenForUser.mockReset();

    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scribe-repo-sync-'));
    repoSyncRoot = path.join(tempRoot, 'repos');
    getTokenForUser.mockReturnValue('token-123');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('skips sync when no repository assignment exists', async () => {
    getSetting.mockReturnValue('');
    const { syncAssignedRepoForUser } = await import('../github-repo-sync.js');

    const result = await syncAssignedRepoForUser({
      userId: 'user-1',
      username: 'brimdor',
      reason: 'login',
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'skipped',
      syncState: 'no-assignment',
    }));
  });

  it('skips pull when local changes are present', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    fs.writeFileSync(path.join(repoPath, 'draft.md'), 'local draft\n', 'utf8');

    const { syncAssignedRepoForUser } = await import('../github-repo-sync.js');
    const result = await syncAssignedRepoForUser({
      userId: 'user-1',
      username: 'brimdor',
      owner: 'brimdor',
      repo: 'ScribeVault',
      reason: 'assistant-tool',
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'skipped',
      syncState: 'local-changes',
      message: expect.stringContaining('Local changes detected'),
    }));
  });

  it('skips pull when upstream tracking is missing', async () => {
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    commitRepo(repoPath);

    const { syncAssignedRepoForUser } = await import('../github-repo-sync.js');
    const result = await syncAssignedRepoForUser({
      userId: 'user-1',
      username: 'brimdor',
      owner: 'brimdor',
      repo: 'ScribeVault',
      reason: 'manual-sync',
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'skipped',
      syncState: 'no-upstream',
      message: expect.stringContaining('upstream tracking branch'),
    }));
  });
});
