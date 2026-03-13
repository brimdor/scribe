import { apiRequest } from './api';
import {
  DEFAULT_FILE_BYTES,
  DEFAULT_FILE_LINES,
  DEFAULT_TREE_LIMIT,
  buildPathWithQuery,
} from './github-shared';

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
