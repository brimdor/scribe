import { apiRequest } from './api';

const REPO_FRESHNESS_HINT_PATTERN = /\b(git\s+pull|sync|refresh|latest|up[-\s]?to[-\s]?date|recent|newest)\b/i;
const REPO_CONTEXT_HINT_PATTERN = /\b(repo|repository|branch|commit|file|files|codebase|source|readme|notes|folder|directory|path)\b/i;
const FILE_PATH_TOKEN_PATTERN = /`([^`]+)`|\b([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.[A-Za-z0-9._-]+)\b/g;
const TEXT_FILE_EXTENSIONS = new Set([
  'md', 'txt', 'json', 'yaml', 'yml', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'xml', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'sh',
]);
const DEFAULT_TREE_LIMIT = 120;
const DEFAULT_FILE_BYTES = 24 * 1024;
const DEFAULT_FILE_LINES = 180;
const MAX_CONTEXT_FILES = 3;
const MAX_CONTEXT_CHARS = 12_000;

function buildPathWithQuery(basePath, params) {
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function normalizePromptPathToken(value) {
  const normalized = String(value || '').trim().replace(/^['"`]+|['"`]+$/g, '');
  if (!normalized || normalized.includes('..') || normalized.startsWith('/')) {
    return '';
  }

  return normalized.replace(/\\/g, '/');
}

function hasTextFileExtension(value) {
  const token = normalizePromptPathToken(value);
  const extension = token.split('.').pop()?.toLowerCase();
  return !!extension && TEXT_FILE_EXTENSIONS.has(extension);
}

function trimContext(text, maxChars = MAX_CONTEXT_CHARS) {
  if (!text || text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1)}…`;
}

function formatTreeEntries(entries = []) {
  return entries
    .slice(0, 30)
    .map((entry) => `- ${entry.type === 'dir' ? 'dir' : 'file'}: ${entry.path}`)
    .join('\n');
}

function formatFileSnippet(file) {
  return [
    `### ${file.path}`,
    '```text',
    file.content,
    '```',
  ].join('\n');
}

export function initGitHub() {
  return null;
}

export function getOctokit() {
  return null;
}

export async function getUser() {
  const response = await apiRequest('/api/github/user');
  return response.user;
}

export async function listRepos() {
  const user = await getUser();
  return getRepos(user.login);
}

export async function getOrgs() {
  const response = await apiRequest('/api/github/orgs');
  return response.orgs;
}

export async function getRepos(owner) {
  const params = new URLSearchParams({ owner });
  const response = await apiRequest(`/api/github/repos?${params.toString()}`);
  return response.repos;
}

export async function syncAssignedRepo({ owner, repo, reason = 'manual-sync' } = {}) {
  const payload = {
    reason,
  };

  if (typeof owner === 'string' && owner.trim()) {
    payload.owner = owner.trim();
  }

  if (typeof repo === 'string' && repo.trim()) {
    payload.repo = repo.trim();
  }

  const response = await apiRequest('/api/github/sync', {
    method: 'POST',
    body: payload,
  });

  return response.sync;
}

export async function listLocalRepoTree({ owner, repo, dir = '', limit = DEFAULT_TREE_LIMIT } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  if (typeof dir === 'string' && dir.trim()) {
    params.set('dir', dir.trim());
  }

  params.set('limit', String(limit));
  const response = await apiRequest(buildPathWithQuery('/api/github/repo/tree', params));
  return response.tree;
}

export async function readLocalRepoFile({ owner, repo, filePath, maxBytes = DEFAULT_FILE_BYTES, maxLines = DEFAULT_FILE_LINES } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  if (!filePath || !String(filePath).trim()) {
    throw new Error('File path is required.');
  }

  params.set('path', String(filePath).trim());
  params.set('maxBytes', String(maxBytes));
  params.set('maxLines', String(maxLines));

  const response = await apiRequest(buildPathWithQuery('/api/github/repo/file', params));
  return response.file;
}

