import { createGitHubClient } from '../services/github-auth.js';
import { resolveAssignedRepoForUser } from '../services/github-repo-sync.js';
import { getTokenForUser } from '../services/user-store.js';

function getClientForRequest(req) {
  const token = getTokenForUser(req.auth.userId);
  if (!token) {
    throw new Error('GitHub token is unavailable for this session. Please sign in again.');
  }

  return createGitHubClient(token);
}

function getAssignedRepoForRequest(req) {
  const assignment = resolveAssignedRepoForUser({
    userId: req.auth.userId,
    username: req.auth.user.login,
    owner: req.query.owner || req.body?.owner,
    repo: req.query.repo || req.body?.repo,
  });

  if (!assignment) {
    throw new Error('No repository assignment configured.');
  }

  return assignment;
}

function sendError(res, error, fallbackMessage, { badRequestPattern, notFoundPattern } = {}) {
  const message = error?.message || fallbackMessage;
  const isBadRequest = badRequestPattern?.test(message);
  const isNotFound = notFoundPattern?.test(message);
  res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
}

export { getAssignedRepoForRequest, getClientForRequest, sendError };
