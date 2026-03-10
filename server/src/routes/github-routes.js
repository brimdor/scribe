import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createGitHubClient } from '../services/github-auth.js';
import { listRepoTreeForUser, readRepoFileForUser } from '../services/github-repo-files.js';
import { syncAssignedRepoForUser } from '../services/github-repo-sync.js';
import { getTokenForUser } from '../services/user-store.js';

const router = Router();

router.use(requireAuth);

function getClientForRequest(req) {
  const token = getTokenForUser(req.auth.userId);
  if (!token) {
    throw new Error('GitHub token is unavailable for this session. Please sign in again.');
  }

  return createGitHubClient(token);
}

router.post('/sync', async (req, res) => {
  try {
    const sync = await syncAssignedRepoForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.body?.owner,
      repo: req.body?.repo,
      reason: String(req.body?.reason || '').trim() || 'manual-sync',
    });

    res.status(200).json({ sync });
  } catch (error) {
    const message = error?.message || 'Unable to sync repository.';
    const isBadRequest = /required|unsupported characters|outside the configured sync root/i.test(message);
    res.status(isBadRequest ? 400 : 500).json({ error: message });
  }
});

router.get('/repo/tree', async (req, res) => {
  try {
    const tree = listRepoTreeForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      dir: req.query.dir,
      limit: req.query.limit,
    });

    res.status(200).json({ tree });
  } catch (error) {
    const message = error?.message || 'Unable to list repository files.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment/i.test(message);
    const isNotFound = /does not exist|not available|not a folder|not a regular file|checkout is invalid/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/file', async (req, res) => {
  try {
    const file = readRepoFileForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      filePath: req.query.path,
      maxBytes: req.query.maxBytes,
      maxLines: req.query.maxLines,
    });

    res.status(200).json({ file });
  } catch (error) {
    const message = error?.message || 'Unable to read repository file.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment|binary file/i.test(message);
    const isNotFound = /does not exist|not available|not a folder|not a regular file|checkout is invalid/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/user', async (req, res) => {
  try {
    const octokit = getClientForRequest(req);
    const { data } = await octokit.rest.users.getAuthenticated();
    res.status(200).json({
      user: {
        login: data.login,
        name: data.name || data.login,
        avatarUrl: data.avatar_url || '',
      },
    });
  } catch (error) {
    res.status(401).json({ error: error.message || 'Unable to access GitHub user profile.' });
  }
});

router.get('/orgs', async (req, res) => {
  try {
    const octokit = getClientForRequest(req);
    const { data } = await octokit.rest.orgs.listForAuthenticatedUser();
    res.status(200).json({ orgs: data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load organizations.' });
  }
});

router.get('/repos', async (req, res) => {
  const owner = String(req.query.owner || '').trim();
  if (!owner) {
    res.status(400).json({ error: 'owner query parameter is required.' });
    return;
  }

  try {
    const octokit = getClientForRequest(req);
    const userResponse = await octokit.rest.users.getAuthenticated();
    const login = userResponse.data.login;
    const repos = [];
    let page = 1;

    while (true) {
      let response;
      if (owner === login) {
        response = await octokit.rest.repos.listForAuthenticatedUser({
          per_page: 100,
          page,
          sort: 'updated',
          affiliation: 'owner',
        });
      } else {
        try {
          response = await octokit.rest.repos.listForOrg({
            org: owner,
            per_page: 100,
            page,
            sort: 'updated',
            type: 'all',
          });
        } catch (error) {
          if (error.status === 404) {
            response = await octokit.rest.repos.listForUser({
              username: owner,
              per_page: 100,
              page,
              sort: 'updated',
            });
          } else {
            throw error;
          }
        }
      }

      repos.push(...response.data);
      if (response.data.length < 100) {
        break;
      }
      page += 1;
    }

    res.status(200).json({ repos });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load repositories.' });
  }
});

export default router;
