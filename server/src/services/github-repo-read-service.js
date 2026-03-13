import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_TREE_LIMIT,
  MAX_BYTES_LIMIT,
  MAX_LINES_LIMIT,
  MAX_SEARCH_FILE_BYTES,
  MAX_SEARCH_LIMIT,
  MAX_TREE_LIMIT,
  buildToolTarget,
  clamp,
  isLikelyBinary,
  pathExists,
  readSortedEntries,
  resolveRepoTarget,
  resolveWithinRepo,
  toPositiveInt,
} from './github-repo-files-shared.js';

function buildPreview(content, matchIndex, queryLength) {
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(content.length, matchIndex + queryLength + 80);
  return content.slice(start, end).replace(/\s+/g, ' ').trim();
}

function countLinesBefore(content, matchIndex) {
  if (matchIndex <= 0) {
    return 1;
  }

  return content.slice(0, matchIndex).split(/\r?\n/).length;
}

async function collectTextSearchResults(basePath, relativeDir, query, limit, results) {
  if (results.length >= limit) {
    return;
  }

  const entries = await readSortedEntries(basePath);

  for (const entry of entries) {
    if (results.length >= limit) {
      return;
    }

    const nextRelativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;
    const nextAbsolutePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      await collectTextSearchResults(nextAbsolutePath, nextRelativePath, query, limit, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const buffer = await fsPromises.readFile(nextAbsolutePath);
    if (isLikelyBinary(buffer)) {
      continue;
    }

    const decoded = buffer.subarray(0, MAX_SEARCH_FILE_BYTES).toString('utf8');
    const haystack = decoded.toLowerCase();
    const matchIndex = haystack.indexOf(query);
    if (matchIndex < 0) {
      continue;
    }

    results.push({
      path: nextRelativePath,
      line: countLinesBefore(decoded, matchIndex),
      preview: buildPreview(decoded, matchIndex, query.length),
      truncated: buffer.length > MAX_SEARCH_FILE_BYTES,
    });
  }
}

export async function listRepoTreeForUser({ userId, username, owner, repo, dir = '', limit = DEFAULT_TREE_LIMIT }) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
  const safeLimit = Math.min(toPositiveInt(limit, DEFAULT_TREE_LIMIT), MAX_TREE_LIMIT);
  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, dir, 'Directory path', { allowEmpty: true });

  if (!await pathExists(absolutePath)) {
    throw new Error(`Directory path does not exist: ${normalizedPath || '.'}`);
  }

  const stat = await fsPromises.stat(absolutePath);
  if (!stat.isDirectory()) {
    throw new Error(`Directory path is not a folder: ${normalizedPath || '.'}`);
  }

  const dirEntries = await readSortedEntries(absolutePath);
  const visibleEntries = dirEntries.slice(0, safeLimit).map((entry) => ({
    type: entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other',
    path: path.posix.join(normalizedPath, entry.name),
    name: entry.name,
  }));

  return {
    ...buildToolTarget(target),
    dir: normalizedPath,
    entries: visibleEntries,
    truncated: dirEntries.length > safeLimit,
  };
}

export async function readRepoFileForUser({
  userId,
  username,
  owner,
  repo,
  filePath,
  maxBytes = DEFAULT_MAX_BYTES,
  maxLines = DEFAULT_MAX_LINES,
}) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
  const safeBytes = Math.min(toPositiveInt(maxBytes, DEFAULT_MAX_BYTES), MAX_BYTES_LIMIT);
  const safeLines = Math.min(toPositiveInt(maxLines, DEFAULT_MAX_LINES), MAX_LINES_LIMIT);
  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, filePath, 'File path', { allowEmpty: false });

  if (!await pathExists(absolutePath)) {
    throw new Error(`File path does not exist: ${normalizedPath}`);
  }

  const stat = await fsPromises.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`File path is not a regular file: ${normalizedPath}`);
  }

  const originalBuffer = await fsPromises.readFile(absolutePath);
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
    ...buildToolTarget(target),
    path: normalizedPath,
    content: contentLines.join('\n'),
    truncated: byteTruncated || lineTruncated,
    totalBytes: originalBuffer.length,
    totalLines: decodedLines.length,
  };
}

export async function searchRepoFilesForUser({ userId, username, owner, repo, query, dir = '', limit = DEFAULT_SEARCH_LIMIT }) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    throw new Error('Search query is required.');
  }

  const safeLimit = clamp(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, dir, 'Directory path', { allowEmpty: true });
  if (!await pathExists(absolutePath)) {
    throw new Error(`Directory path does not exist: ${normalizedPath || '.'}`);
  }

  const stat = await fsPromises.stat(absolutePath);
  if (!stat.isDirectory()) {
    throw new Error(`Directory path is not a folder: ${normalizedPath || '.'}`);
  }

  const results = [];
  await collectTextSearchResults(absolutePath, normalizedPath, normalizedQuery, safeLimit, results);

  return {
    ...buildToolTarget(target),
    dir: normalizedPath,
    query: normalizedQuery,
    results,
    truncated: results.length >= safeLimit,
  };
}
