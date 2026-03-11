import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSaveNotePrompt } from '../../src/utils/note-publish';

const manualCreate = vi.fn();
const openAIConstructor = vi.fn(() => ({
  chat: {
    completions: {
      create: manualCreate,
    },
  },
}));

const getValidOpenAIOAuthSession = vi.fn(async (session) => session);
const quickOpenAIOAuthChat = vi.fn(async () => '{"path":"Notes/sprint-review-notes.md"}');
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
    name: 'save_note_to_repository',
    category: 'Notes',
    description: 'Save a markdown note and publish it.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
]));
const getAgentToolSystemPrompt = vi.fn(() => 'Use tools when needed.');
const resolveManualToolMessages = vi.fn(async ({ messages }) => messages);
const runAgentTool = vi.fn(async () => ({ ok: false, error: 'tool failed' }));
const buildRepoContextForPrompt = vi.fn(async () => ({
  contextText: 'Repository entries under /:\n- dir: Inbox\n- dir: Projects',
}));
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

vi.mock('../../src/services/openai-oauth', () => ({
  completeOpenAIOAuthChat,
  getValidOpenAIOAuthSession,
  quickOpenAIOAuthChat,
  streamOpenAIOAuthChat,
  isOpenAIOAuthSessionActive,
}));

vi.mock('../../src/services/agent-tools', () => ({
  getAgentToolPromptCatalog,
  getAgentToolSystemPrompt,
  resolveManualToolMessages,
  runAgentTool,
}));

vi.mock('../../src/services/debug', () => ({
  logAgentEvent,
}));

vi.mock('../../src/services/github', () => ({
  buildRepoContextForPrompt,
  getLatestUserPrompt,
  shouldRequireToolUsage,
  shouldUseRepoKnowledgeBase,
}));

describe('note publish flow integration', () => {
  beforeEach(() => {
    vi.resetModules();
    manualCreate.mockReset();
    openAIConstructor.mockClear();
    quickOpenAIOAuthChat.mockReset();
    quickOpenAIOAuthChat.mockResolvedValue('{"path":"Notes/sprint-review-notes.md"}');
    completeOpenAIOAuthChat.mockReset();
    completeOpenAIOAuthChat.mockResolvedValue({
      text: 'not-json',
      model: 'gpt-5.4',
      requestedModel: 'gpt-5.4',
      fallbackReason: '',
    });
    streamOpenAIOAuthChat.mockReset();
    streamOpenAIOAuthChat.mockResolvedValue('OAuth response');
    getAgentToolPromptCatalog.mockClear();
    getAgentToolSystemPrompt.mockClear();
    resolveManualToolMessages.mockReset();
    resolveManualToolMessages.mockImplementation(async ({ messages }) => messages);
    runAgentTool.mockReset();
    runAgentTool.mockResolvedValue({ ok: false, error: 'tool failed' });
    buildRepoContextForPrompt.mockReset();
    buildRepoContextForPrompt.mockResolvedValue({
      contextText: 'Repository entries under /:\n- dir: Inbox\n- dir: Projects',
    });
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

  it('publishes a UI-generated note prompt through the oauth save flow', async () => {
    const oauthSession = {
      status: 'connected',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    };
    runAgentTool.mockResolvedValueOnce({
      ok: true,
      toolName: 'save_note_to_repository',
      data: {
        file: { path: 'Inbox/sprint-review-notes.md' },
        publish: {
          commitSha: 'abc123',
          remoteHeadSha: 'abc123',
          validatedRemote: true,
        },
      },
    });

    const { initOpenAI, streamChat } = await import('../../src/services/openai');
    initOpenAI({
      openaiConnectionMethod: 'oauth',
      openaiOAuthSession: oauthSession,
      agentModel: 'gpt-5.4',
    });

    const prompt = buildSaveNotePrompt('# Sprint Review Notes\n\nDiscuss launch blockers and owners.', {
      filePath: 'Notes/rough draft.txt',
    });

    await expect(streamChat([{ role: 'user', content: prompt }], null, vi.fn(), null)).resolves.toContain('Inbox/sprint-review-notes.md');
    expect(runAgentTool).toHaveBeenCalledWith('save_note_to_repository', expect.any(String));
    expect(JSON.parse(runAgentTool.mock.calls[0][1])).toEqual(expect.objectContaining({
      path: 'Notes/sprint-review-notes.md',
      content: '# Sprint Review Notes\n\nDiscuss launch blockers and owners.',
    }));
    expect(streamOpenAIOAuthChat).not.toHaveBeenCalled();
  });
});
