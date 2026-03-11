import { extractTitle, getDateString, parseFrontmatter, titleToFilename } from './markdown';

const ACTION_START = '[SCRIBE_ACTION]';
const ACTION_END = '[/SCRIBE_ACTION]';

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
  const title = extractTitle(normalized).trim();
  const date = String(data.date || '').trim() || getDateString();

  if (String(data.schema || '').trim().toLowerCase() === 'daily-journal') {
    return `${directory}/${date}.md`;
  }

  const filename = titleToFilename(title) || titleToFilename(date) || 'untitled-note';
  return `${directory}/${filename}.md`;
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
  const resolvedPath = String(filePath || '').trim() || inferNotePathFromContent(normalizedContent);
  const title = extractTitle(normalizedContent);
  const resolvedCommitMessage = String(commitMessage || '').trim() || `save note: ${title}`;
  const actionPayload = {
    action: 'save_note_to_repository',
    path: resolvedPath,
    commitMessage: resolvedCommitMessage,
  };

  return [
    ACTION_START,
    JSON.stringify(actionPayload),
    ACTION_END,
    '',
    `Use the \`save_note_to_repository\` tool to save the note below to \`${resolvedPath}\` in the selected repository and publish it to \`origin/main\`.`,
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
      commitMessage: String(action.commitMessage || '').trim(),
      content: markdownMatch[1],
    };
  } catch {
    return null;
  }
}
