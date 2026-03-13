import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { resolveAssignedRepoForUser } from './github-repo-sync.js';

const DEFAULT_TREE_LIMIT = 120;
const MAX_TREE_LIMIT = 500;
const DEFAULT_MAX_BYTES = 48 * 1024;
const MAX_BYTES_LIMIT = 512 * 1024;
const DEFAULT_MAX_LINES = 220;
const MAX_LINES_LIMIT = 2000;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
const MAX_SEARCH_FILE_BYTES = 128 * 1024;
const DEFAULT_GIT_LOG_LIMIT = 10;
const MAX_GIT_LOG_LIMIT = 50;
const MAX_GIT_OUTPUT_CHARS = 24 * 1024;
const MAX_MARKDOWN_FILES = 500;
const DEFAULT_NOTE_LIST_LIMIT = 60;
const MAX_NOTE_LIST_LIMIT = 250;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function pathExists(targetPath) {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureAssignedRepo(target) {
  if (!target) {
    throw new Error('No repository assignment configured.');
  }

  if (!await pathExists(target.repoPath)) {
    throw new Error(`Repository checkout is not available at ${target.localPath}. Run sync first.`);
  }

  if (!await pathExists(path.join(target.repoPath, '.git'))) {
    throw new Error(`Repository checkout is invalid at ${target.localPath}.`);
  }
}

function normalizeRelativePath(value, label, { allowEmpty = true } = {}) {
  const raw = String(value || '').trim();
  if (!raw) {
    if (allowEmpty) {
      return '';
    }

    throw new Error(`${label} is required.`);
  }

  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);

  if (!parts.length) {
    if (allowEmpty) {
      return '';
    }

    throw new Error(`${label} is required.`);
  }

  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error(`${label} contains an invalid path segment.`);
    }
  }

  return parts.join('/');
}

function resolveWithinRepo(repoPath, relativePath, label, options) {
  const normalized = normalizeRelativePath(relativePath, label, options);
  const absolutePath = path.resolve(repoPath, normalized || '.');
  const relative = path.relative(repoPath, absolutePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the repository.`);
  }

  return {
    absolutePath,
    normalizedPath: normalized,
  };
}

function isLikelyBinary(buffer) {
  return buffer.includes(0);
}

function clamp(value, fallback, max) {
  return Math.min(toPositiveInt(value, fallback), max);
}

function trimOutput(value, maxChars = MAX_GIT_OUTPUT_CHARS) {
  const normalized = String(value || '');
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 1)}…` : normalized;
}

async function readSortedEntries(basePath) {
  const entries = await fsPromises.readdir(basePath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name !== '.git')
    .sort((left, right) => {
      if (left.isDirectory() && !right.isDirectory()) return -1;
      if (!left.isDirectory() && right.isDirectory()) return 1;
      return left.name.localeCompare(right.name);
    });
}

function buildToolTarget(target) {
  return {
    owner: target.owner,
    repo: target.repo,
    username: target.username,
    localPath: target.localPath,
  };
}

async function resolveRepoTarget({ userId, username, owner, repo }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);
  return target;
}

export {
  DEFAULT_GIT_LOG_LIMIT,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  DEFAULT_NOTE_LIST_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_TREE_LIMIT,
  MAX_GIT_LOG_LIMIT,
  MAX_GIT_OUTPUT_CHARS,
  MAX_LINES_LIMIT,
  MAX_MARKDOWN_FILES,
  MAX_BYTES_LIMIT,
  MAX_NOTE_LIST_LIMIT,
  MAX_SEARCH_FILE_BYTES,
  MAX_SEARCH_LIMIT,
  MAX_TREE_LIMIT,
  buildToolTarget,
  clamp,
  ensureAssignedRepo,
  isLikelyBinary,
  normalizeRelativePath,
  pathExists,
  readSortedEntries,
  resolveRepoTarget,
  resolveWithinRepo,
  toPositiveInt,
  trimOutput,
};
