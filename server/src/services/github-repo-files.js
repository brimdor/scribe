import fs from 'node:fs';
import path from 'node:path';
import { resolveAssignedRepoForUser } from './github-repo-sync.js';

const DEFAULT_TREE_LIMIT = 120;
const MAX_TREE_LIMIT = 500;
const DEFAULT_MAX_BYTES = 48 * 1024;
const MAX_BYTES_LIMIT = 512 * 1024;
const DEFAULT_MAX_LINES = 220;
const MAX_LINES_LIMIT = 2000;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ensureAssignedRepo(target) {
  if (!target) {
    throw new Error('No repository assignment configured.');
  }

  if (!fs.existsSync(target.repoPath)) {
    throw new Error(`Repository checkout is not available at ${target.localPath}. Run sync first.`);
  }

  if (!fs.existsSync(path.join(target.repoPath, '.git'))) {
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

export function listRepoTreeForUser({ userId, username, owner, repo, dir = '', limit = DEFAULT_TREE_LIMIT }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  ensureAssignedRepo(target);

  const safeLimit = Math.min(toPositiveInt(limit, DEFAULT_TREE_LIMIT), MAX_TREE_LIMIT);
  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, dir, 'Directory path', { allowEmpty: true });

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Directory path does not exist: ${normalizedPath || '.'}`);
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) {
    throw new Error(`Directory path is not a folder: ${normalizedPath || '.'}`);
  }

  const dirEntries = fs.readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => entry.name !== '.git')
    .sort((left, right) => {
      if (left.isDirectory() && !right.isDirectory()) return -1;
      if (!left.isDirectory() && right.isDirectory()) return 1;
      return left.name.localeCompare(right.name);
    });

  const visibleEntries = dirEntries.slice(0, safeLimit).map((entry) => ({
    type: entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other',
    path: path.posix.join(normalizedPath, entry.name),
    name: entry.name,
  }));

  return {
    owner: target.owner,
    repo: target.repo,
    username: target.username,
    localPath: target.localPath,
    dir: normalizedPath,
    entries: visibleEntries,
    truncated: dirEntries.length > safeLimit,
  };
}

export function readRepoFileForUser({
  userId,
  username,
  owner,
  repo,
  filePath,
  maxBytes = DEFAULT_MAX_BYTES,
  maxLines = DEFAULT_MAX_LINES,
}) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  ensureAssignedRepo(target);

  const safeBytes = Math.min(toPositiveInt(maxBytes, DEFAULT_MAX_BYTES), MAX_BYTES_LIMIT);
  const safeLines = Math.min(toPositiveInt(maxLines, DEFAULT_MAX_LINES), MAX_LINES_LIMIT);
  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, filePath, 'File path', { allowEmpty: false });

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File path does not exist: ${normalizedPath}`);
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`File path is not a regular file: ${normalizedPath}`);
  }

  const originalBuffer = fs.readFileSync(absolutePath);
  if (isLikelyBinary(originalBuffer)) {
    throw new Error(`Binary file is not supported for assistant context: ${normalizedPath}`);
  }

  const byteSlice = originalBuffer.subarray(0, safeBytes);
  const byteTruncated = originalBuffer.length > safeBytes;
  const decoded = byteSlice.toString('utf8');
  const decodedLines = decoded.split(/\r?\n/);
  const lineTruncated = decodedLines.length > safeLines;
  const contentLines = lineTruncated ? decodedLines.slice(0, safeLines) : decodedLines;

  return {
    owner: target.owner,
    repo: target.repo,
    username: target.username,
    localPath: target.localPath,
    path: normalizedPath,
    content: contentLines.join('\n'),
    truncated: byteTruncated || lineTruncated,
    totalBytes: originalBuffer.length,
    totalLines: decodedLines.length,
  };
}
