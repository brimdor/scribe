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
const getAgentToolSystemPrompt = vi.fn(() => 'Use tools when needed.');
const resolveManualToolMessages = vi.fn(async ({ messages }) => messages);
const runAgentTool = vi.fn(async () => ({ ok: false, error: 'tool failed' }));
const buildRepoContextForPrompt = vi.fn(async () => null);
const shouldRequireToolUsage = vi.fn(() => false);
const shouldUseRepoKnowledgeBase = vi.fn(() => false);
const logAgentEvent = vi.fn(async () => undefined);
const getLatestUserPrompt = vi.fn((messages) => {
  const userMessage = [...messages].reverse().find((message) => message.role === 'user');
  return userMessage?.content || '';
});

vi.mock('openai', () => ({
  default: openAIConstructor,
}));

vi.mock('../openai-oauth', () => ({
  getValidOpenAIOAuthSession,
  quickOpenAIOAuthChat,
  streamOpenAIOAuthChat,
  isOpenAIOAuthSessionActive,
}));

vi.mock('../agent-tools', () => ({
  getAgentToolSystemPrompt,
  resolveManualToolMessages,
  runAgentTool,
}));

vi.mock('../debug', () => ({
  logAgentEvent,
}));

vi.mock('../github', () => ({
  buildRepoContextForPrompt,
  getLatestUserPrompt,
  shouldRequireToolUsage,
  shouldUseRepoKnowledgeBase,
}));

