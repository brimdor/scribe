import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { resolveAssignedRepoForUser, runGitCommand } from './github-repo-sync.js';

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

async function pathExists(targetPath) {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch {
    return false;
  }
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

async function collectMarkdownFiles(basePath, relativeDir, results) {
  if (results.length >= MAX_MARKDOWN_FILES) {
    return;
  }

  const entries = await readSortedEntries(basePath);

  for (const entry of entries) {
    if (results.length >= MAX_MARKDOWN_FILES) {
      return;
    }

    const nextRelativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;
    const nextAbsolutePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      await collectMarkdownFiles(nextAbsolutePath, nextRelativePath, results);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push({
        path: nextRelativePath,
        absolutePath: nextAbsolutePath,
      });
    }
  }
}

function normalizeTag(tag) {
  return String(tag || '').trim().replace(/^#+/, '').toLowerCase();
}

function parseFrontmatterTags(frontmatter) {
  const tags = [];
  const lines = frontmatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^tags\s*:\s*(.*)$/i);
    if (!match) {
      continue;
    }

    const remainder = match[1].trim();
    if (remainder.startsWith('[') && remainder.endsWith(']')) {
      remainder.slice(1, -1).split(',').forEach((value) => tags.push(value.trim()));
      break;
    }

    if (remainder) {
      remainder.split(',').forEach((value) => tags.push(value.trim()));
      break;
    }

    for (let subIndex = index + 1; subIndex < lines.length; subIndex += 1) {
      const nested = lines[subIndex].match(/^\s*-\s*(.+)$/);
      if (!nested) {
        break;
      }
      tags.push(nested[1].trim());
      index = subIndex;
    }
  }

  return tags
    .map((tag) => tag.replace(/^['"]+|['"]+$/g, ''))
    .map(normalizeTag)
    .filter(Boolean);
}

function parseInlineTags(content) {
  const matches = new Set();
  const pattern = /(^|[\s(])#([A-Za-z][A-Za-z0-9/_-]*)\b/gm;
  let match = pattern.exec(content);

  while (match) {
    const tag = normalizeTag(match[2]);
    if (tag) {
      matches.add(tag);
    }
    match = pattern.exec(content);
  }

  return Array.from(matches);
}

function extractMarkdownTags(content) {
  const normalized = String(content || '');
  const frontmatterMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatter = frontmatterMatch?.[1] || '';
  const body = frontmatterMatch ? normalized.slice(frontmatterMatch[0].length) : normalized;

  return Array.from(new Set([
    ...parseFrontmatterTags(frontmatter),
    ...parseInlineTags(body),
  ])).sort((left, right) => left.localeCompare(right));
}

function extractFrontmatterBlock(content) {
  const normalized = String(content || '');
  const frontmatterMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  return {
    raw: frontmatterMatch?.[1] || '',
    body: frontmatterMatch ? normalized.slice(frontmatterMatch[0].length) : normalized,
  };
}

function parseFrontmatterData(frontmatter) {
  const data = {};
  const lines = String(frontmatter || '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pair = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!pair) {
      continue;
    }

    const key = pair[1];
    const remainder = pair[2].trim();
    if (remainder.startsWith('[') && remainder.endsWith(']')) {
      data[key] = remainder.slice(1, -1).split(',').map((value) => value.trim().replace(/^['"]+|['"]+$/g, '')).filter(Boolean);
      continue;
    }

    if (remainder) {
      data[key] = remainder.replace(/^['"]+|['"]+$/g, '');
      continue;
    }

    const items = [];
    for (let subIndex = index + 1; subIndex < lines.length; subIndex += 1) {
      const nested = lines[subIndex].match(/^\s*-\s*(.+)$/);
      if (!nested) {
        break;
      }
      items.push(nested[1].trim().replace(/^['"]+|['"]+$/g, ''));
      index = subIndex;
    }

    data[key] = items;
  }

  return data;
}

function extractHeadingTitle(body, fallbackPath = '') {
  const headingMatch = String(body || '').match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }

  const baseName = path.basename(fallbackPath || '', path.extname(fallbackPath || ''));
  return baseName || 'Untitled';
}

function buildNoteSummary(filePath, content, stat = null) {
  const { raw, body } = extractFrontmatterBlock(content);
  const frontmatter = parseFrontmatterData(raw);
  const tags = extractMarkdownTags(content);
  const title = typeof frontmatter.title === 'string' && frontmatter.title.trim()
    ? frontmatter.title.trim()
    : extractHeadingTitle(body, filePath);

  return {
    path: filePath,
    title,
    tags,
    frontmatter,
    hasFrontmatter: !!raw,
    modifiedAt: stat?.mtime?.toISOString?.() || '',
  };
}

async function getMarkdownFilesForTarget(target, dir = '') {
  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, dir, 'Directory path', { allowEmpty: true });
  if (!await pathExists(absolutePath)) {
    throw new Error(`Directory path does not exist: ${normalizedPath || '.'}`);
  }

  const stat = await fsPromises.stat(absolutePath);
  if (!stat.isDirectory()) {
    throw new Error(`Directory path is not a folder: ${normalizedPath || '.'}`);
  }

  const markdownFiles = [];
  await collectMarkdownFiles(absolutePath, normalizedPath, markdownFiles);
  return markdownFiles;
}

export async function listRepoTreeForUser({ userId, username, owner, repo, dir = '', limit = DEFAULT_TREE_LIMIT }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

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
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

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
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

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

export async function writeRepoFileForUser({
  userId,
  username,
  owner,
  repo,
  filePath,
  content,
  createDirectories = true,
}) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  if (typeof content !== 'string') {
    throw new Error('Text content is required.');
  }

  if (content.includes('\u0000')) {
    throw new Error('Binary file content is not supported for repository writes.');
  }

  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, filePath, 'File path', { allowEmpty: false });
  const parentDir = path.dirname(absolutePath);

  if (!await pathExists(parentDir)) {
    if (!createDirectories) {
      throw new Error(`Parent directory does not exist for file path: ${normalizedPath}`);
    }

    await fsPromises.mkdir(parentDir, { recursive: true });
  }

  const existed = await pathExists(absolutePath);
  if (existed && !(await fsPromises.stat(absolutePath)).isFile()) {
    throw new Error(`File path is not a regular file: ${normalizedPath}`);
  }

  await fsPromises.writeFile(absolutePath, content, 'utf8');

  return {
    ...buildToolTarget(target),
    path: normalizedPath,
    bytesWritten: Buffer.byteLength(content, 'utf8'),
    created: !existed,
    message: existed ? 'Repository file updated successfully.' : 'Repository file created successfully.',
  };
}

export async function moveRepoFileForUser({
  userId,
  username,
  owner,
  repo,
  fromPath,
  toPath,
  createDirectories = true,
}) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const source = resolveWithinRepo(target.repoPath, fromPath, 'Source path', { allowEmpty: false });
  const destination = resolveWithinRepo(target.repoPath, toPath, 'Destination path', { allowEmpty: false });

  if (source.normalizedPath === destination.normalizedPath) {
    throw new Error('Destination path must be different from the source path.');
  }

  if (!await pathExists(source.absolutePath)) {
    throw new Error(`Source path does not exist: ${source.normalizedPath}`);
  }

  const sourceStat = await fsPromises.stat(source.absolutePath);
  if (!sourceStat.isFile()) {
    throw new Error(`Source path is not a regular file: ${source.normalizedPath}`);
  }

  const parentDir = path.dirname(destination.absolutePath);
  if (!await pathExists(parentDir)) {
    if (!createDirectories) {
      throw new Error(`Parent directory does not exist for destination path: ${destination.normalizedPath}`);
    }

    await fsPromises.mkdir(parentDir, { recursive: true });
  }

  const existed = await pathExists(destination.absolutePath);
  if (existed && !(await fsPromises.stat(destination.absolutePath)).isFile()) {
    throw new Error(`Destination path is not a regular file: ${destination.normalizedPath}`);
  }

  await fsPromises.rename(source.absolutePath, destination.absolutePath);

  return {
    ...buildToolTarget(target),
    fromPath: source.normalizedPath,
    path: destination.normalizedPath,
    overwritten: existed,
    message: 'Repository file moved successfully.',
  };
}

export async function deleteRepoFileForUser({ userId, username, owner, repo, filePath }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, filePath, 'File path', { allowEmpty: false });
  if (!await pathExists(absolutePath)) {
    throw new Error(`File path does not exist: ${normalizedPath}`);
  }

  const stat = await fsPromises.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`File path is not a regular file: ${normalizedPath}`);
  }

  await fsPromises.unlink(absolutePath);

  return {
    ...buildToolTarget(target),
    path: normalizedPath,
    deleted: true,
    message: 'Repository file deleted successfully.',
  };
}

export async function listRepoNoteTagsForUser({ userId, username, owner, repo }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const markdownFiles = await getMarkdownFilesForTarget(target);

  const tagMap = new Map();
  let scannedFiles = 0;

  for (const file of markdownFiles) {
    const buffer = await fsPromises.readFile(file.absolutePath);
    if (isLikelyBinary(buffer)) {
      continue;
    }

    scannedFiles += 1;
    const content = buffer.toString('utf8');
    const tags = extractMarkdownTags(content);

    for (const tag of tags) {
      const existing = tagMap.get(tag) || {
        tag,
        count: 0,
        files: [],
      };

      existing.count += 1;
      if (existing.files.length < 5) {
        existing.files.push(file.path);
      }

      tagMap.set(tag, existing);
    }
  }

  return {
    ...buildToolTarget(target),
    scannedFiles,
    tags: Array.from(tagMap.values()).sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.tag.localeCompare(right.tag);
    }),
  };
}

export async function listRepoNotesForUser({ userId, username, owner, repo, dir = '', limit = DEFAULT_NOTE_LIST_LIMIT }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const markdownFiles = await getMarkdownFilesForTarget(target, dir);
  const safeLimit = clamp(limit, DEFAULT_NOTE_LIST_LIMIT, MAX_NOTE_LIST_LIMIT);

  const notes = await Promise.all(markdownFiles
    .slice(0, safeLimit)
    .map(async (file) => {
      const [content, stat] = await Promise.all([
        fsPromises.readFile(file.absolutePath, 'utf8'),
        fsPromises.stat(file.absolutePath),
      ]);
      return buildNoteSummary(file.path, content, stat);
    }));

  return {
    ...buildToolTarget(target),
    dir: normalizeRelativePath(dir, 'Directory path', { allowEmpty: true }),
    notes,
    truncated: markdownFiles.length > safeLimit,
  };
}

export async function findRepoNotesByTagForUser({ userId, username, owner, repo, tag, limit = DEFAULT_NOTE_LIST_LIMIT }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const normalizedTag = normalizeTag(tag);
  if (!normalizedTag) {
    throw new Error('Tag is required.');
  }

  const markdownFiles = await getMarkdownFilesForTarget(target);
  const safeLimit = clamp(limit, DEFAULT_NOTE_LIST_LIMIT, MAX_NOTE_LIST_LIMIT);
  const notes = [];

  for (const file of markdownFiles) {
    if (notes.length >= safeLimit) {
      break;
    }

    const [stat, content] = await Promise.all([
      fsPromises.stat(file.absolutePath),
      fsPromises.readFile(file.absolutePath, 'utf8'),
    ]);
    const summary = buildNoteSummary(file.path, content, stat);

    if (summary.tags.includes(normalizedTag)) {
      notes.push(summary);
    }
  }

  return {
    ...buildToolTarget(target),
    tag: normalizedTag,
    notes,
    truncated: notes.length >= safeLimit,
  };
}

export async function readRepoNoteFrontmatterForUser({ userId, username, owner, repo, filePath }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, filePath, 'File path', { allowEmpty: false });
  if (!normalizedPath.toLowerCase().endsWith('.md')) {
    throw new Error('Note frontmatter is only supported for markdown files.');
  }

  if (!await pathExists(absolutePath)) {
    throw new Error(`File path does not exist: ${normalizedPath}`);
  }

  const stat = await fsPromises.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`File path is not a regular file: ${normalizedPath}`);
  }

  const content = await fsPromises.readFile(absolutePath, 'utf8');
  const summary = buildNoteSummary(normalizedPath, content, stat);

  return {
    ...buildToolTarget(target),
    ...summary,
  };
}

