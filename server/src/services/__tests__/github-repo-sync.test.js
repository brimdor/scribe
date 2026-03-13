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

function setOriginRemote(repoPath, remoteUrl = 'https://github.com/brimdor/ScribeVault.git') {
  execFileSync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: repoPath });
}

function createBareRemote(remotePath) {
  fs.mkdirSync(remotePath, { recursive: true });
  execFileSync('git', ['init', '--bare', '--initial-branch=main', remotePath]);
}

function seedRemoteRepo(remotePath) {
  const seedPath = path.join(tempRoot, 'seed');
  fs.mkdirSync(seedPath, { recursive: true });
  execFileSync('git', ['clone', remotePath, seedPath]);
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: seedPath });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: seedPath });
  fs.writeFileSync(path.join(seedPath, 'README.md'), '# Test\n', 'utf8');
  execFileSync('git', ['add', 'README.md'], { cwd: seedPath });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: seedPath });
  execFileSync('git', ['push', 'origin', 'main'], { cwd: seedPath });
  return seedPath;
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
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    setOriginRemote(repoPath);
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
    const repoPath = path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault');
    initRepo(repoPath);
    commitRepo(repoPath);
    setOriginRemote(repoPath);

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

  it('publishes staged note changes to origin main', async () => {
    const remotePath = path.join(tempRoot, 'remote.git');
    createBareRemote(remotePath);
    seedRemoteRepo(remotePath);

    const ownerRoot = path.join(repoSyncRoot, 'brimdor', 'brimdor');
    fs.mkdirSync(ownerRoot, { recursive: true });
    execFileSync('git', ['clone', remotePath, 'ScribeVault'], { cwd: ownerRoot });
    const repoPath = path.join(ownerRoot, 'ScribeVault');
    fs.mkdirSync(path.join(repoPath, 'Projects'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'Projects', 'Scribe.md'), '# Scribe\n', 'utf8');
    fs.writeFileSync(path.join(repoPath, 'scratch.txt'), 'do not publish\n', 'utf8');

    const { publishRepoChangesForUser } = await import('../github-repo-sync.js');
    const result = await publishRepoChangesForUser({
      userId: 'user-1',
      username: 'brimdor',
      owner: 'brimdor',
      repo: 'ScribeVault',
      filePaths: ['Projects/Scribe.md'],
      commitMessage: 'sync notes from Scribe',
      reason: 'agent-publish',
    });

    const clonedVerifyPath = path.join(tempRoot, 'verify');
    execFileSync('git', ['clone', remotePath, clonedVerifyPath]);

    expect(result).toEqual(expect.objectContaining({
      status: 'published',
      branch: 'main',
      validatedRemote: false,
      stagedFiles: ['Projects/Scribe.md'],
    }));
    expect(result.remoteHeadSha).toBe(result.commitSha);
    expect(fs.readFileSync(path.join(clonedVerifyPath, 'Projects', 'Scribe.md'), 'utf8')).toContain('# Scribe');
    expect(fs.existsSync(path.join(clonedVerifyPath, 'scratch.txt'))).toBe(false);
  });

  it('rejects publish requests without explicit file paths', async () => {
    const remotePath = path.join(tempRoot, 'remote.git');
    createBareRemote(remotePath);
    seedRemoteRepo(remotePath);

    const ownerRoot = path.join(repoSyncRoot, 'brimdor', 'brimdor');
    fs.mkdirSync(ownerRoot, { recursive: true });
    execFileSync('git', ['clone', remotePath, 'ScribeVault'], { cwd: ownerRoot });
    const repoPath = path.join(ownerRoot, 'ScribeVault');
    fs.writeFileSync(path.join(repoPath, 'scratch.txt'), 'local only\n', 'utf8');

    const { publishRepoChangesForUser } = await import('../github-repo-sync.js');

    await expect(publishRepoChangesForUser({
      userId: 'user-1',
      username: 'brimdor',
      owner: 'brimdor',
      repo: 'ScribeVault',
      commitMessage: 'should fail',
      reason: 'agent-publish',
    })).rejects.toThrow(/file paths are required/i);
  });

  it('migrates legacy checkouts into owner-scoped paths', async () => {
    const legacyUserRoot = path.join(repoSyncRoot, 'brimdor');
    fs.mkdirSync(legacyUserRoot, { recursive: true });
    initRepo(path.join(legacyUserRoot, 'ScribeVault'));
    commitRepo(path.join(legacyUserRoot, 'ScribeVault'));
    setOriginRemote(path.join(legacyUserRoot, 'ScribeVault'));

    const { syncAssignedRepoForUser } = await import('../github-repo-sync.js');
    const result = await syncAssignedRepoForUser({
      userId: 'user-1',
      username: 'brimdor',
      owner: 'brimdor',
      repo: 'ScribeVault',
      reason: 'manual-sync',
    });

    expect(result.localPath).toBe('brimdor/brimdor/ScribeVault');
    expect(fs.existsSync(path.join(repoSyncRoot, 'brimdor', 'brimdor', 'ScribeVault', '.git'))).toBe(true);
    expect(fs.existsSync(path.join(repoSyncRoot, 'brimdor', 'ScribeVault'))).toBe(false);
  });
});