describe('openai service', () => {
  beforeEach(() => {
    vi.resetModules();
    manualCreate.mockReset();
    openAIConstructor.mockClear();
    quickOpenAIOAuthChat.mockClear();
    streamOpenAIOAuthChat.mockClear();
    getAgentToolSystemPrompt.mockClear();
    resolveManualToolMessages.mockClear();
    runAgentTool.mockClear();
    buildRepoContextForPrompt.mockClear();
    shouldRequireToolUsage.mockClear();
    shouldUseRepoKnowledgeBase.mockClear();
    logAgentEvent.mockClear();
    getLatestUserPrompt.mockClear();
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
    shouldUseRepoKnowledgeBase.mockReturnValueOnce(true);
    await expect(streamChat([{ role: 'user', content: 'What are my note tags?' }], null, vi.fn(), null)).resolves.toBe('OAuth response');
    expect(buildRepoContextForPrompt).toHaveBeenCalledWith('What are my note tags?', { reason: 'assistant-tool' });
    expect(quickOpenAIOAuthChat).toHaveBeenCalled();
    expect(streamOpenAIOAuthChat).toHaveBeenCalled();
  });

  it('does not force a manual default model in oauth mode', async () => {
    const { initOpenAI, getOpenAIConfig } = await import('../openai');
    const oauthSession = {
      status: 'connected',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    };

    initOpenAI({
      openaiConnectionMethod: 'oauth',
      openaiOAuthSession: oauthSession,
    });

    expect(getOpenAIConfig()).toEqual(expect.objectContaining({
      provider: 'oauth',
      model: '',
    }));
  });

  it('runs reusable tool orchestration before manual streaming', async () => {
    shouldUseRepoKnowledgeBase.mockReturnValueOnce(true);
    shouldRequireToolUsage.mockReturnValueOnce(true);
    buildRepoContextForPrompt.mockResolvedValueOnce({
      contextText: 'Repository note tags:\n- project (2)',
    });
    manualCreate.mockResolvedValueOnce((async function* stream() {
      yield {
        model: 'gpt-4o-mini',
        choices: [{ delta: { content: 'Hello from tools' } }],
      };
    }()));

    const { initOpenAI, streamChat } = await import('../openai');
    initOpenAI({
      agentBaseUrl: 'http://localhost:11434/v1',
      agentModel: 'gpt-4o',
    });

    await expect(streamChat([{ role: 'user', content: 'Inspect the repo' }], null, vi.fn(), null)).resolves.toBe('Hello from tools');

    expect(resolveManualToolMessages).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o',
      requireToolUse: true,
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: 'Use tools when needed.' }),
        expect.objectContaining({ role: 'system', content: expect.stringContaining('Selected repository knowledge base') }),
        expect.objectContaining({ role: 'user', content: 'Inspect the repo' }),
      ]),
    }));
    expect(buildRepoContextForPrompt).toHaveBeenCalledWith('Inspect the repo', { reason: 'assistant-tool' });
  });

  it('falls back to repo context when tool orchestration fails', async () => {
    shouldUseRepoKnowledgeBase.mockReturnValueOnce(true);
    shouldRequireToolUsage.mockReturnValueOnce(true);
    resolveManualToolMessages.mockRejectedValueOnce(new Error('Tools unsupported'));
    buildRepoContextForPrompt.mockResolvedValueOnce({
      contextText: 'Repository sync result: pulled',
    });
    manualCreate.mockResolvedValueOnce((async function* stream() {
      yield {
        model: 'gpt-4o',
        choices: [{ delta: { content: 'Fallback response' } }],
      };
    }()));

    const onMeta = vi.fn();
    const { initOpenAI, streamChat } = await import('../openai');
    initOpenAI({
      agentBaseUrl: 'http://localhost:11434/v1',
      agentModel: 'gpt-4o',
    });

    await expect(streamChat([{ role: 'user', content: 'Sync repo first' }], null, vi.fn(), null, onMeta)).resolves.toBe('Fallback response');

    expect(buildRepoContextForPrompt).toHaveBeenCalledWith('Sync repo first', { reason: 'assistant-tool' });
    expect(onMeta).toHaveBeenCalledWith(expect.objectContaining({
      fallbackReason: 'Tools unsupported',
    }));
  });

  it('runs direct save fallback for structured publish prompts', async () => {
    shouldUseRepoKnowledgeBase.mockReturnValueOnce(true);
    shouldRequireToolUsage.mockReturnValueOnce(true);
    resolveManualToolMessages.mockRejectedValueOnce(new Error('The configured model did not use the required repository tools.'));
    buildRepoContextForPrompt.mockResolvedValueOnce({
      contextText: 'Repository notes context',
    });
    runAgentTool.mockResolvedValueOnce({
      ok: true,
      toolName: 'save_note_to_repository',
      data: {
        file: { path: 'Notes/scribe.md' },
        publish: {
          commitSha: 'abc123',
          remoteHeadSha: 'abc123',
          validatedRemote: true,
        },
      },
    });

    const prompt = [
      '[SCRIBE_ACTION]',
      JSON.stringify({ action: 'save_note_to_repository', path: 'Notes/scribe.md', commitMessage: 'save note: Scribe' }),
      '[/SCRIBE_ACTION]',
      '',
      '```markdown',
      '# Scribe\n\nCurrent notes.',
      '```',
    ].join('\n');

    const onChunk = vi.fn();
    const { initOpenAI, streamChat } = await import('../openai');
    initOpenAI({
      agentBaseUrl: 'http://localhost:11434/v1',
      agentModel: 'gpt-4o',
    });

    await expect(streamChat([{ role: 'user', content: prompt }], null, onChunk, null)).resolves.toContain('Remote verification passed');
    expect(runAgentTool).toHaveBeenCalledWith('save_note_to_repository', JSON.stringify({
      path: 'Notes/scribe.md',
      commitMessage: 'save note: Scribe',
      content: '# Scribe\n\nCurrent notes.',
    }));
  });

  it('normalizes generated titles and falls back to truncated prompts', async () => {
    const { normalizeGeneratedTitle, getFallbackTitle } = await import('../openai');

    expect(normalizeGeneratedTitle('  "Sprint Planning Notes"  ')).toBe('Sprint Planning Notes');
    expect(getFallbackTitle('   Draft a project kickoff agenda with owners and dates   ', 24)).toBe('Draft a project kickoff…');
    expect(getFallbackTitle('   ')).toBe('New Chat');
  });
});
