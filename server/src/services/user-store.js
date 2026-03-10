import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { decryptJson, encryptJson } from '../utils/crypto.js';

function now() {
  return Date.now();
}

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function deserializeUser(row) {
  if (!row) {
    return null;
  }

  let profile = null;
  try {
    profile = decryptJson(row.profile_blob);
  } catch {
    profile = null;
  }

  return {
    id: row.id,
    username: row.username,
    profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getPublicUserByUsername(username) {
  const db = getDatabase();
  const normalizedUsername = normalizeUsername(username);
  const row = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(normalizedUsername);

  return deserializeUser(row);
}

export function upsertUserWithToken({ login, name, avatarUrl, token }) {
  const db = getDatabase();
  const normalizedUsername = normalizeUsername(login);
  const timestamp = now();

  const existing = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(normalizedUsername);

  const profileBlob = encryptJson({
    login,
    name,
    avatarUrl,
  });
  const tokenBlob = encryptJson({ token });

  if (!existing) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO users (id, username, profile_blob, token_blob, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, normalizedUsername, profileBlob, tokenBlob, timestamp, timestamp);

    return {
      id,
      user: {
        login,
        name,
        avatarUrl,
      },
      tokenUpdated: true,
    };
  }

  let existingToken = '';
  try {
    existingToken = decryptJson(existing.token_blob)?.token || '';
  } catch {
    existingToken = '';
  }

  const tokenUpdated = existingToken !== token;
  db.prepare(`
    UPDATE users
    SET profile_blob = ?, token_blob = ?, updated_at = ?
    WHERE id = ?
  `).run(profileBlob, tokenBlob, timestamp, existing.id);

  return {
    id: existing.id,
    user: {
      login,
      name,
      avatarUrl,
    },
    tokenUpdated,
  };
}

export function getTokenForUser(userId) {
  const db = getDatabase();
  const row = db
    .prepare('SELECT token_blob FROM users WHERE id = ?')
    .get(userId);

  if (!row) {
    return null;
  }

  const tokenRecord = decryptJson(row.token_blob);
  return tokenRecord?.token || null;
}

export function createSession(userId, ttlMs) {
  const db = getDatabase();
  const id = randomUUID();
  const timestamp = now();
  const expiresAt = timestamp + ttlMs;

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, expiresAt, timestamp, timestamp);

  return {
    id,
    userId,
    expiresAt,
  };
}

export function resolveSession(sessionId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      sessions.id,
      sessions.user_id,
      sessions.expires_at,
      users.profile_blob
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ?
  `).get(sessionId);

  if (!row) {
    return null;
  }

  if (row.expires_at <= now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), sessionId);

  const profile = decryptJson(row.profile_blob) || {};
  return {
    id: row.id,
    userId: row.user_id,
    user: {
      login: profile.login || '',
      name: profile.name || profile.login || '',
      avatarUrl: profile.avatarUrl || '',
    },
  };
}

export function deleteSession(sessionId) {
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}
