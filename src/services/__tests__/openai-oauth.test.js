import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('openai oauth service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('creates a device authorization flow for browser sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        device_auth_id: 'device-auth-123',
        user_code: 'CODE-1234',
        interval: '7',
        expires_at: '2026-03-10T16:39:03.580152+00:00',
      }),
    })));

    const { createOpenAIDeviceFlow } = await import('../openai-oauth');

    const { verificationUrl, pendingFlow } = await createOpenAIDeviceFlow({
      returnPath: '/workspace',
    });

    expect(verificationUrl).toBe('https://auth.openai.com/codex/device');
    expect(pendingFlow).toEqual(expect.objectContaining({
      type: 'device',
      deviceAuthId: 'device-auth-123',
      userCode: 'CODE-1234',
      verificationUrl: 'https://auth.openai.com/codex/device',
      intervalMs: 7000,
      returnPath: '/workspace',
    }));
  });

  it('rejects callback completion when the stored state does not match', async () => {
    const { completeOpenAIOAuthCallback } = await import('../openai-oauth');

    await expect(completeOpenAIOAuthCallback({
      code: 'code-123',
      state: 'wrong-state',
      pendingFlow: {
        codeVerifier: 'verifier',
        state: 'expected-state',
        startedAt: Date.now(),
        returnPath: '/',
      },
      redirectUri: 'http://localhost:5173',
    })).rejects.toThrow('could not be validated');
  });

  it('exchanges a callback code for a normalized session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        email: 'user@example.com',
      }),
    })));

    const { completeOpenAIOAuthCallback } = await import('../openai-oauth');
    const session = await completeOpenAIOAuthCallback({
      code: 'code-123',
      state: 'expected-state',
      pendingFlow: {
        codeVerifier: 'verifier',
        state: 'expected-state',
        startedAt: Date.now(),
        returnPath: '/',
      },
      redirectUri: 'http://localhost:5173',
    });

    expect(session).toEqual(expect.objectContaining({
      status: 'connected',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: 'user@example.com',
      lastError: '',
    }));
  });

  it('polls the device flow and exchanges the returned authorization code', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        status: 404,
        ok: false,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          authorization_code: 'auth-code-123',
          code_verifier: 'device-verifier-123',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          email: 'user@example.com',
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { pollOpenAIDeviceFlow } = await import('../openai-oauth');
    const pendingFlow = {
      type: 'device',
      deviceAuthId: 'device-auth-123',
      userCode: 'CODE-1234',
      startedAt: Date.now(),
      returnPath: '/',
      verificationUrl: 'https://auth.openai.com/codex/device',
      intervalMs: 5000,
      expiresAt: Date.now() + 60_000,
    };

    await expect(pollOpenAIDeviceFlow(pendingFlow)).resolves.toEqual({ status: 'pending' });
    await expect(pollOpenAIDeviceFlow(pendingFlow)).resolves.toEqual({
      status: 'connected',
      session: expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        email: 'user@example.com',
      }),
    });
  });

  it('refreshes a saved session and preserves refresh token when unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 1800,
      }),
    })));

    const { refreshOpenAIOAuthSession } = await import('../openai-oauth');
    const refreshed = await refreshOpenAIOAuthSession({
      status: 'connected',
      accessToken: 'old-access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1,
      accountId: '',
      email: '',
      lastError: '',
    });

    expect(refreshed).toEqual(expect.objectContaining({
      status: 'connected',
      accessToken: 'new-access-token',
      refreshToken: 'refresh-token',
    }));
  });
});
