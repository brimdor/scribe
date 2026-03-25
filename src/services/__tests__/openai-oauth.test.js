import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agent-context', () => ({
  buildAgentContext: vi.fn().mockResolvedValue({
    purpose: 'test',
    workspace: null,
    tools: [],
    preferences: {},
  }),
  formatAgentContextForPrompt: vi.fn().mockReturnValue(''),
}));

function createEventStreamResponse(payloads) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      payloads.forEach((payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return {
    ok: true,
    body,
  };
}

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

  it('omits unsupported agent-mode model when using codex responses', async () => {
    const fetchMock = vi.fn(async () => createEventStreamResponse([
      { type: 'response.output_text.delta', delta: 'ok', model: 'gpt-5' },
      { type: 'response.completed', response: { output_text: 'ok', model: 'gpt-5' } },
    ]));

    vi.stubGlobal('fetch', fetchMock);

    const { quickOpenAIOAuthChat } = await import('../openai-oauth');
    const result = await quickOpenAIOAuthChat({
      session: {
        accessToken: 'access-token',
        accountId: '',
      },
      prompt: 'hello',
      model: 'agent-mode',
    });

    expect(result).toBe('ok');
    const request = fetchMock.mock.calls[0];
    const payload = JSON.parse(request[1].body);
    expect(payload.stream).toBe(true);
    expect(payload.model).toBeUndefined();
  });

  it('filters unsupported models from the oauth model list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [
          { slug: 'gpt-5' },
          { slug: 'agent-mode' },
          { slug: 'None' },
          { id: 'o4-mini' },
        ],
      }),
    })));

    const { fetchOpenAIModels } = await import('../openai-oauth');
    const models = await fetchOpenAIModels({
      session: {
        accessToken: 'access-token',
        accountId: '',
      },
    });

    expect(models).toEqual(['gpt-5', 'o4-mini']);
  });

  it('falls back to gpt-5 when codex rejects a None/default model', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ detail: "The 'None' model is not supported when using Codex with a ChatGPT account." }),
      })
      .mockResolvedValueOnce(createEventStreamResponse([
        { type: 'response.output_text.delta', delta: 'fallback works', model: 'gpt-5' },
        { type: 'response.completed', response: { output_text: 'fallback works', model: 'gpt-5' } },
      ]));

    vi.stubGlobal('fetch', fetchMock);

    const { quickOpenAIOAuthChat } = await import('../openai-oauth');
    const output = await quickOpenAIOAuthChat({
      session: {
        accessToken: 'access-token',
        accountId: '',
      },
      prompt: 'hello',
      model: 'None',
    });

    expect(output).toBe('fallback works');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondPayload = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(secondPayload.stream).toBe(true);
    expect(firstPayload.model).toBeUndefined();
    expect(secondPayload.model).toBe('gpt-5');
  });

  it('streams complete oauth chat helper responses for planner-style calls', async () => {
    const fetchMock = vi.fn(async () => createEventStreamResponse([
      { type: 'response.output_text.delta', delta: '{"type":"final",', model: 'gpt-5.4' },
      { type: 'response.output_text.delta', delta: '"message":"done"}', model: 'gpt-5.4' },
      { type: 'response.completed', response: { output_text: '{"type":"final","message":"done"}', model: 'gpt-5.4' } },
    ]));

    vi.stubGlobal('fetch', fetchMock);

    const { completeOpenAIOAuthChat } = await import('../openai-oauth');
    const response = await completeOpenAIOAuthChat({
      session: {
        accessToken: 'access-token',
        accountId: '',
      },
      model: 'gpt-5.4',
      messages: [{ role: 'user', content: 'planner' }],
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.stream).toBe(true);
    expect(response.text).toBe('{"type":"final","message":"done"}');
    expect(response.model).toBe('gpt-5.4');
  });
});
