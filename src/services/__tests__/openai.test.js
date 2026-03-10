import { beforeEach, describe, expect, it, vi } from 'vitest';

const manualCreate = vi.fn();
const openAIConstructor = vi.fn(() => ({
  chat: {
    completions: {
      create: manualCreate,
    },
  },
}));

const getValidOpenAIOAuthSession = vi.fn(async (session) => session);
const quickOpenAIOAuthChat = vi.fn(async () => 'OAuth title');
const streamOpenAIOAuthChat = vi.fn(async () => 'OAuth response');
const isOpenAIOAuthSessionActive = vi.fn((session) => !!session?.refreshToken && session?.status === 'connected');

vi.mock('openai', () => ({
  default: openAIConstructor,
}));

vi.mock('../openai-oauth', () => ({
  getValidOpenAIOAuthSession,
  quickOpenAIOAuthChat,
  streamOpenAIOAuthChat,
  isOpenAIOAuthSessionActive,
}));

describe('openai service', () => {
  beforeEach(() => {
    vi.resetModules();
    manualCreate.mockReset();
    openAIConstructor.mockClear();
    quickOpenAIOAuthChat.mockClear();
    streamOpenAIOAuthChat.mockClear();
  });

  it('uses fallback api key when the provided key is blank', async () => {
    const { initOpenAI, resolveOpenAIConfig } = await import('../openai');

    expect(resolveOpenAIConfig({ apiKey: '   ', baseURL: 'http://localhost:11434/v1/' })).toEqual({
      provider: 'manual',
      apiKey: '1234',
      baseURL: 'http://localhost:11434/v1',
      model: 'gpt-4',
      openaiOAuthSession: null,
    });

    initOpenAI({ apiKey: '', baseURL: 'http://localhost:11434/v1/' });

    expect(openAIConstructor).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: '1234',
      baseURL: 'http://localhost:11434/v1',
      dangerouslyAllowBrowser: true,
    }));
  });

  it('uses oauth mode when an active session exists', async () => {
    const { initOpenAI, getOpenAIConfig, quickChat, streamChat } = await import('../openai');
    const oauthSession = {
      status: 'connected',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    };

    initOpenAI({
      openaiConnectionMethod: 'oauth',
      openaiOAuthSession: oauthSession,
      agentModel: 'gpt-5.4',
    });

    expect(getOpenAIConfig()).toEqual(expect.objectContaining({
      provider: 'oauth',
      model: 'gpt-5.4',
      openaiOAuthSession: oauthSession,
    }));

    await expect(quickChat('hello')).resolves.toBe('OAuth title');
    await expect(streamChat([{ role: 'user', content: 'hi' }], null, vi.fn(), null)).resolves.toBe('OAuth response');
    expect(quickOpenAIOAuthChat).toHaveBeenCalled();
    expect(streamOpenAIOAuthChat).toHaveBeenCalled();
  });

  it('normalizes generated titles and falls back to truncated prompts', async () => {
    const { normalizeGeneratedTitle, getFallbackTitle } = await import('../openai');

    expect(normalizeGeneratedTitle('  "Sprint Planning Notes"  ')).toBe('Sprint Planning Notes');
    expect(getFallbackTitle('   Draft a project kickoff agenda with owners and dates   ', 24)).toBe('Draft a project kickoff…');
    expect(getFallbackTitle('   ')).toBe('New Chat');
  });
});