export async function getRepoGitStatusForUser({ userId, username, owner, repo }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const { stdout } = await runGitCommand(['-C', target.repoPath, 'status', '--short', '--branch']);
  const lines = stdout.split(/\r?\n/).filter(Boolean);

  return {
    ...buildToolTarget(target),
    clean: lines.length <= 1,
    branch: lines[0] || '',
    entries: lines.slice(1),
    output: trimOutput(stdout),
  };
}

export async function getRepoGitDiffForUser({ userId, username, owner, repo, filePath = '' }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const args = ['-C', target.repoPath, 'diff'];
  let normalizedPath = '';
  if (String(filePath || '').trim()) {
    normalizedPath = normalizeRelativePath(filePath, 'File path', { allowEmpty: false });
    args.push('--', normalizedPath);
  }

  const { stdout } = await runGitCommand(args);

  return {
    ...buildToolTarget(target),
    path: normalizedPath,
    output: trimOutput(stdout),
    hasChanges: !!stdout.trim(),
  };
}

export async function getRepoGitLogForUser({ userId, username, owner, repo, limit = DEFAULT_GIT_LOG_LIMIT }) {
  const target = resolveAssignedRepoForUser({ userId, username, owner, repo });
  await ensureAssignedRepo(target);

  const safeLimit = clamp(limit, DEFAULT_GIT_LOG_LIMIT, MAX_GIT_LOG_LIMIT);
  const { stdout } = await runGitCommand([
    '-C',
    target.repoPath,
    'log',
    `--max-count=${safeLimit}`,
    '--date=short',
    '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s',
  ]);

  const entries = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, author, date, subject] = line.split('\u001f');
      return {
        sha,
        shortSha,
        author,
        date,
        subject,
      };
    });

  return {
    ...buildToolTarget(target),
    entries,
    output: trimOutput(entries.map((entry) => `${entry.shortSha} ${entry.subject} (${entry.date}, ${entry.author})`).join('\n')),
  };
}
