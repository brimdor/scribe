import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getConfig } from '../config/env.js';
import { getSetting } from './storage-store.js';
import { getTokenForUser } from './user-store.js';
import { indexRepoIncremental } from './repo-index-service.js';

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function normalizeSegment(value) {
  return String(value || '').trim();
}

function requireSafeSegment(value, label) {
  const normalized = normalizeSegment(value);
  if (!normalized) {
    throw new Error(`${label} is required for repository sync.`);
  }

  if (!SAFE_SEGMENT_PATTERN.test(normalized)) {
    throw new Error(`${label} contains unsupported characters.`);
  }

  return normalized;
}

function normalizeGitHubRemoteUrl(value) {
  return String(value || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
}

function buildExpectedGitHubRemoteUrls(owner, repo) {
  const safeOwner = requireSafeSegment(owner, 'Repository owner');
  const safeRepo = requireSafeSegment(repo, 'Repository name');
  const slug = `${safeOwner}/${safeRepo}`;

  return new Set([
    normalizeGitHubRemoteUrl(`https://github.com/${slug}.git`),
    normalizeGitHubRemoteUrl(`https://github.com/${slug}`),
    normalizeGitHubRemoteUrl(`git@github.com:${slug}.git`),
    normalizeGitHubRemoteUrl(`ssh://git@github.com/${slug}.git`),
  ]);
}

function isGitHubRemoteUrl(value) {
  const normalized = String(value || '').trim();
  return /github\.com[:/]/i.test(normalized);
}

async function readOriginRemoteUrl(repoPath) {
  const { stdout } = await runGitCommand(['-C', repoPath, 'remote', 'get-url', 'origin']);
  return String(stdout || '').trim();
}

async function verifyRepoRemote(repoPath, assignment) {
  const remoteUrl = await readOriginRemoteUrl(repoPath);
  if (!remoteUrl) {
    throw new Error(`Repository checkout at ${assignment.localPath} does not have an origin remote configured.`);
  }

  if (!isGitHubRemoteUrl(remoteUrl)) {
    return {
      ok: true,
      remoteUrl,
      validated: false,
      reason: 'non-github-remote',
    };
  }

  const expectedUrls = buildExpectedGitHubRemoteUrls(assignment.owner, assignment.repo);
  const normalizedRemoteUrl = normalizeGitHubRemoteUrl(remoteUrl);
  if (!expectedUrls.has(normalizedRemoteUrl)) {
    throw new Error(
      `Repository checkout at ${assignment.localPath} points to ${remoteUrl}, expected ${assignment.owner}/${assignment.repo}.`,
    );
  }

  return {
    ok: true,
    remoteUrl,
    validated: true,
    reason: 'github-remote-match',
  };
}

function moveRepoCheckout(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.renameSync(sourcePath, destinationPath);
}

async function migrateLegacyCheckoutIfPresent(assignment) {
  if (fs.existsSync(assignment.repoPath) || !fs.existsSync(assignment.legacyRepoPath)) {
    return false;
  }

  if (!fs.existsSync(path.join(assignment.legacyRepoPath, '.git'))) {
    throw new Error(`Legacy repository checkout is invalid at ${assignment.legacyLocalPath}.`);
  }

  await verifyRepoRemote(assignment.legacyRepoPath, assignment);
  moveRepoCheckout(assignment.legacyRepoPath, assignment.repoPath);
  return true;
}

function resolveAssignment(userId, { owner, repo } = {}) {
  const assignedOwner = normalizeSegment(owner) || normalizeSegment(getSetting(userId, 'githubOwner'));
  const assignedRepo = normalizeSegment(repo) || normalizeSegment(getSetting(userId, 'githubRepo'));

  if (!assignedOwner || !assignedRepo) {
    return null;
  }

  return {
    owner: requireSafeSegment(assignedOwner, 'Repository owner'),
    repo: requireSafeSegment(assignedRepo, 'Repository name'),
  };
}

export function resolveAssignedRepoForUser({ userId, username, owner, repo }) {
  const assignment = resolveAssignment(userId, { owner, repo });
  if (!assignment) {
    return null;
  }

  const safeUsername = requireSafeSegment(username, 'GitHub username');
  const { repoSyncRoot } = getConfig();
  const rootPath = path.resolve(repoSyncRoot);
  const userRoot = path.resolve(rootPath, safeUsername);
  const ownerRoot = path.resolve(userRoot, assignment.owner);
  const repoPath = path.resolve(ownerRoot, assignment.repo);
  const legacyRepoPath = path.resolve(userRoot, assignment.repo);
  const localPath = path.posix.join(safeUsername, assignment.owner, assignment.repo);
  const legacyLocalPath = path.posix.join(safeUsername, assignment.repo);
  const relativeToRoot = path.relative(rootPath, repoPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Resolved repository path is outside the configured sync root.');
  }

  return {
    ...assignment,
    username: safeUsername,
    rootPath,
    userRoot,
    ownerRoot,
    repoPath,
    legacyRepoPath,
    localPath,
    legacyLocalPath,
  };
}

function encodeGitAuthHeader(token) {
  const raw = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  return `AUTHORIZATION: basic ${raw}`;
}

export async function runGitCommand(args, { cwd = process.cwd(), extraEnv = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `git command failed with exit code ${code}.`));
    });
  });
}

