import {
  FILE_PATH_TOKEN_PATTERN,
  MAX_CONTEXT_FILES,
  NOTE_HINT_PATTERN,
  NOTE_MANAGEMENT_HINT_PATTERN,
  REPO_CONTEXT_HINT_PATTERN,
  REPO_FRESHNESS_HINT_PATTERN,
  REPO_KNOWLEDGE_HINT_PATTERN,
  TAG_HINT_PATTERN,
  formatFileSnippet,
  formatTreeEntries,
  hasTextFileExtension,
  normalizePromptPathToken,
  trimContext,
} from './github-shared';
import {
  findLocalRepoNotesByTag,
  getRepoIndexStatus,
  listLocalRepoNoteTags,
  listLocalRepoNotes,
  listLocalRepoTree,
  listRepoIndexNotes,
  listRepoIndexTags,
  readLocalRepoFile,
  searchLocalRepoFiles,
  searchRepoIndex,
  syncAssignedRepo,
} from './github-local-repo';

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

  // Check if the index is available (graceful — if the API call fails, we fall back to filesystem)
  let indexStatus = null;
  try {
    indexStatus = await getRepoIndexStatus();
  } catch {
    // Index API unavailable (tests, no server, or repo not yet synced) — fall back to filesystem
  }

  const useIndex = indexStatus?.indexed === true;

  let tree = null;
  let noteTags = null;
  let notes = null;
  const taggedNotes = [];
  const searches = [];

  if (useIndex) {
    // ── Indexed path: fast FTS queries ──────────────────────────────────────

    if (TAG_HINT_PATTERN.test(prompt)) {
      try {
        const tagResult = await listRepoIndexTags();
        noteTags = { tags: tagResult.tags };
      } catch {
        noteTags = null;
      }
    }

    if (NOTE_HINT_PATTERN.test(prompt)) {
      try {
        const notesResult = await listRepoIndexNotes({ limit: 12 });
        notes = { notes: notesResult.notes };
      } catch {
        notes = null;
      }
    }

    for (const tag of extractPromptTags(prompt)) {
      try {
        const tagged = await searchRepoIndex({ query: `#${tag}`, limit: 8 });
        taggedNotes.push({ tag, notes: tagged.results || [] });
      } catch {
        // Ignore tag lookup failures.
      }
    }

    for (const query of extractPromptSearchQueries(prompt)) {
      try {
        const search = await searchRepoIndex({ query, limit: 5 });
        searches.push(search);
      } catch {
        // Ignore search failures.
      }
    }

    // Read requested files directly from the filesystem (still needed for content)
    const requestedFiles = extractPromptFilePaths(prompt);
    for (const search of searches) {
      for (const result of search?.results || []) {
        if (requestedFiles.length >= MAX_CONTEXT_FILES) break;
        if (!requestedFiles.includes(result.path)) {
          requestedFiles.push(result.path);
        }
      }
    }

    if (!requestedFiles.length && noteTags?.tags?.length === 0) {
      // No explicit files requested and no tags — grab README from index
      const readmeResult = await searchRepoIndex({ query: 'readme', limit: 1 });
      if (readmeResult?.results?.[0]?.path) {
        requestedFiles.push(readmeResult.results[0].path);
      }
    }

    const files = [];
    for (const nextPath of requestedFiles.slice(0, MAX_CONTEXT_FILES)) {
      try {
        const file = await readLocalRepoFile({ filePath: nextPath });
        files.push(file);
      } catch {
        // Ignore unreadable paths.
      }
    }

    const sections = [];
    if (sync) {
      sections.push(`Repository sync result: ${sync.status}${sync.message ? ` - ${sync.message}` : ''}`);
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
      sections.push(`Repository search results:\n${searches.flatMap((s) => (s?.results || []).map((r) => `- ${r.path} - ${r.snippet || r.title}`)).slice(0, 12).join('\n')}`);
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
      indexed: true,
    };
  }

  // ── Fallback: synchronous filesystem scan ─────────────────────────────────

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
    indexed: false,
  };
}
