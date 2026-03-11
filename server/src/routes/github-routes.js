import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { appendEventLog } from '../services/event-log.js';
import { createGitHubClient } from '../services/github-auth.js';
import {
  findRepoNotesByTagForUser,
  getRepoGitDiffForUser,
  getRepoGitLogForUser,
  getRepoGitStatusForUser,
  listRepoNotesForUser,
  listRepoTreeForUser,
  listRepoNoteTagsForUser,
  readRepoNoteFrontmatterForUser,
  readRepoFileForUser,
  searchRepoFilesForUser,
  writeRepoFileForUser,
} from '../services/github-repo-files.js';
import { publishRepoChangesForUser, resolveAssignedRepoForUser, syncAssignedRepoForUser } from '../services/github-repo-sync.js';
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

router.post('/publish', async (req, res) => {
  try {
    appendEventLog({
      source: 'server',
      userId: req.auth.userId,
      user: req.auth.user?.login || '',
      category: 'publish',
      event: 'publish_requested',
      details: {
        owner: req.body?.owner || '',
        repo: req.body?.repo || '',
        filePaths: Array.isArray(req.body?.filePaths) ? req.body.filePaths : [],
        reason: String(req.body?.reason || '').trim() || 'manual-publish',
      },
    });

    const publish = await publishRepoChangesForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.body?.owner,
      repo: req.body?.repo,
      filePaths: req.body?.filePaths,
      commitMessage: req.body?.commitMessage,
      reason: String(req.body?.reason || '').trim() || 'manual-publish',
    });

    appendEventLog({
      source: 'server',
      userId: req.auth.userId,
      user: req.auth.user?.login || '',
      category: 'publish',
      event: 'publish_completed',
      details: publish,
    });

    res.status(200).json({ publish });
  } catch (error) {
    const message = error?.message || 'Unable to publish repository changes.';
    appendEventLog({
      source: 'server',
      userId: req.auth.userId,
      user: req.auth.user?.login || '',
      category: 'publish',
      event: 'publish_failed',
      details: {
        error: message,
        owner: req.body?.owner || '',
        repo: req.body?.repo || '',
        filePaths: Array.isArray(req.body?.filePaths) ? req.body.filePaths : [],
      },
    });
    const isBadRequest = /required|unsupported characters|outside the configured sync root|main branch/i.test(message);
    const isNotFound = /not available/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
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

router.put('/repo/file', async (req, res) => {
  try {
    const file = writeRepoFileForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.body?.owner,
      repo: req.body?.repo,
      filePath: req.body?.path,
      content: req.body?.content,
      createDirectories: req.body?.createDirectories,
    });

    res.status(200).json({ file });
  } catch (error) {
    const message = error?.message || 'Unable to write repository file.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment|binary file|parent directory/i.test(message);
    const isNotFound = /does not exist|not available|not a folder|not a regular file|checkout is invalid/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/search', async (req, res) => {
  try {
    const search = searchRepoFilesForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      query: req.query.q,
      dir: req.query.dir,
      limit: req.query.limit,
    });

    res.status(200).json({ search });
  } catch (error) {
    const message = error?.message || 'Unable to search repository.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment/i.test(message);
    const isNotFound = /does not exist|not available|not a folder|checkout is invalid/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/note-tags', async (req, res) => {
  try {
    const noteTags = listRepoNoteTagsForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
    });

    res.status(200).json({ noteTags });
  } catch (error) {
    const message = error?.message || 'Unable to inspect repository note tags.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment/i.test(message);
    const isNotFound = /does not exist|not available|checkout is invalid/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/notes', async (req, res) => {
  try {
    const notes = listRepoNotesForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      dir: req.query.dir,
      limit: req.query.limit,
    });

    res.status(200).json({ notes });
  } catch (error) {
    const message = error?.message || 'Unable to list repository notes.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment/i.test(message);
    const isNotFound = /does not exist|not available|checkout is invalid|not a folder/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/note/frontmatter', async (req, res) => {
  try {
    const note = readRepoNoteFrontmatterForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      filePath: req.query.path,
    });

    res.status(200).json({ note });
  } catch (error) {
    const message = error?.message || 'Unable to read note frontmatter.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment|markdown files/i.test(message);
    const isNotFound = /does not exist|not available|checkout is invalid|not a regular file/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/notes/by-tag', async (req, res) => {
  try {
    const notes = findRepoNotesByTagForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      tag: req.query.tag,
      limit: req.query.limit,
    });

    res.status(200).json({ notes });
  } catch (error) {
    const message = error?.message || 'Unable to find notes by tag.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment|tag is required/i.test(message);
    const isNotFound = /does not exist|not available|checkout is invalid|not a folder/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/git/status', async (req, res) => {
  try {
    const status = await getRepoGitStatusForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
    });

    res.status(200).json({ status });
  } catch (error) {
    const message = error?.message || 'Unable to inspect repository status.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment/i.test(message);
    const isNotFound = /does not exist|not available|checkout is invalid/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/git/diff', async (req, res) => {
  try {
    const diff = await getRepoGitDiffForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      filePath: req.query.path,
    });

    res.status(200).json({ diff });
  } catch (error) {
    const message = error?.message || 'Unable to inspect repository diff.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment/i.test(message);
    const isNotFound = /does not exist|not available|checkout is invalid/i.test(message);
    res.status(isBadRequest ? 400 : isNotFound ? 404 : 500).json({ error: message });
  }
});

router.get('/repo/git/log', async (req, res) => {
  try {
    const log = await getRepoGitLogForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      limit: req.query.limit,
    });

    res.status(200).json({ log });
  } catch (error) {
    const message = error?.message || 'Unable to inspect repository history.';
    const isBadRequest = /required|invalid path segment|resolves outside|no repository assignment/i.test(message);
    const isNotFound = /does not exist|not available|checkout is invalid/i.test(message);
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

    res.status(200).json({
      owner: assignment.owner,
      repo: assignment.repo,
      issues,
    });
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

    res.status(200).json({
      owner: assignment.owner,
      repo: assignment.repo,
      pulls,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load GitHub pull requests.' });
  }
});

export default router;
