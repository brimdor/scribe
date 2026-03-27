import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getIndexMeta,
  listIndexNotes,
  listIndexTags,
  searchIndex,
} from '../services/repo-index-store.js';
import { indexRepoFull } from '../services/repo-index-service.js';
import { sendError } from './github-route-helpers.js';
import { resolveAssignedRepoForUser } from '../services/github-repo-sync.js';

const router = Router();
router.use(requireAuth);

function getRepoTarget(req) {
  return resolveAssignedRepoForUser({
    userId: req.auth.userId,
    username: req.auth.user.login,
    owner: req.query.owner || undefined,
    repo: req.query.repo || undefined,
  });
}

// GET /api/repo-index/status
router.get('/status', async (req, res) => {
  try {
    const target = getRepoTarget(req);
    const meta = getIndexMeta({
      userId: req.auth.userId,
      owner: target.owner,
      repo: target.repo,
    });
    res.status(200).json(meta);
  } catch (error) {
    sendError(res, error, 'Unable to get index status.');
  }
});

// GET /api/repo-index/notes
router.get('/notes', async (req, res) => {
  try {
    const target = getRepoTarget(req);
    const result = listIndexNotes({
      userId: req.auth.userId,
      owner: target.owner,
      repo: target.repo,
      dir: req.query.dir || '',
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error, 'Unable to list indexed notes.');
  }
});

// GET /api/repo-index/tags
router.get('/tags', async (req, res) => {
  try {
    const target = getRepoTarget(req);
    const result = listIndexTags({
      userId: req.auth.userId,
      owner: target.owner,
      repo: target.repo,
    });
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error, 'Unable to list indexed tags.');
  }
});

// POST /api/repo-index/search
router.post('/search', async (req, res) => {
  try {
    const target = getRepoTarget(req);
    const query = String(req.body?.query || '').trim();
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 100);

    if (!query) {
      return res.status(200).json({ results: [], query: '', total: 0 });
    }

    const results = searchIndex({
      userId: req.auth.userId,
      owner: target.owner,
      repo: target.repo,
      query,
      limit,
    });

    res.status(200).json({
      results,
      query,
      total: results.length,
    });
  } catch (error) {
    sendError(res, error, 'Unable to search index.');
  }
});

// POST /api/repo-index/reindex
router.post('/reindex', async (req, res) => {
  try {
    const target = getRepoTarget(req);

    // Fire and don't await — runs in background
    indexRepoFull({
      userId: req.auth.userId,
      owner: target.owner,
      repo: target.repo,
      repoPath: target.repoPath,
    }).catch((err) => {
      console.error('[repo-index] Background re-index failed:', err);
    });

    res.status(202).json({
      status: 'indexing',
      message: 'Full re-index started.',
    });
  } catch (error) {
    sendError(res, error, 'Unable to start re-index.');
  }
});

export default router;
