import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createGitHubClient } from '../services/github-auth.js';
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
