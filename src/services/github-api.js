import { apiRequest } from './api';
import { buildPathWithQuery } from './github-shared';

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
