import { Octokit } from '@octokit/rest';

let octokit = null;

export function initGitHub(token) {
  octokit = new Octokit({ auth: token });
  return octokit;
}

export function getOctokit() {
  return octokit;
}

/**
 * Get the authenticated user's profile
 */
export async function getUser() {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data;
}

/**
 * List user's repositories
 */
export async function listRepos() {
  const repos = [];
  let page = 1;
  while (true) {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      page,
      sort: 'updated',
      affiliation: 'owner',
    });
    repos.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return repos;
}

/**
 * Create a new repository
 */
export async function createRepo(name, description = 'My Scribe notes vault', isPrivate = true) {
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name,
    description,
    private: isPrivate,
    auto_init: true,
  });
  return data;
}

/**
 * Get repository contents (file tree)
 */
export async function getContents(owner, repo, path = '') {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/**
 * Get file contents
 */
export async function getFileContent(owner, repo, path) {
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  });
  if (data.type !== 'file') throw new Error('Path is not a file');
  return {
    content: atob(data.content),
    sha: data.sha,
    path: data.path,
    name: data.name,
  };
}

/**
 * Create or update a file in the repository
 */
export async function saveFile(owner, repo, path, content, message, sha = null) {
  const params = {
    owner,
    repo,
    path,
    message,
    content: btoa(unescape(encodeURIComponent(content))),
  };
  if (sha) params.sha = sha;

  const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);
  return data;
}

/**
 * Delete a file from the repository
 */
export async function deleteFile(owner, repo, path, sha, message = 'Delete note') {
  const { data } = await octokit.rest.repos.deleteFile({
    owner,
    repo,
    path,
    message,
    sha,
  });
  return data;
}

/**
 * Get repository tree recursively
 */
export async function getTree(owner, repo) {
  try {
    const { data: ref } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: 'heads/main',
    });
    
    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: ref.object.sha,
      recursive: 'true',
    });
    
    return tree.tree.filter(item => item.path.endsWith('.md'));
  } catch {
    return [];
  }
}
