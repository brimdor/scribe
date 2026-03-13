import { afterEach, describe, expect, it } from 'vitest';

import { getConfig, resetConfigCache } from '../../server/src/config/env.js';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  SCRIBE_DB_ENCRYPTION_KEY: process.env.SCRIBE_DB_ENCRYPTION_KEY,
};

function restoreEnv() {
  if (ORIGINAL_ENV.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  }

  if (ORIGINAL_ENV.SCRIBE_DB_ENCRYPTION_KEY === undefined) {
    delete process.env.SCRIBE_DB_ENCRYPTION_KEY;
  } else {
    process.env.SCRIBE_DB_ENCRYPTION_KEY = ORIGINAL_ENV.SCRIBE_DB_ENCRYPTION_KEY;
  }
}

afterEach(() => {
  restoreEnv();
  resetConfigCache();
});

describe('env config', () => {
  it('requires an encryption key outside explicit test mode', () => {
    delete process.env.SCRIBE_DB_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'development';
    resetConfigCache();

    expect(() => getConfig()).toThrow(
      'SCRIBE_DB_ENCRYPTION_KEY must be set unless NODE_ENV is explicitly "test".',
    );
  });

  it('allows the fallback encryption key in explicit test mode', () => {
    delete process.env.SCRIBE_DB_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'test';
    resetConfigCache();

    expect(getConfig().encryptionKey).toBe('change-me-local-dev-key');
  });

  it('uses the configured encryption key when present', () => {
    process.env.SCRIBE_DB_ENCRYPTION_KEY = 'configured-secret';
    process.env.NODE_ENV = 'production';
    resetConfigCache();

    expect(getConfig().encryptionKey).toBe('configured-secret');
  });
});
