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
const completeOpenAIOAuthChat = vi.fn(async () => ({
  text: 'not-json',
  model: 'gpt-5.4',
  requestedModel: 'gpt-5.4',
  fallbackReason: '',
}));
const streamOpenAIOAuthChat = vi.fn(async () => 'OAuth response');
const isOpenAIOAuthSessionActive = vi.fn((session) => !!session?.refreshToken && session?.status === 'connected');
const getAgentToolPromptCatalog = vi.fn(() => ([
  {
    name: 'list_note_tags',
    category: 'Notes',
    description: 'List note tags in the repository.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'save_note_to_repository',
    category: 'Notes',
    description: 'Save a markdown note and publish it.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
]));
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
  completeOpenAIOAuthChat,
  getValidOpenAIOAuthSession,
  quickOpenAIOAuthChat,
  streamOpenAIOAuthChat,
  isOpenAIOAuthSessionActive,
}));

vi.mock('../agent-tools', () => ({
  getAgentToolPromptCatalog,
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
    quickOpenAIOAuthChat.mockReset();
    quickOpenAIOAuthChat.mockResolvedValue('OAuth title');
    completeOpenAIOAuthChat.mockReset();
    completeOpenAIOAuthChat.mockResolvedValue({
      text: 'not-json',
      model: 'gpt-5.4',
      requestedModel: 'gpt-5.4',
      fallbackReason: '',
    });
    streamOpenAIOAuthChat.mockReset();
    streamOpenAIOAuthChat.mockResolvedValue('OAuth response');
    getAgentToolSystemPrompt.mockReset();
    getAgentToolSystemPrompt.mockReturnValue('Use tools when needed.');
    getAgentToolPromptCatalog.mockClear();
    resolveManualToolMessages.mockReset();
    resolveManualToolMessages.mockImplementation(async ({ messages }) => messages);
    runAgentTool.mockReset();
    runAgentTool.mockResolvedValue({ ok: false, error: 'tool failed' });
    buildRepoContextForPrompt.mockReset();
    buildRepoContextForPrompt.mockResolvedValue(null);
    shouldRequireToolUsage.mockReset();
    shouldRequireToolUsage.mockReturnValue(false);
    shouldUseRepoKnowledgeBase.mockReset();
    shouldUseRepoKnowledgeBase.mockReturnValue(false);
    logAgentEvent.mockReset();
    logAgentEvent.mockResolvedValue(undefined);
    getLatestUserPrompt.mockReset();
    getLatestUserPrompt.mockImplementation((messages) => {
      const userMessage = [...messages].reverse().find((message) => message.role === 'user');
      return userMessage?.content || '';
    });
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
    expect(completeOpenAIOAuthChat).toHaveBeenCalled();
    expect(streamOpenAIOAuthChat).toHaveBeenCalled();
  });

  it('routes oauth repo-note questions through the shared tool suite when needed', async () => {
    const oauthSession = {
      status: 'connected',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    };
    shouldUseRepoKnowledgeBase.mockReturnValueOnce(true);
    shouldRequireToolUsage.mockReturnValueOnce(true);
    completeOpenAIOAuthChat
      .mockResolvedValueOnce({
        text: JSON.stringify({ type: 'tool_calls', calls: [{ name: 'list_note_tags', arguments: {} }] }),
        model: 'gpt-5.4',
        requestedModel: 'gpt-5.4',
        fallbackReason: '',
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ type: 'final', message: 'You currently use #project and #research.' }),
        model: 'gpt-5.4',
        requestedModel: 'gpt-5.4',
        fallbackReason: '',
      });
    runAgentTool.mockResolvedValueOnce({
      ok: true,
      toolName: 'list_note_tags',
      data: { tags: [{ tag: 'project', count: 2 }, { tag: 'research', count: 1 }] },
    });

    const onChunk = vi.fn();
    const onMeta = vi.fn();
    const { initOpenAI, streamChat } = await import('../openai');
    initOpenAI({
      openaiConnectionMethod: 'oauth',
      openaiOAuthSession: oauthSession,
      agentModel: 'gpt-5.4',
    });

    await expect(streamChat([{ role: 'user', content: 'What note tags do I use right now?' }], null, onChunk, null, onMeta)).resolves.toBe('You currently use #project and #research.');
    expect(runAgentTool).toHaveBeenCalledWith('list_note_tags', '{}');
    expect(streamOpenAIOAuthChat).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith('You currently use #project and #research.', 'You currently use #project and #research.');
    expect(onMeta).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'oauth',
      usedModel: 'gpt-5.4',
    }));
  });

  it('uses the agent to choose a publish path in oauth mode before saving', async () => {
    const oauthSession = {
      status: 'connected',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    };
    buildRepoContextForPrompt.mockResolvedValueOnce({
      contextText: 'Repository entries under /:\n- dir: Projects\n- dir: Inbox',
    });
    quickOpenAIOAuthChat.mockResolvedValueOnce('{"path":"Projects/scribe.md"}');
    runAgentTool.mockResolvedValueOnce({
      ok: true,
      toolName: 'save_note_to_repository',
      data: {
        file: { path: 'Projects/scribe.md' },
        publish: {
          commitSha: 'abc123',
          remoteHeadSha: 'abc123',
          validatedRemote: true,
        },
      },
    });

    const prompt = [
      '[SCRIBE_ACTION]',
      JSON.stringify({ action: 'save_note_to_repository', pathHint: 'Notes/scribe.md', commitMessage: 'save note: Scribe' }),
      '[/SCRIBE_ACTION]',
      '',
      '```markdown',
      '# Scribe\n\nCurrent notes.',
      '```',
    ].join('\n');

    const onChunk = vi.fn();
    const { initOpenAI, streamChat } = await import('../openai');
    initOpenAI({
      openaiConnectionMethod: 'oauth',
      openaiOAuthSession: oauthSession,
      agentModel: 'gpt-5.4',
    });

    await expect(streamChat([{ role: 'user', content: prompt }], null, onChunk, null)).resolves.toContain('Remote verification passed');
    expect(runAgentTool).toHaveBeenCalledTimes(1);
    expect(runAgentTool.mock.calls[0][0]).toBe('save_note_to_repository');
    expect(JSON.parse(runAgentTool.mock.calls[0][1])).toEqual({
      pathHint: 'Notes/scribe.md',
      path: 'Projects/scribe.md',
      commitMessage: 'save note: Scribe',
      content: '# Scribe\n\nCurrent notes.',
    });
    expect(quickOpenAIOAuthChat).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Path hint: Notes/scribe.md'),
    }));
    expect(streamOpenAIOAuthChat).not.toHaveBeenCalled();
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

  it('bypasses tool orchestration for structured publish prompts in manual mode', async () => {
    shouldUseRepoKnowledgeBase.mockReturnValueOnce(true);
    shouldRequireToolUsage.mockReturnValueOnce(true);
    buildRepoContextForPrompt.mockResolvedValueOnce({
      contextText: 'Repository notes context\n- Projects/Scribe.md',
    });
    manualCreate.mockResolvedValueOnce((async function* stream() {
      yield {
        choices: [{ delta: { content: '{"path":"Projects/scribe.md"}' } }],
      };
    }()));
    runAgentTool.mockResolvedValueOnce({
      ok: true,
      toolName: 'save_note_to_repository',
      data: {
        file: { path: 'Projects/scribe.md' },
        publish: {
          commitSha: 'abc123',
          remoteHeadSha: 'abc123',
          validatedRemote: true,
        },
      },
    });

    const prompt = [
      '[SCRIBE_ACTION]',
      JSON.stringify({ action: 'save_note_to_repository', pathHint: 'Notes/scribe.md', commitMessage: 'save note: Scribe' }),
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
    expect(runAgentTool).toHaveBeenCalledTimes(1);
    expect(runAgentTool.mock.calls[0][0]).toBe('save_note_to_repository');
    expect(JSON.parse(runAgentTool.mock.calls[0][1])).toEqual({
      pathHint: 'Notes/scribe.md',
      path: 'Projects/scribe.md',
      commitMessage: 'save note: Scribe',
      content: '# Scribe\n\nCurrent notes.',
    });
    expect(resolveManualToolMessages).not.toHaveBeenCalled();
    expect(manualCreate).toHaveBeenCalledWith(expect.objectContaining({
      stream: true,
      temperature: 0.1,
      max_tokens: 200,
    }), { signal: null });
  });

  it('falls back to a canonical markdown filename when the save hint is invalid', async () => {
    buildRepoContextForPrompt.mockResolvedValueOnce({
      contextText: 'Repository entries under /:\n- dir: Projects',
    });
    manualCreate.mockResolvedValueOnce((async function* stream() {
      yield {
        choices: [{ delta: { content: '{"path":"Projects/not-used.txt"}' } }],
      };
    }()));
    runAgentTool.mockResolvedValueOnce({
      ok: true,
      toolName: 'save_note_to_repository',
      data: {
        file: { path: 'Projects/sprint-review-notes.md' },
        publish: {
          commitSha: 'abc123',
          remoteHeadSha: 'abc123',
          validatedRemote: true,
        },
      },
    });

    const prompt = [
      '[SCRIBE_ACTION]',
      JSON.stringify({ action: 'save_note_to_repository', pathHint: 'Projects/not-used.txt', commitMessage: 'save note: Sprint Review Notes' }),
      '[/SCRIBE_ACTION]',
      '',
      '```markdown',
      '# Sprint Review Notes\n\nCurrent notes.',
      '```',
    ].join('\n');

    const { initOpenAI, streamChat } = await import('../openai');
    initOpenAI({
      agentBaseUrl: 'http://localhost:11434/v1',
      agentModel: 'gpt-4o',
    });

    await expect(streamChat([{ role: 'user', content: prompt }], null, vi.fn(), null)).resolves.toContain('Remote verification passed');
    expect(JSON.parse(runAgentTool.mock.calls[0][1])).toEqual({
      pathHint: 'Projects/not-used.txt',
      path: 'Projects/sprint-review-notes.md',
      commitMessage: 'save note: Sprint Review Notes',
      content: '# Sprint Review Notes\n\nCurrent notes.',
    });
  });

  it('normalizes generated titles and falls back to truncated prompts', async () => {
    const { normalizeGeneratedTitle, getFallbackTitle } = await import('../openai');

    expect(normalizeGeneratedTitle('  "Sprint Planning Notes"  ')).toBe('Sprint Planning Notes');
    expect(getFallbackTitle('   Draft a project kickoff agenda with owners and dates   ', 24)).toBe('Draft a project kickoff…');
    expect(getFallbackTitle('   ')).toBe('New Chat');
  });
});
