import { Octokit } from '@octokit/rest';

export class AuthError extends Error {
  constructor(message, { status = 400, code = 'AUTH_ERROR' } = {}) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

function parseScopes(headers) {
  const raw = headers?.['x-oauth-scopes'];
  if (!raw || typeof raw !== 'string') {
    return [];
  }

  return raw
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export async function validateGitHubToken(username, token) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedToken = String(token || '').trim();

  if (!normalizedUsername || !normalizedToken) {
    throw new AuthError('Username and token are required.', { status: 400, code: 'MISSING_CREDENTIALS' });
  }

  const octokit = new Octokit({ auth: normalizedToken });

  let response;
  try {
    response = await octokit.request('GET /user');
  } catch {
    throw new AuthError('Invalid GitHub credentials. Please check your username and token.', {
      status: 401,
      code: 'INVALID_GITHUB_CREDENTIALS',
    });
  }

  const login = response.data?.login;
  if (!login || login.toLowerCase() !== normalizedUsername) {
    throw new AuthError('Token does not match the provided username.', {
      status: 401,
      code: 'USERNAME_MISMATCH',
    });
  }

  const scopes = parseScopes(response.headers);
  const hasRepoScope = scopes.includes('repo');
  if (!hasRepoScope) {
    throw new AuthError('This Personal Access Token requires read/write repo capability (repo scope).', {
      status: 403,
      code: 'REPO_SCOPE_REQUIRED',
    });
  }

  return {
    login: response.data.login,
    name: response.data.name || response.data.login,
    avatarUrl: response.data.avatar_url || '',
    token: normalizedToken,
  };
}

export function createGitHubClient(token) {
  return new Octokit({ auth: token });
}
