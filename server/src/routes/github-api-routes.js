import { Router } from 'express';
import { getAssignedRepoForRequest, getClientForRequest } from './github-route-helpers.js';

const router = Router();

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

router.get('/issues', async (req, res) => {
  try {
    const octokit = getClientForRequest(req);
    const assignment = getAssignedRepoForRequest(req);
    const { data } = await octokit.rest.issues.listForRepo({
      owner: assignment.owner,
      repo: assignment.repo,
      state: 'open',
      per_page: 20,
    });

    const issues = data
      .filter((item) => !item.pull_request)
      .map((item) => ({
        number: item.number,
        title: item.title,
        state: item.state,
        url: item.html_url,
        author: item.user?.login || '',
        labels: (item.labels || []).map((label) => (typeof label === 'string' ? label : label?.name || '')).filter(Boolean),
        updatedAt: item.updated_at || '',
      }));

    res.status(200).json({ owner: assignment.owner, repo: assignment.repo, issues });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load GitHub issues.' });
  }
});

router.get('/pulls', async (req, res) => {
  try {
    const octokit = getClientForRequest(req);
    const assignment = getAssignedRepoForRequest(req);
    const { data } = await octokit.rest.pulls.list({
      owner: assignment.owner,
      repo: assignment.repo,
      state: 'open',
      per_page: 20,
    });

    const pulls = data.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.html_url,
      author: item.user?.login || '',
      head: item.head?.ref || '',
      base: item.base?.ref || '',
      updatedAt: item.updated_at || '',
    }));

    res.status(200).json({ owner: assignment.owner, repo: assignment.repo, pulls });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load GitHub pull requests.' });
  }
});

export default router;
