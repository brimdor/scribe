import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import {
  upsertIndexEntries,
  deleteStaleIndexEntries,
  setIndexMeta,
  getIndexMeta,
} from './repo-index-store.js';
import { runGitCommand } from './github-repo-sync.js';

// ── Metadata extraction ───────────────────────────────────────────────────────

function normalizeTag(tag) {
  return String(tag || '').trim().replace(/^#+/, '').toLowerCase();
}

function parseFrontmatterTags(frontmatter) {
  const tags = [];
  const lines = frontmatter.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^tags\s*:\s*(.*)$/i);
    if (!match) continue;

    const remainder = match[1].trim();
    if (remainder.startsWith('[') && remainder.endsWith(']')) {
      remainder.slice(1, -1).split(',').forEach((v) => tags.push(v.trim()));
      break;
    }
    if (remainder) {
      remainder.split(',').forEach((v) => tags.push(v.trim()));
      break;
    }

    for (let j = i + 1; j < lines.length; j++) {
      const nested = lines[j].match(/^\s*-\s*(.+)$/);
      if (!nested) break;
      tags.push(nested[1].trim());
      i = j;
    }
  }

  return tags
    .map((t) => t.replace(/^['"]+|'+$/g, ''))
    .map(normalizeTag)
    .filter(Boolean);
}

function parseInlineTags(content) {
  const matches = new Set();
  const pattern = /(^|[\s(])#([A-Za-z][A-Za-z0-9/_-]*)\b/g;
  let match = pattern.exec(content);
  while (match) {
    const tag = normalizeTag(match[2]);
    if (tag) matches.add(tag);
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
  ])).sort((a, b) => a.localeCompare(b));
}

function extractHeadings(content) {
  const headings = [];
  const pattern = /^#{2,3}\s+(.+)$/gm;
  let match = pattern.exec(content);
  while (match) {
    headings.push(match[1].trim());
    match = pattern.exec(content);
  }
  return headings;
}

function extractTitle(frontmatter, body, filePath) {
  const frontmatterMatch = String(frontmatter || '').match(/^title\s*:\s*(.*)$/im);
  if (frontmatterMatch?.[1]?.trim()) {
    return frontmatterMatch[1].trim().replace(/^['"]+|'+$/g, '');
  }
  const headingMatch = String(body || '').match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]?.trim()) {
    return headingMatch[1].trim();
  }
  return path.basename(String(filePath || ''), '.md') || 'Untitled';
}

function buildContentSnippet(body) {
  return String(body || '')
    .replace(/^#+\s+.+$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*`_~]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 500);
}

function buildNoteMetadata(filePath, content, stat) {
  const normalized = String(content || '');
  const frontmatterMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatter = frontmatterMatch?.[1] || '';
  const body = frontmatterMatch ? normalized.slice(frontmatterMatch[0].length) : normalized;

  return {
    title: extractTitle(frontmatter, body, filePath),
    tags: extractMarkdownTags(normalized),
    headings: extractHeadings(normalized),
    contentSnippet: buildContentSnippet(body),
    modifiedAt: stat?.mtime?.toISOString?.() || new Date().toISOString(),
  };
}

// ── File discovery ────────────────────────────────────────────────────────────

async function collectMarkdownFiles(basePath) {
  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath); // eslint-disable-line no-await-in-loop
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
        results.push({ absolutePath: fullPath, relativePath });
      }
    }
  }

  await walk(basePath);
  return results;
}

// ── Git diff helpers ──────────────────────────────────────────────────────────

async function getCurrentHead(repoPath) {
  const { stdout } = await runGitCommand(['-C', repoPath, 'rev-parse', 'HEAD']);
  return String(stdout || '').trim();
}

async function getChangedFiles(repoPath, fromCommit, toCommit) {
  const { stdout } = await runGitCommand([
    '-C', repoPath, 'diff', '--name-only', `${fromCommit}..${toCommit}`,
  ]);
  const lines = String(stdout || '').trim().split('\n').filter(Boolean);
  return new Set(lines);
}

async function getDeletedFiles(repoPath, fromCommit, toCommit) {
  const { stdout } = await runGitCommand([
    '-C', repoPath, 'diff', '--name-status', `--ancestry-path=${fromCommit}..${toCommit}`,
  ]);
  const deleted = new Set();
  for (const line of String(stdout || '').trim().split('\n')) {
    const parts = line.split('\t');
    if (parts[0] === 'D') deleted.add(parts[1]);
  }
  return deleted;
}

// ── Batch processing ──────────────────────────────────────────────────────────

const BATCH_SIZE = 50;

