import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getConfig } from '../config/env.js';
import { getSetting } from './storage-store.js';
import { getTokenForUser } from './user-store.js';

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
  const repoPath = path.resolve(userRoot, assignment.repo);
  const localPath = path.posix.join(safeUsername, assignment.repo);
  const relativeToRoot = path.relative(rootPath, repoPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Resolved repository path is outside the configured sync root.');
  }

  return {
    ...assignment,
    username: safeUsername,
    rootPath,
    userRoot,
    repoPath,
    localPath,
  };
}

function encodeGitAuthHeader(token) {
  const raw = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  return `AUTHORIZATION: basic ${raw}`;
}

async function runGitCommand(args, { cwd = process.cwd(), extraEnv = {} } = {}) {
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

async function runGit(args, { token, cwd = process.cwd() } = {}) {
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

  fs.mkdirSync(assignment.userRoot, { recursive: true });

  const gitDirPath = path.join(assignment.repoPath, '.git');
  const repoExists = fs.existsSync(assignment.repoPath);
  const hasGitMetadata = fs.existsSync(gitDirPath);

  if (!repoExists) {
    await runGit([
      'clone',
      `https://github.com/${assignment.owner}/${assignment.repo}.git`,
      assignment.repoPath,
    ], { token });

    return {
      status: 'cloned',
      reason,
      syncState: 'cloned',
      owner: assignment.owner,
      repo: assignment.repo,
      username: assignment.username,
      localPath: assignment.localPath,
      message: 'Repository cloned successfully.',
    };
  }

  if (!hasGitMetadata) {
    throw new Error(`Target path exists but is not a git repository: ${assignment.localPath}`);
  }

  const pullSafety = await evaluatePullSafety(assignment.repoPath, token);
  if (!pullSafety.canPull) {
    return {
      status: 'skipped',
      reason,
      syncState: pullSafety.syncState,
      owner: assignment.owner,
      repo: assignment.repo,
      username: assignment.username,
      localPath: assignment.localPath,
      message: pullSafety.message,
    };
  }

  await runGit([
    '-C',
    assignment.repoPath,
    'pull',
    '--ff-only',
  ], { token });

  return {
    status: 'pulled',
    reason,
    syncState: 'pulled',
    owner: assignment.owner,
    repo: assignment.repo,
    username: assignment.username,
    localPath: assignment.localPath,
    message: 'Repository updated successfully.',
  };
}
