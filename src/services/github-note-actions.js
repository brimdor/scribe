import { isMarkdownPath, resolveNoteSavePath } from '../utils/note-publish';
import { NOTE_DIRECTORY_ALIASES } from './github-shared';
import {
  deleteLocalRepoFile,
  listLocalRepoTree,
  moveLocalRepoFile,
  publishRepoChanges,
  readLocalRepoFile,
  writeLocalRepoFile,
} from './github-local-repo';

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