async function processFilesBatch(files, userId, owner, repo) {
  const rows = [];

  for (const { absolutePath, relativePath } of files) {
    let stat;
    let buffer;
    try {
      stat = await fsPromises.stat(absolutePath);
      if (stat.size > 512 * 1024) continue; // Skip files > 512 KB
      buffer = await fsPromises.readFile(absolutePath);
      if (buffer.includes(0)) continue; // Skip binary
    } catch {
      continue;
    }

    const content = buffer.toString('utf8');
    const metadata = buildNoteMetadata(relativePath, content, stat);
    rows.push({
      userId,
      owner,
      repo,
      filePath: relativePath,
      ...metadata,
    });
  }

  if (rows.length > 0) {
    upsertIndexEntries(rows);
  }

  return rows.length;
}

// ── Main indexing functions ───────────────────────────────────────────────────

/**
 * Full re-index of a repository. Wipes existing entries and rebuilds from scratch.
 * @param {{ userId: string, owner: string, repo: string, repoPath: string }} opts
 * @returns {Promise<{ indexedCount: number, indexedHead: string }>}
 */
export async function indexRepoFull({ userId, owner, repo, repoPath }) {
  const files = await collectMarkdownFiles(repoPath);
  const indexedHead = await getCurrentHead(repoPath);

  let indexedCount = 0;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    indexedCount += await processFilesBatch(batch, userId, owner, repo); // eslint-disable-line no-await-in-loop
  }

  setIndexMeta({ userId, owner, repo, indexedHead, entryCount: indexedCount });

  return { indexedCount, indexedHead };
}

/**
 * Incremental index — diffs from last indexed commit to HEAD, processes only changed files.
 * Falls back to full index if no prior meta is found.
 * @param {{ userId: string, owner: string, repo: string, repoPath: string }} opts
 * @returns {Promise<{ indexedCount: number, indexedHead: string, mode: 'full' | 'incremental' }>}
 */
export async function indexRepoIncremental({ userId, owner, repo, repoPath }) {
  const currentHead = await getCurrentHead(repoPath);
  const priorMeta = getIndexMeta({ userId, owner, repo });

  // No prior index — fall back to full
  if (!priorMeta.indexed || !priorMeta.indexedHead) {
    const result = await indexRepoFull({ userId, owner, repo, repoPath });
    return { ...result, mode: 'full' };
  }

  // Same commit — nothing to do
  if (priorMeta.indexedHead === currentHead) {
    return { indexedCount: 0, indexedHead: currentHead, mode: 'up-to-date' };
  }

  // Incremental: diff changed files
  const changedFiles = await getChangedFiles(repoPath, priorMeta.indexedHead, currentHead);
  const deletedFiles = await getDeletedFiles(repoPath, priorMeta.indexedHead, currentHead);
  const allFiles = await collectMarkdownFiles(repoPath);

  // Filter to only changed/new files
  const changed = allFiles.filter((f) => changedFiles.has(f.relativePath));
  const existingPaths = allFiles.map((f) => f.relativePath);

  let indexedCount = 0;
  for (let i = 0; i < changed.length; i += BATCH_SIZE) {
    const batch = changed.slice(i, i + BATCH_SIZE);
    indexedCount += await processFilesBatch(batch, userId, owner, repo); // eslint-disable-line no-await-in-loop
  }

  // Remove entries for deleted files
  if (deletedFiles.size > 0) {
    deleteStaleIndexEntries({ userId, owner, repo }, existingPaths.filter((p) => !deletedFiles.has(p)));
  }

  const totalMeta = getIndexMeta({ userId, owner, repo });
  setIndexMeta({ userId, owner, repo, indexedHead: currentHead, entryCount: totalMeta.entryCount + indexedCount });

  return { indexedCount, indexedHead: currentHead, mode: 'incremental' };
}

/**
 * Index or update a single file entry (used after publish).
 */
export async function indexSingleFile({ userId, owner, repo, filePath, repoPath }) {
  const absolutePath = path.join(repoPath, filePath);
  let stat;
  let buffer;
  try {
    stat = await fsPromises.stat(absolutePath);
    buffer = await fsPromises.readFile(absolutePath);
  } catch {
    // File deleted — remove from index
    const { deleteIndexEntry } = await import('./repo-index-store.js');
    deleteIndexEntry({ userId, owner, repo, path: filePath });
    return { status: 'deleted' };
  }

  if (buffer.includes(0)) {
    return { status: 'skipped' };
  }

  const content = buffer.toString('utf8');
  const metadata = buildNoteMetadata(filePath, content, stat);
  const { upsertIndexEntry: upsert } = await import('./repo-index-store.js');
  upsert({ userId, owner, repo, path: filePath, ...metadata });
  return { status: 'indexed' };
}
