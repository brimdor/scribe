import { Router } from 'express';
import { getConfig } from '../config/env.js';
import { clearSessionCookie, getSessionIdFromRequest, setSessionCookie } from '../middleware/auth.js';
import { AuthError, validateGitHubToken } from '../services/github-auth.js';
import { syncAssignedRepoForUser } from '../services/github-repo-sync.js';
import { createSession, deleteSession, resolveSession, upsertUserWithToken } from '../services/user-store.js';

const router = Router();

router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const token = String(req.body?.token || '').trim();

  if (!username || !token) {
    res.status(400).json({ error: 'Username and token are required.' });
    return;
  }

  try {
    const githubIdentity = await validateGitHubToken(username, token);
    const persisted = upsertUserWithToken(githubIdentity);
    const { sessionTtlMs } = getConfig();
    const session = createSession(persisted.id, sessionTtlMs);
    let loginSync = null;
    let loginSyncError = '';

    setSessionCookie(req, res, session.id, sessionTtlMs);

    try {
      loginSync = await syncAssignedRepoForUser({
        userId: persisted.id,
        username: persisted.user.login,
        reason: 'login',
      });
    } catch (syncError) {
      loginSyncError = syncError?.message || 'Repository sync failed during login.';
    }

    res.status(200).json({
      user: persisted.user,
      tokenUpdated: persisted.tokenUpdated,
      sync: loginSync,
      syncError: loginSyncError,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code,
      });
      return;
    }

    res.status(500).json({ error: 'Unable to authenticate at this time.' });
  }
});

router.get('/session', (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    res.status(401).json({ error: 'No active session.' });
    return;
  }

  const session = resolveSession(sessionId);
  if (!session) {
    res.status(401).json({ error: 'Session is invalid or expired.' });
    return;
  }

  res.status(200).json({ user: session.user });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.status(204).end();
});

router.post('/logout-all', (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) {
    deleteSession(sessionId);
  }
  clearSessionCookie(req, res);
  res.status(204).end();
});

export default router;
