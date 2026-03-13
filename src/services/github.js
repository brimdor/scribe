import { apiRequest } from './api';
import { isMarkdownPath, resolveNoteSavePath } from '../utils/note-publish';

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
const REPO_KNOWLEDGE_HINT_PATTERN = /\b(note|notes|tag|tags|markdown|obsidian|wikilink|frontmatter|repo|repository|readme|document|documents|file|files|folder|directory|search|find|summari[sz]e|what\s+are|list|show|edit|update|create|write|rename|retitle|move|relocate|delete|remove|archive|publish|sync|commit|push)\b/i;
const TAG_HINT_PATTERN = /\btag|tags|tagging\b/i;
const NOTE_HINT_PATTERN = /\b(note|notes|markdown|obsidian|frontmatter|wikilink|journal|project|daily note|meeting note)\b/i;
const NOTE_MANAGEMENT_HINT_PATTERN = /\b(rename|retitle|move|relocate|delete|remove|archive|organize|publish|sync|commit|push)\b/i;
const NOTE_DIRECTORY_ALIASES = {
  Notes: ['Inbox'],
  Research: ['Resources'],
  Meetings: ['Inbox'],
};

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

async function resolvePublishPath({ owner, repo, filePath }) {
  const normalizedPath = String(filePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedPath) {
    return normalizedPath;
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  if (segments.length < 2) {
    return normalizedPath;
  }

  const [topLevelDir, ...rest] = segments;
  const aliasDirs = NOTE_DIRECTORY_ALIASES[topLevelDir] || [];
  if (!aliasDirs.length) {
    return normalizedPath;
  }

  try {
    const tree = await listLocalRepoTree({ owner, repo, limit: 200 });
    const availableDirs = new Set((tree?.entries || [])
      .filter((entry) => entry.type === 'dir')
      .map((entry) => entry.name));

    if (availableDirs.has(topLevelDir)) {
      return normalizedPath;
    }

    const replacementDir = aliasDirs.find((candidate) => availableDirs.has(candidate));
    if (!replacementDir) {
      return normalizedPath;
    }

    return [replacementDir, ...rest].join('/');
  } catch {
    return normalizedPath;
  }
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

export async function publishRepoChanges({ owner, repo, filePaths = [], commitMessage = '', reason = 'manual-publish' } = {}) {
  if (!Array.isArray(filePaths) || !filePaths.some((value) => String(value || '').trim())) {
    throw new Error('Publish file paths are required.');
  }

  const payload = {
    reason,
    filePaths: filePaths.map((value) => String(value || '').trim()).filter(Boolean),
  };

  if (typeof owner === 'string' && owner.trim()) {
    payload.owner = owner.trim();
  }

  if (typeof repo === 'string' && repo.trim()) {
    payload.repo = repo.trim();
  }

  if (typeof commitMessage === 'string' && commitMessage.trim()) {
    payload.commitMessage = commitMessage.trim();
  }

  const response = await apiRequest('/api/github/publish', {
    method: 'POST',
    body: payload,
  });

  return response.publish;
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

export async function writeLocalRepoFile({ owner, repo, filePath, content, createDirectories = true } = {}) {
  const payload = {
    path: String(filePath || '').trim(),
    content,
    createDirectories: createDirectories !== false,
  };

  if (typeof owner === 'string' && owner.trim()) {
    payload.owner = owner.trim();
  }

  if (typeof repo === 'string' && repo.trim()) {
    payload.repo = repo.trim();
  }

  const response = await apiRequest('/api/github/repo/file', {
    method: 'PUT',
    body: payload,
  });

  return response.file;
}

export async function moveLocalRepoFile({ owner, repo, fromPath, toPath, createDirectories = true } = {}) {
  const payload = {
    fromPath: String(fromPath || '').trim(),
    toPath: String(toPath || '').trim(),
    createDirectories: createDirectories !== false,
  };

  if (typeof owner === 'string' && owner.trim()) {
    payload.owner = owner.trim();
  }

  if (typeof repo === 'string' && repo.trim()) {
    payload.repo = repo.trim();
  }

  const response = await apiRequest('/api/github/repo/file', {
    method: 'PATCH',
    body: payload,
  });

  return response.file;
}

export async function deleteLocalRepoFile({ owner, repo, filePath } = {}) {
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
  const response = await apiRequest(buildPathWithQuery('/api/github/repo/file', params), {
    method: 'DELETE',
  });

  return response.file;
}

export async function searchLocalRepoFiles({ owner, repo, query, dir = '', limit = 20 } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  params.set('q', String(query || '').trim());

  if (typeof dir === 'string' && dir.trim()) {
    params.set('dir', dir.trim());
  }

  params.set('limit', String(limit));
  const response = await apiRequest(buildPathWithQuery('/api/github/repo/search', params));
  return response.search;
}

export async function getLocalGitStatus({ owner, repo } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  const response = await apiRequest(buildPathWithQuery('/api/github/repo/git/status', params));
  return response.status;
}

export async function getLocalGitDiff({ owner, repo, filePath = '' } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  if (typeof filePath === 'string' && filePath.trim()) {
    params.set('path', filePath.trim());
  }

  const response = await apiRequest(buildPathWithQuery('/api/github/repo/git/diff', params));
  return response.diff;
}

export async function getLocalGitLog({ owner, repo, limit = 10 } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  params.set('limit', String(limit));
  const response = await apiRequest(buildPathWithQuery('/api/github/repo/git/log', params));
  return response.log;
}

export async function listRepoIssues({ owner, repo } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  const response = await apiRequest(buildPathWithQuery('/api/github/issues', params));
  return response.issues;
}

export async function listRepoPullRequests({ owner, repo } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  const response = await apiRequest(buildPathWithQuery('/api/github/pulls', params));
  return response.pulls;
}

export async function listLocalRepoNoteTags({ owner, repo } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  const response = await apiRequest(buildPathWithQuery('/api/github/repo/note-tags', params));
  return response.noteTags;
}

export async function listLocalRepoNotes({ owner, repo, dir = '', limit = 20 } = {}) {
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
  const response = await apiRequest(buildPathWithQuery('/api/github/repo/notes', params));
  return response.notes;
}

export async function findLocalRepoNotesByTag({ owner, repo, tag, limit = 20 } = {}) {
  const params = new URLSearchParams();

  if (typeof owner === 'string' && owner.trim()) {
    params.set('owner', owner.trim());
  }

  if (typeof repo === 'string' && repo.trim()) {
    params.set('repo', repo.trim());
  }

  params.set('tag', String(tag || '').trim());
  params.set('limit', String(limit));
  const response = await apiRequest(buildPathWithQuery('/api/github/repo/notes/by-tag', params));
  return response.notes;
}

export async function readLocalRepoNoteFrontmatter({ owner, repo, filePath } = {}) {
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
  const response = await apiRequest(buildPathWithQuery('/api/github/repo/note/frontmatter', params));
  return response.note;
}

export async function saveNoteToRepoAndPublish({ owner, repo, filePath, content, commitMessage = '', createDirectories = true } = {}) {
  const normalizedContent = String(content || '');
  const preferredPath = String(filePath || '').trim();
  if (!normalizedContent.trim()) {
    throw new Error('Markdown note content is required.');
  }

  if (preferredPath && !isMarkdownPath(preferredPath)) {
    throw new Error('Notes can only be saved as markdown files.');
  }

  const canonicalPath = resolveNoteSavePath(normalizedContent, preferredPath);
  const resolvedPath = await resolvePublishPath({ owner, repo, filePath: canonicalPath });
  const written = await writeLocalRepoFile({
    owner,
    repo,
    filePath: resolvedPath,
    content: normalizedContent,
    createDirectories,
  });

  const publish = await publishRepoChanges({
    owner,
    repo,
    filePaths: [written.path],
    commitMessage,
    reason: 'save-note-and-publish',
  });

  return {
    file: written,
    publish,
  };
}

export async function moveNoteInRepoAndPublish({ owner, repo, fromPath, toPath, commitMessage = '', createDirectories = true } = {}) {
  const sourcePath = String(fromPath || '').trim();
  if (!sourcePath) {
    throw new Error('Source note path is required.');
  }

  if (!isMarkdownPath(sourcePath)) {
    throw new Error('Notes can only be moved as markdown files.');
  }

  const sourceNote = await readLocalRepoFile({ owner, repo, filePath: sourcePath });
  const preferredPath = String(toPath || '').trim() || sourcePath;
  const canonicalPath = resolveNoteSavePath(sourceNote.content, preferredPath);
  const resolvedPath = await resolvePublishPath({ owner, repo, filePath: canonicalPath });
  const moved = await moveLocalRepoFile({
    owner,
    repo,
    fromPath: sourcePath,
    toPath: resolvedPath,
    createDirectories,
  });

  const publish = await publishRepoChanges({
    owner,
    repo,
    filePaths: [sourcePath, moved.path],
    commitMessage,
    reason: 'move-note-and-publish',
  });

  return {
    file: moved,
    publish,
  };
}

export async function deleteNoteFromRepoAndPublish({ owner, repo, filePath, commitMessage = '' } = {}) {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) {
    throw new Error('Note path is required.');
  }

  if (!isMarkdownPath(normalizedPath)) {
    throw new Error('Notes can only be deleted as markdown files.');
  }

  const deleted = await deleteLocalRepoFile({ owner, repo, filePath: normalizedPath });
  const publish = await publishRepoChanges({
    owner,
    repo,
    filePaths: [deleted.path],
    commitMessage,
    reason: 'delete-note-and-publish',
  });

  return {
    file: deleted,
    publish,
  };
}

export function shouldUseRepoKnowledgeBase(prompt = '') {
  const normalized = String(prompt || '').trim();
  if (!normalized) {
    return false;
  }

  return shouldRunRepoSyncTool(normalized)
    || (NOTE_MANAGEMENT_HINT_PATTERN.test(normalized) && NOTE_HINT_PATTERN.test(normalized))
    || REPO_KNOWLEDGE_HINT_PATTERN.test(normalized)
    || extractPromptFilePaths(normalized).length > 0;
}

export function shouldRequireToolUsage(prompt = '') {
  const normalized = String(prompt || '').trim();
  if (!normalized) {
    return false;
  }

  return shouldUseRepoKnowledgeBase(normalized) || /\b(edit|update|rewrite|create|write|modify|save|sync|publish|commit|push|rename|retitle|move|relocate|delete|remove|archive)\b/i.test(normalized);
}

function extractPromptTags(prompt = '') {
  const matches = new Set();
  const normalized = String(prompt || '');
  const hashtagPattern = /#([A-Za-z][A-Za-z0-9/_-]*)\b/g;
  let match = hashtagPattern.exec(normalized);
  while (match) {
    matches.add(match[1].toLowerCase());
    match = hashtagPattern.exec(normalized);
  }

  const phrasePatterns = [
    /\btag(?:ged)?\s+([A-Za-z][A-Za-z0-9/_-]*)\b/gi,
    /\bnotes?\s+(?:with|using)\s+tag\s+([A-Za-z][A-Za-z0-9/_-]*)\b/gi,
  ];

  phrasePatterns.forEach((pattern) => {
    let phraseMatch = pattern.exec(normalized);
    while (phraseMatch) {
      matches.add(phraseMatch[1].toLowerCase());
      phraseMatch = pattern.exec(normalized);
    }
  });

  return Array.from(matches).slice(0, 3);
}

function extractPromptSearchQueries(prompt = '') {
  const normalized = String(prompt || '').trim();
  if (!normalized) {
    return [];
  }

  const queries = [];
  if (TAG_HINT_PATTERN.test(normalized)) {
    queries.push('tags');
  }

  if (/\b(readme|setup|install|getting started)\b/i.test(normalized)) {
    queries.push('readme');
  }

  if (/\b(note|notes|markdown|obsidian)\b/i.test(normalized)) {
    queries.push('title');
  }

  const tagMatches = extractPromptTags(normalized);
  tagMatches.forEach((tag) => queries.push(tag));

  return Array.from(new Set(queries)).slice(0, 2);
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
  if (!shouldUseRepoKnowledgeBase(prompt)) {
    return null;
  }

  const sync = shouldRunRepoSyncTool(prompt)
    ? await runRepoSyncToolForPrompt(prompt, { reason })
    : null;
  let tree = null;
  let noteTags = null;
  let notes = null;
  const taggedNotes = [];
  const searches = [];

  try {
    tree = await listLocalRepoTree();
  } catch {
    tree = null;
  }

  if (TAG_HINT_PATTERN.test(prompt)) {
    try {
      noteTags = await listLocalRepoNoteTags();
    } catch {
      noteTags = null;
    }
  }

  if (NOTE_HINT_PATTERN.test(prompt)) {
    try {
      notes = await listLocalRepoNotes({ limit: 12 });
    } catch {
      notes = null;
    }
  }

  for (const tag of extractPromptTags(prompt)) {
    try {
      const tagged = await findLocalRepoNotesByTag({ tag, limit: 8 });
      taggedNotes.push(tagged);
    } catch {
      // Ignore tag lookup failures.
    }
  }

  for (const query of extractPromptSearchQueries(prompt)) {
    try {
      const search = await searchLocalRepoFiles({ query, limit: 5 });
      searches.push(search);
    } catch {
      // Ignore search failures and continue building best-effort repo context.
    }
  }

  const requestedFiles = extractPromptFilePaths(prompt);
  for (const search of searches) {
    for (const result of search?.results || []) {
      if (requestedFiles.length >= MAX_CONTEXT_FILES) {
        break;
      }

      if (!requestedFiles.includes(result.path)) {
        requestedFiles.push(result.path);
      }
    }
  }

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

  if (noteTags?.tags?.length) {
    sections.push(`Repository note tags:\n${noteTags.tags.slice(0, 20).map((entry) => `- ${entry.tag} (${entry.count})`).join('\n')}`);
  }

  if (notes?.notes?.length) {
    sections.push(`Repository notes:\n${notes.notes.slice(0, 12).map((note) => `- ${note.path} - ${note.title}${note.tags?.length ? ` [${note.tags.join(', ')}]` : ''}`).join('\n')}`);
  }

  if (taggedNotes.length) {
    sections.push(`Notes matching requested tags:\n${taggedNotes.flatMap((entry) => (entry?.notes || []).map((note) => `- ${entry.tag}: ${note.path} - ${note.title}`)).slice(0, 12).join('\n')}`);
  }

  if (searches.length) {
    sections.push(`Repository search results:\n${searches.flatMap((search) => (search?.results || []).map((result) => `- ${result.path}:${result.line} - ${result.preview}`)).slice(0, 12).join('\n')}`);
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
    noteTags,
    notes,
    taggedNotes,
    searches,
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
