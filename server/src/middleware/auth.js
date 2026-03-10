import { deleteSession, resolveSession } from '../services/user-store.js';
import { isLocalhostRequest } from './transport.js';

export const SESSION_COOKIE_NAME = 'scribe_session';

function parseCookies(headerValue = '') {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValueParts] = part.split('=');
    const key = rawKey?.trim();
    if (!key) {
      return acc;
    }

    acc[key] = decodeURIComponent(rawValueParts.join('=').trim());
    return acc;
  }, {});
}

export function getSessionIdFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[SESSION_COOKIE_NAME] || null;
}

export async function requireAuth(req, res, next) {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const session = resolveSession(sessionId);
  if (!session) {
    res.status(401).json({ error: 'Session is invalid or expired.' });
    return;
  }

  req.auth = {
    sessionId: session.id,
    userId: session.userId,
    user: session.user,
  };

  next();
}

export function setSessionCookie(req, res, sessionId, maxAgeMs) {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isLocalhostRequest(req),
    maxAge: maxAgeMs,
    path: '/',
  });
}

export function clearSessionCookie(req, res) {
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) {
    deleteSession(sessionId);
  }

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isLocalhostRequest(req),
    path: '/',
  });
}
