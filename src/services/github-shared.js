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

export {
  DEFAULT_FILE_BYTES,
  DEFAULT_FILE_LINES,
  DEFAULT_TREE_LIMIT,
  FILE_PATH_TOKEN_PATTERN,
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_FILES,
  NOTE_DIRECTORY_ALIASES,
  NOTE_HINT_PATTERN,
  NOTE_MANAGEMENT_HINT_PATTERN,
  REPO_CONTEXT_HINT_PATTERN,
  REPO_FRESHNESS_HINT_PATTERN,
  REPO_KNOWLEDGE_HINT_PATTERN,
  TAG_HINT_PATTERN,
  buildPathWithQuery,
  formatFileSnippet,
  formatTreeEntries,
  hasTextFileExtension,
  normalizePromptPathToken,
  trimContext,
};