export async function runGit(args, { token, cwd = process.cwd() } = {}) {
  const authArg = encodeGitAuthHeader(token);
  const commandArgs = [
    '-c',
    `http.https://github.com/.extraheader=${authArg}`,
    ...args,
  ];

  return runGitCommand(commandArgs, { cwd });
}

function parseAheadBehind(value) {
  const [aheadRaw = '0', behindRaw = '0'] = String(value || '').trim().split(/\s+/);
  const ahead = Number.parseInt(aheadRaw, 10);
  const behind = Number.parseInt(behindRaw, 10);

  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

function getCommitIdentity(username) {
  const safeUsername = requireSafeSegment(username, 'GitHub username');
  return {
    name: safeUsername,
    email: `${safeUsername}@users.noreply.github.com`,
  };
}

export async function publishRepoChangesForUser({
  userId,
  username,
  owner,
  repo,
  filePaths = [],
  commitMessage = '',
  reason = 'manual-publish',
}) {
  const assignment = resolveAssignedRepoForUser({ userId, username, owner, repo });
  if (!assignment) {
    return {
      status: 'skipped',
      reason,
      publishState: 'no-assignment',
      owner: '',
      repo: '',
      username: normalizeSegment(username),
      localPath: '',
      branch: '',
      commitSha: '',
      message: 'No repository assignment configured.',
    };
  }

  const token = getTokenForUser(userId);
  if (!token) {
    throw new Error('GitHub token is unavailable for this user session.');
  }

  await migrateLegacyCheckoutIfPresent(assignment);

  const gitDirPath = path.join(assignment.repoPath, '.git');
  if (!fs.existsSync(assignment.repoPath) || !fs.existsSync(gitDirPath)) {
    throw new Error(`Repository checkout is not available at ${assignment.localPath}. Run refresh first.`);
  }

  const remoteCheck = await verifyRepoRemote(assignment.repoPath, assignment);

  const { stdout: branchName } = await runGitCommand(['-C', assignment.repoPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchName !== 'main') {
    throw new Error(`Publishing only supports the main branch right now. Current branch: ${branchName}`);
  }

  await runGit(['-C', assignment.repoPath, 'fetch', '--prune'], { token });
  const { stdout: counts } = await runGitCommand(['-C', assignment.repoPath, 'rev-list', '--left-right', '--count', 'HEAD...origin/main']);
  const { ahead, behind } = parseAheadBehind(counts);

  if (behind > 0) {
    return {
      status: 'skipped',
      reason,
      publishState: 'behind-remote',
      owner: assignment.owner,
      repo: assignment.repo,
      username: assignment.username,
      localPath: assignment.localPath,
      branch: branchName,
      commitSha: '',
      validatedRemote: remoteCheck.validated,
      remoteUrl: remoteCheck.remoteUrl,
      message: 'Local checkout is behind origin/main. Refresh the repository before publishing changes.',
    };
  }

  const normalizedPaths = Array.isArray(filePaths)
    ? filePaths.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (!normalizedPaths.length) {
    throw new Error('Publish file paths are required. Publish requests must explicitly scope the files to commit.');
  }

  await runGitCommand(['-C', assignment.repoPath, 'add', '-A', '--', ...normalizedPaths]);

  const { stdout: stagedStatus } = await runGitCommand(['-C', assignment.repoPath, 'diff', '--cached', '--name-only']);
  const stagedFiles = stagedStatus.split(/\r?\n/).filter(Boolean);

  if (!stagedFiles.length) {
    return {
      status: 'skipped',
      reason,
      publishState: 'no-changes',
      owner: assignment.owner,
      repo: assignment.repo,
      username: assignment.username,
      localPath: assignment.localPath,
      branch: branchName,
      commitSha: '',
      message: 'No local changes were staged for publishing.',
    };
  }

  const message = String(commitMessage || '').trim() || `sync notes from Scribe (${new Date().toISOString().slice(0, 10)})`;
  const identity = getCommitIdentity(assignment.username);
  await runGitCommand([
    '-C',
    assignment.repoPath,
    '-c',
    `user.name=${identity.name}`,
    '-c',
    `user.email=${identity.email}`,
    'commit',
    '-m',
    message,
  ]);

  const { stdout: commitSha } = await runGitCommand(['-C', assignment.repoPath, 'rev-parse', 'HEAD']);
  await runGit(['-C', assignment.repoPath, 'push', 'origin', 'main'], { token });
  await runGit(['-C', assignment.repoPath, 'fetch', '--prune', 'origin', 'main'], { token });
  const { stdout: remoteHeadSha } = await runGitCommand(['-C', assignment.repoPath, 'rev-parse', 'origin/main']);

  if (remoteHeadSha !== commitSha) {
    throw new Error('Push completed but remote verification failed: origin/main does not match the published commit.');
  }

  return {
    status: 'published',
    reason,
    publishState: ahead > 0 ? 'published-ahead' : 'published',
    owner: assignment.owner,
    repo: assignment.repo,
    username: assignment.username,
    localPath: assignment.localPath,
    branch: branchName,
    commitSha,
    remoteHeadSha,
    validatedRemote: remoteCheck.validated,
    remoteUrl: remoteCheck.remoteUrl,
    stagedFiles,
    message: `Published ${stagedFiles.length} file${stagedFiles.length === 1 ? '' : 's'} to origin/main.`,
  };
}

async function evaluatePullSafety(repoPath, token) {
  const { stdout: porcelain } = await runGitCommand(['-C', repoPath, 'status', '--porcelain']);
  if (porcelain.trim()) {
    return {
      canPull: false,
      syncState: 'local-changes',
      message: 'Local changes detected; skipping git pull to avoid merge conflicts.',
    };
  }

  const { stdout: branchName } = await runGitCommand(['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchName === 'HEAD') {
    return {
      canPull: false,
      syncState: 'detached-head',
      message: 'Repository is in detached HEAD state; skipping git pull.',
    };
  }

  try {
    await runGitCommand(['-C', repoPath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch {
    return {
      canPull: false,
      syncState: 'no-upstream',
      message: 'Repository has no upstream tracking branch; skipping git pull.',
    };
  }

  await runGit(['-C', repoPath, 'fetch', '--prune'], { token });
  const { stdout: counts } = await runGitCommand(['-C', repoPath, 'rev-list', '--left-right', '--count', 'HEAD...@{u}']);
  const { ahead, behind } = parseAheadBehind(counts);

  if (ahead > 0 && behind > 0) {
    return {
      canPull: false,
      syncState: 'diverged',
      message: 'Local and remote branches have diverged; skipping git pull.',
    };
  }

  if (ahead > 0) {
    return {
      canPull: false,
      syncState: 'ahead',
      message: 'Local branch is ahead of upstream; skipping git pull.',
    };
  }

  if (behind === 0) {
    return {
      canPull: false,
      syncState: 'up-to-date',
      message: 'Repository is already up to date.',
    };
  }

  return {
    canPull: true,
    syncState: 'behind',
    message: '',
  };
}

export async function syncAssignedRepoForUser({ userId, username, owner, repo, reason = 'manual-sync' }) {
  const assignment = resolveAssignedRepoForUser({ userId, username, owner, repo });
  if (!assignment) {
    return {
      status: 'skipped',
      reason,
      syncState: 'no-assignment',
      owner: '',
      repo: '',
      username: normalizeSegment(username),
      localPath: '',
      message: 'No repository assignment configured.',
    };
  }

  const token = getTokenForUser(userId);
  if (!token) {
    throw new Error('GitHub token is unavailable for this user session.');
  }

  fs.mkdirSync(assignment.ownerRoot, { recursive: true });
  await migrateLegacyCheckoutIfPresent(assignment);

  const gitDirPath = path.join(assignment.repoPath, '.git');
  const repoExists = fs.existsSync(assignment.repoPath);
  const hasGitMetadata = fs.existsSync(gitDirPath);

  if (!repoExists) {
    await runGit([
      'clone',
      `https://github.com/${assignment.owner}/${assignment.repo}.git`,
      assignment.repoPath,
    ], { token });

    const remoteCheck = await verifyRepoRemote(assignment.repoPath, assignment);

    const result = {
      status: 'cloned',
      reason,
      syncState: 'cloned',
      owner: assignment.owner,
      repo: assignment.repo,
      username: assignment.username,
      localPath: assignment.localPath,
      validatedRemote: remoteCheck.validated,
      remoteUrl: remoteCheck.remoteUrl,
      message: 'Repository cloned successfully.',
    };
    triggerBackgroundIndexing(userId, assignment);
    return result;
  }

  if (!hasGitMetadata) {
    throw new Error(`Target path exists but is not a git repository: ${assignment.localPath}`);
  }

  const remoteCheck = await verifyRepoRemote(assignment.repoPath, assignment);

  const pullSafety = await evaluatePullSafety(assignment.repoPath, token);
  if (!pullSafety.canPull) {
    const result = {
      status: 'skipped',
      reason,
      syncState: pullSafety.syncState,
      owner: assignment.owner,
      repo: assignment.repo,
      username: assignment.username,
      localPath: assignment.localPath,
      validatedRemote: remoteCheck.validated,
      remoteUrl: remoteCheck.remoteUrl,
      message: pullSafety.message,
    };
    triggerBackgroundIndexing(userId, assignment);
    return result;
  }

  await runGit([
    '-C',
    assignment.repoPath,
    'pull',
    '--ff-only',
  ], { token });

  const result = {
    status: 'pulled',
    reason,
    syncState: 'pulled',
    owner: assignment.owner,
    repo: assignment.repo,
    username: assignment.username,
    localPath: assignment.localPath,
    validatedRemote: remoteCheck.validated,
    remoteUrl: remoteCheck.remoteUrl,
    message: 'Repository updated successfully.',
  };
  triggerBackgroundIndexing(userId, assignment);
  return result;
}

// ── Post-sync indexing ────────────────────────────────────────────────────────

/**
 * Fire-and-forget background indexer. Called after every sync completion.
 * Never throws and never blocks the caller.
 */
function triggerBackgroundIndexing(userId, assignment) {
  indexRepoIncremental({
    userId,
    owner: assignment.owner,
    repo: assignment.repo,
    repoPath: assignment.repoPath,
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[repo-index] Background index failed:', err?.message);
  });
}
