import { extractTitle, getDateString, parseFrontmatter, titleToFilename } from './markdown';

const ACTION_START = '[SCRIBE_ACTION]';
const ACTION_END = '[/SCRIBE_ACTION]';

function normalizeRepoPath(value) {
  const normalized = String(value || '').trim().replace(/^['"`]+|['"`]+$/g, '');
  if (!normalized || normalized.includes('..') || normalized.startsWith('/')) {
    return '';
  }

  return normalized.replace(/\\/g, '/').replace(/^\/+/, '');
}

function getCanonicalNoteFilename(content) {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return 'untitled-note.md';
  }

  const { data } = parseFrontmatter(normalized);
  const date = String(data.date || '').trim() || getDateString();
  if (String(data.schema || '').trim().toLowerCase() === 'daily-journal') {
    return `${date}.md`;
  }

  const title = extractTitle(normalized).trim();
  const filename = titleToFilename(title) || titleToFilename(date) || 'untitled-note';
  return `${filename}.md`;
}

function choosePreferredDirectory(preferredPath, fallbackDirectory) {
  const normalizedPreferredPath = normalizeRepoPath(preferredPath);
  if (!normalizedPreferredPath) {
    return fallbackDirectory;
  }

  const segments = normalizedPreferredPath.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return fallbackDirectory;
  }

  return segments.slice(0, -1).join('/');
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function chooseNoteDirectory(frontmatter) {
  const schema = String(frontmatter.schema || '').trim().toLowerCase();
  const tags = normalizeArray(frontmatter.tags).map((tag) => tag.toLowerCase().replace(/^#/, ''));

  if (schema === 'daily-journal') return 'Journal';
  if (schema === 'meeting-notes') return 'Meetings';
  if (schema === 'project-plan') return 'Projects';
  if (schema === 'research') return 'Research';
  if (tags.includes('project')) return 'Projects';
  if (tags.includes('meeting')) return 'Meetings';
  if (tags.includes('journal') || tags.includes('daily')) return 'Journal';
  if (tags.includes('research')) return 'Research';
  return 'Notes';
}

export function inferNotePathFromContent(content) {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return 'Notes/untitled-note.md';
  }

  const { data } = parseFrontmatter(normalized);
  const directory = chooseNoteDirectory(data);
  return `${directory}/${getCanonicalNoteFilename(normalized)}`;
}

export function resolveNoteSavePath(content, preferredPath = '') {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return normalizeRepoPath(preferredPath) || 'Notes/untitled-note.md';
  }

  const inferredPath = inferNotePathFromContent(normalized);
  const inferredSegments = inferredPath.split('/').filter(Boolean);
  const fallbackDirectory = inferredSegments.length > 1 ? inferredSegments.slice(0, -1).join('/') : 'Notes';
  const preferredDirectory = choosePreferredDirectory(preferredPath, fallbackDirectory);

  return `${preferredDirectory}/${getCanonicalNoteFilename(normalized)}`;
}

export function isMarkdownPath(value) {
  return /\.md$/i.test(normalizeRepoPath(value));
}

export function isLikelySavableNote(content) {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return false;
  }

  if (/^---\n[\s\S]*\n---\n?/m.test(normalized)) {
    return true;
  }

  return /^#\s+.+$/m.test(normalized) && normalized.length > 40;
}

export function buildSaveNotePrompt(noteContent, { filePath = '', commitMessage = '' } = {}) {
  const normalizedContent = String(noteContent || '').trim();
  const resolvedPathHint = resolveNoteSavePath(normalizedContent, filePath);
  const title = extractTitle(normalizedContent);
  const resolvedCommitMessage = String(commitMessage || '').trim() || `save note: ${title}`;
  const actionPayload = {
    action: 'save_note_to_repository',
    pathHint: resolvedPathHint,
    commitMessage: resolvedCommitMessage,
  };

  return [
    ACTION_START,
    JSON.stringify(actionPayload),
    ACTION_END,
    '',
    'Choose the best repository-relative markdown path for the note below, then use the `save_note_to_repository` tool to save it and publish it to `origin/main`.',
    'Use the selected repository\'s actual folder structure, note organization, tags, and schema cues to decide where the note belongs.',
    'Save markdown notes only, and keep the filename aligned to the note title using lowercase kebab-case unless the note schema requires a date-based filename.',
    `Suggested path hint: \`${resolvedPathHint}\`. Prefer a better repo location when one exists, but keep the final file as markdown.`,
    'In Scribe, syncing current notes means: save the markdown file, create a git commit, and push that commit to the remote repository.',
    'Do not rewrite, summarize, or improve the note before saving it.',
    `Use this commit message: \`${resolvedCommitMessage}\`.`,
    'If the tool fails, explain the failure and do not claim the note was saved, committed, synced, or published.',
    '',
    '```markdown',
    normalizedContent,
    '```',
  ].join('\n');
}

export function parseSaveNotePromptAction(prompt = '') {
  const normalized = String(prompt || '');
  const actionMatch = normalized.match(/\[SCRIBE_ACTION\]\n([\s\S]*?)\n\[\/SCRIBE_ACTION\]/);
  const markdownMatch = normalized.match(/```markdown\n([\s\S]*?)\n```/);

  if (!actionMatch?.[1] || !markdownMatch?.[1]) {
    return null;
  }

  try {
    const action = JSON.parse(actionMatch[1]);
    if (action?.action !== 'save_note_to_repository') {
      return null;
    }

    return {
      path: String(action.path || '').trim(),
      pathHint: String(action.pathHint || '').trim(),
      commitMessage: String(action.commitMessage || '').trim(),
      content: markdownMatch[1],
    };
  } catch {
    return null;
  }
}
