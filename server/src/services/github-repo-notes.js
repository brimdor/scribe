import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_NOTE_LIST_LIMIT,
  MAX_MARKDOWN_FILES,
  MAX_NOTE_LIST_LIMIT,
  buildToolTarget,
  clamp,
  isLikelyBinary,
  normalizeRelativePath,
  pathExists,
  readSortedEntries,
  resolveRepoTarget,
  resolveWithinRepo,
} from './github-repo-files-shared.js';

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

export async function listRepoNoteTagsForUser({ userId, username, owner, repo }) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
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
      const existing = tagMap.get(tag) || { tag, count: 0, files: [] };
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
  const target = await resolveRepoTarget({ userId, username, owner, repo });
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
  const target = await resolveRepoTarget({ userId, username, owner, repo });
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
  const target = await resolveRepoTarget({ userId, username, owner, repo });
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