export function shouldRunRepoSyncTool(prompt = '') {
  const normalized = String(prompt || '').trim();
  if (!normalized) {
    return false;
  }

  if (/\b(sync\s+repo|sync\s+repository|git\s+pull)\b/i.test(normalized)) {
    return true;
  }

  return REPO_FRESHNESS_HINT_PATTERN.test(normalized) && REPO_CONTEXT_HINT_PATTERN.test(normalized);
}

export function extractPromptFilePaths(prompt = '') {
  const matches = new Set();
  FILE_PATH_TOKEN_PATTERN.lastIndex = 0;
  let match = FILE_PATH_TOKEN_PATTERN.exec(prompt);
  while (match) {
    const candidate = normalizePromptPathToken(match[1] || match[2] || '');
    if (candidate && hasTextFileExtension(candidate)) {
      matches.add(candidate);
    }

    match = FILE_PATH_TOKEN_PATTERN.exec(prompt);
  }

  return Array.from(matches).slice(0, MAX_CONTEXT_FILES);
}

export async function runRepoSyncToolForPrompt(prompt, { reason = 'assistant-tool' } = {}) {
  if (!shouldRunRepoSyncTool(prompt)) {
    return {
      status: 'skipped',
      reason: 'intent-not-matched',
      message: 'Prompt did not require repository freshness sync.',
    };
  }

  try {
    return await syncAssignedRepo({ reason });
  } catch (error) {
    return {
      status: 'skipped',
      reason: 'sync-failed',
      message: error?.message || 'Repository sync tool failed before assistant response.',
    };
  }
}

export function getLatestUserPrompt(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user' && typeof messages[index]?.content === 'string') {
      return messages[index].content;
    }
  }

  return '';
}

export async function buildRepoContextForPrompt(prompt, { reason = 'assistant-tool' } = {}) {
  if (!shouldRunRepoSyncTool(prompt)) {
    return null;
  }

  const sync = await runRepoSyncToolForPrompt(prompt, { reason });
  let tree = null;

  try {
    tree = await listLocalRepoTree();
  } catch {
    tree = null;
  }

  const requestedFiles = extractPromptFilePaths(prompt);
  if (!requestedFiles.length && tree?.entries?.length) {
    const readme = tree.entries.find((entry) => entry.type === 'file' && /^readme\./i.test(entry.name));
    if (readme?.path) {
      requestedFiles.push(readme.path);
    }
  }

  const files = [];
  for (const nextPath of requestedFiles.slice(0, MAX_CONTEXT_FILES)) {
    try {
      const file = await readLocalRepoFile({ filePath: nextPath });
      files.push(file);
    } catch {
      // Ignore unreadable paths and continue with remaining candidates.
    }
  }

  const sections = [];
  if (sync) {
    sections.push(`Repository sync result: ${sync.status}${sync.message ? ` - ${sync.message}` : ''}`);
  }

  if (tree?.entries?.length) {
    sections.push(`Repository entries under ${tree.dir || '/'}:\n${formatTreeEntries(tree.entries)}`);
  }

  if (files.length) {
    sections.push(`Repository file excerpts:\n${files.map(formatFileSnippet).join('\n\n')}`);
  }

  if (!sections.length) {
    return null;
  }

  return {
    sync,
    tree,
    files,
    contextText: trimContext(sections.join('\n\n')),
  };
}

export async function createRepo() {
  throw new Error('Repository mutation endpoints are not implemented in this version.');
}

export async function getContents() {
  throw new Error('GitHub content endpoints are not implemented in this version.');
}

export async function getFileContent() {
  throw new Error('GitHub file endpoints are not implemented in this version.');
}

export async function saveFile() {
  throw new Error('GitHub file endpoints are not implemented in this version.');
}

export async function deleteFile() {
  throw new Error('GitHub file endpoints are not implemented in this version.');
}

export async function getTree() {
  throw new Error('GitHub tree endpoints are not implemented in this version.');
}
