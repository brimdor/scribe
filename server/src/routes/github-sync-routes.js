import { Router } from 'express';
import { appendEventLog } from '../services/event-log.js';
import { publishRepoChangesForUser, syncAssignedRepoForUser } from '../services/github-repo-sync.js';
import { sendError } from './github-route-helpers.js';

const router = Router();

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
    sendError(res, error, 'Unable to sync repository.', {
      badRequestPattern: /required|unsupported characters|outside the configured sync root/i,
    });
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

    sendError(res, error, 'Unable to publish repository changes.', {
      badRequestPattern: /required|unsupported characters|outside the configured sync root|main branch/i,
      notFoundPattern: /not available/i,
    });
  }
});

export default router;
