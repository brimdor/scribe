import { describe, expect, it, vi } from 'vitest';
import { enforceSecureTransport } from '../../server/src/middleware/transport.js';

function createResponseRecorder() {
  const payload = {
    statusCode: null,
    body: null,
  };

  return {
    payload,
    res: {
      status(code) {
        payload.statusCode = code;
        return this;
      },
      json(body) {
        payload.body = body;
      },
    },
  };
}

describe('transport security middleware', () => {
  it('rejects insecure non-localhost requests', () => {
    const req = {
      secure: false,
      headers: {
        host: 'example.com',
      },
    };
    const next = vi.fn();
    const { res, payload } = createResponseRecorder();

    enforceSecureTransport(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(payload.statusCode).toBe(426);
    expect(payload.body?.error).toContain('HTTPS');
  });

  it('allows localhost development requests without TLS', () => {
    const req = {
      secure: false,
      headers: {
        host: 'localhost:5173',
      },
    };
    const next = vi.fn();
    const { res, payload } = createResponseRecorder();

    enforceSecureTransport(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(payload.statusCode).toBe(null);
  });
});
