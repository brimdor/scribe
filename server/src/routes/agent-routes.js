import fs from 'node:fs';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listRepoNotesForUser,
  listRepoNoteTagsForUser,
  listRepoTreeForUser,
} from '../services/github-repo-files.js';
import { resolveAssignedRepoForUser } from '../services/github-repo-sync.js';

const router = Router();

router.use(requireAuth);

function getAssignment(req) {
  return resolveAssignedRepoForUser({
    userId: req.auth.userId,
    username: req.auth.user.login,
  });
}

function safeRepoStatus(assignment) {
  if (!assignment) {
    return 'not-configured';
  }

  const gitDir = `${assignment.repoPath}/.git`;
  if (!fs.existsSync(assignment.repoPath) || !fs.existsSync(gitDir)) {
    return 'not-configured';
  }

  return 'synced';
}

router.get('/workspace-state', async (req, res) => {
  try {
    const assignment = getAssignment(req);

    if (!assignment) {
      res.status(404).json({ error: 'No repository assigned' });
      return;
    }

    const repoStatus = safeRepoStatus(assignment);

    if (repoStatus === 'not-configured') {
      res.status(200).json({
        noteCount: 0,
        repoStatus: 'not-configured',
        recentActivity: [],
        tagDistribution: {},
        directoryBreakdown: {},
        lastSyncAt: null,
        assignedRepo: `${assignment.owner}/${assignment.repo}`,
      });
      return;
    }

    let noteCount = 0;
    const directoryBreakdown = {};
    try {
      const notesResult = listRepoNotesForUser({
        userId: req.auth.userId,
        username: req.auth.user.login,
        limit: 250,
      });
      noteCount = notesResult.notes.length;

      for (const note of notesResult.notes) {
        const dir = note.path.includes('/') ? note.path.split('/')[0] : '.';
        directoryBreakdown[dir] = (directoryBreakdown[dir] || 0) + 1;
      }
    } catch {
      // Repo may not be synced yet
    }

    const tagDistribution = {};
    try {
      const tagsResult = listRepoNoteTagsForUser({
        userId: req.auth.userId,
        username: req.auth.user.login,
      });

      for (const tagEntry of tagsResult.tags) {
        tagDistribution[tagEntry.tag] = tagEntry.count;
      }
    } catch {
      // Repo may not be synced yet
    }

    const recentActivity = [];
    try {
      const treeResult = listRepoTreeForUser({
        userId: req.auth.userId,
        username: req.auth.user.login,
        limit: 5,
      });

      for (const entry of (treeResult.entries || []).slice(0, 5)) {
        if (entry.type === 'file') {
          recentActivity.push({
            path: entry.path,
            action: 'modified',
            timestamp: entry.modifiedAt || null,
          });
        }
      }
    } catch {
      // Repo may not be synced yet
    }

    res.status(200).json({
      noteCount,
      repoStatus,
      recentActivity,
      tagDistribution,
      directoryBreakdown,
      lastSyncAt: null,
      assignedRepo: `${assignment.owner}/${assignment.repo}`,
    });
  } catch (error) {
    const message = error?.message || 'Unable to retrieve workspace state.';
    const isNotFound = /no repository assignment/i.test(message);
    res.status(isNotFound ? 404 : 500).json({ error: message });
  }
});

export default router;
