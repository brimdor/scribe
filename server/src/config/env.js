import path from 'node:path';

const DEFAULT_DB_PATH = 'server/data/scribe.db';
const DEFAULT_SESSION_TTL_HOURS = 24;
const DEV_FALLBACK_ENCRYPTION_KEY = 'change-me-local-dev-key';
const DEFAULT_REPO_SYNC_ROOT = 'server/repos';

function resolveEncryptionKey() {
  if (process.env.SCRIBE_DB_ENCRYPTION_KEY) {
    return process.env.SCRIBE_DB_ENCRYPTION_KEY;
  }

  if (process.env.NODE_ENV === 'test') {
    return DEV_FALLBACK_ENCRYPTION_KEY;
  }

  throw new Error(
    'SCRIBE_DB_ENCRYPTION_KEY must be set unless NODE_ENV is explicitly "test".',
  );
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveDatabasePath() {
  const configured = process.env.SCRIBE_DB_PATH;
  if (!configured) {
    return path.resolve(process.cwd(), DEFAULT_DB_PATH);
  }

  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

function resolveRepoSyncRoot() {
  const configured = process.env.SCRIBE_REPO_SYNC_ROOT;
  if (!configured) {
    return path.resolve(process.cwd(), DEFAULT_REPO_SYNC_ROOT);
  }

  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

let configCache = null;

export function getConfig() {
  if (configCache) {
    return configCache;
  }

  const encryptionKey = resolveEncryptionKey();

  configCache = {
    port: toPositiveNumber(process.env.PORT, 8787),
    dbPath: resolveDatabasePath(),
    repoSyncRoot: resolveRepoSyncRoot(),
    encryptionKey,
    sessionTtlMs: toPositiveNumber(process.env.SCRIBE_SESSION_TTL_HOURS, DEFAULT_SESSION_TTL_HOURS) * 60 * 60 * 1000,
    isProduction: process.env.NODE_ENV === 'production',
  };

  return configCache;
}

export function resetConfigCache() {
  configCache = null;
}
