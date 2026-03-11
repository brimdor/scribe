import OpenAI from 'openai';
import { NOTE_SYSTEM_PROMPT, OPENAI_MODEL } from '../utils/constants';
import { getAgentToolSystemPrompt, resolveManualToolMessages, runAgentTool } from './agent-tools';
import { logAgentEvent } from './debug';
import { buildRepoContextForPrompt, getLatestUserPrompt, shouldRequireToolUsage, shouldUseRepoKnowledgeBase } from './github';
import { parseSaveNotePromptAction } from '../utils/note-publish';
import {
  getValidOpenAIOAuthSession,
  isOpenAIOAuthSessionActive,
  quickOpenAIOAuthChat,
  streamOpenAIOAuthChat,
} from './openai-oauth';

let client = null;
let clientConfig = null;

function dispatchOAuthSessionUpdate(session) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('scribe:openai-oauth-session', {
    detail: { session },
  }));
}

export function resolveOpenAIConfig(config = {}) {
  if (typeof config === 'string') {
    return {
      provider: 'manual',
      apiKey: config.trim() || '1234',
      baseURL: undefined,
      model: OPENAI_MODEL,
      openaiOAuthSession: null,
    };
  }

  const provider = config.openaiConnectionMethod === 'oauth' && isOpenAIOAuthSessionActive(config.openaiOAuthSession)
    ? 'oauth'
    : 'manual';

  const resolvedModel = config.model?.trim() || config.agentModel?.trim() || '';

  return {
    provider,
    apiKey: config.apiKey?.trim() || config.agentApiKey?.trim() || '1234',
    baseURL: config.baseURL?.trim()?.replace(/\/+$/, '') || config.agentBaseUrl?.trim()?.replace(/\/+$/, '') || undefined,
    model: resolvedModel || (provider === 'manual' ? OPENAI_MODEL : ''),
    openaiOAuthSession: config.openaiOAuthSession || null,
  };
}

export function initOpenAI(config) {
  clientConfig = resolveOpenAIConfig(config);

  if (clientConfig.provider === 'oauth') {
    client = { provider: 'oauth' };
    return client;
  }

  if (!clientConfig.baseURL) {
    client = null;
    return null;
  }

  client = new OpenAI({
    apiKey: clientConfig.apiKey,
    baseURL: clientConfig.baseURL,
    dangerouslyAllowBrowser: true,
  });

  return client;
}

export function getOpenAIClient() {
  return client;
}

export function getOpenAIConfig() {
  return clientConfig;
}

function normalizeModelLabel(value, fallback = 'auto') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

async function getOAuthSession() {
  if (!clientConfig?.openaiOAuthSession) {
    throw new Error('OpenAI sign-in is not connected. Connect OpenAI in Settings.');
  }

  const refreshedSession = await getValidOpenAIOAuthSession(clientConfig.openaiOAuthSession, {
    onRefresh: (session) => {
      clientConfig = {
        ...clientConfig,
        openaiOAuthSession: session,
      };
      dispatchOAuthSessionUpdate(session);
    },
  });

  clientConfig = {
    ...clientConfig,
    openaiOAuthSession: refreshedSession,
  };

  return refreshedSession;
}

export function normalizeGeneratedTitle(title) {
  return title?.trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\s+/g, ' ').trim() || '';
}

export function getFallbackTitle(userMessage, maxLength = 50) {
  const normalizedMessage = userMessage?.replace(/\s+/g, ' ').trim() || '';
  if (!normalizedMessage) {
    return 'New Chat';
  }

  if (normalizedMessage.length <= maxLength) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, maxLength - 1).trimEnd()}…`;
}

export async function streamChat(messages, schemaContext = null, onChunk, signal = null, onMeta = null) {
  if (!clientConfig) {
    throw new Error('OpenAI client not initialized. Please configure your agent settings.');
  }

  const latestPrompt = getLatestUserPrompt(messages);
  const shouldLoadRepoKnowledge = shouldUseRepoKnowledgeBase(latestPrompt);
  const requireToolUse = shouldRequireToolUsage(latestPrompt);
  const requestedSaveAction = parseSaveNotePromptAction(latestPrompt);

  await logAgentEvent('chat', 'stream_started', {
    provider: clientConfig.provider,
    requireToolUse,
    hasRepoKnowledge: shouldLoadRepoKnowledge,
    hasSaveAction: !!requestedSaveAction,
  });

  if (clientConfig.provider === 'oauth') {
    const repoContext = shouldLoadRepoKnowledge
      ? await buildRepoContextForPrompt(latestPrompt, { reason: 'assistant-tool' })
      : null;
    const repoContextMessage = repoContext?.contextText
      ? {
        role: 'system',
        content: `Use the following local repository context when it is relevant:\n\n${repoContext.contextText}`,
      }
      : null;
    const session = await getOAuthSession();
    return streamOpenAIOAuthChat({
      session,
      model: clientConfig.model,
      messages: repoContextMessage ? [repoContextMessage, ...messages] : messages,
      schemaContext,
      signal,
      onChunk,
      onModel: onMeta,
    });
  }

  if (!client) {
    throw new Error('OpenAI client not initialized. Please configure your agent settings.');
  }

  const systemMessages = [
    { role: 'system', content: NOTE_SYSTEM_PROMPT },
    { role: 'system', content: getAgentToolSystemPrompt() },
  ];

  const repoContext = shouldLoadRepoKnowledge
    ? await buildRepoContextForPrompt(latestPrompt, { reason: 'assistant-tool' })
    : null;
  const repoContextMessage = repoContext?.contextText
    ? {
      role: 'system',
      content: `Selected repository knowledge base:\n\n${repoContext.contextText}`,
    }
    : null;

  if (repoContextMessage) {
    systemMessages.push(repoContextMessage);
  }

  if (schemaContext) {
    systemMessages.push({
      role: 'system',
      content: `The user has selected the following note schema. Use this template structure when generating notes:\n\n${schemaContext}`,
    });
  }

  let resolvedMessages = [...systemMessages, ...messages];
  let toolFallbackReason = '';

  try {
    resolvedMessages = await resolveManualToolMessages({
      client,
      model: clientConfig?.model || OPENAI_MODEL,
      messages: resolvedMessages,
      signal,
      requireToolUse,
    });
    await logAgentEvent('tools', 'tool_orchestration_completed', {
      requireToolUse,
      usedDirectSaveFallback: false,
    });
  } catch (error) {
    toolFallbackReason = error?.message || 'Tool execution is unavailable for the current provider.';
    await logAgentEvent('tools', 'tool_orchestration_failed', {
      error: toolFallbackReason,
      requireToolUse,
      hasSaveAction: !!requestedSaveAction,
    });

    if (requestedSaveAction) {
      await logAgentEvent('tools', 'direct_save_fallback_requested', {
        path: requestedSaveAction.path,
        commitMessage: requestedSaveAction.commitMessage,
      });

      const result = await runAgentTool('save_note_to_repository', JSON.stringify(requestedSaveAction));
      if (result.ok) {
        await logAgentEvent('tools', 'direct_save_fallback_succeeded', {
          path: result.data?.file?.path || requestedSaveAction.path,
          commitSha: result.data?.publish?.commitSha || '',
          remoteHeadSha: result.data?.publish?.remoteHeadSha || '',
        });

        const successText = [
          `Saved note to \`${result.data?.file?.path || requestedSaveAction.path}\`.`,
          `Committed and pushed to \`origin/main\` with commit \`${result.data?.publish?.commitSha || 'unknown'}\`.`,
          result.data?.publish?.validatedRemote
            ? `Remote verification passed: \`${result.data.publish.remoteHeadSha}\` is now the latest commit on \`origin/main\`.`
            : 'Remote verification status is unavailable.',
        ].join('\n\n');

        onChunk?.(successText, successText);
        return successText;
      }

      await logAgentEvent('tools', 'direct_save_fallback_failed', {
        error: result.error || 'save_note_to_repository failed',
        path: requestedSaveAction.path,
      });

      if (requireToolUse) {
        const failureText = `I could not sync the current note because \`save_note_to_repository\` failed: ${result.error || 'unknown error'}`;
        onChunk?.(failureText, failureText);
        return failureText;
      }
    }

    if (requireToolUse) {
      systemMessages.push({
        role: 'system',
        content: 'Required repository tools were unavailable. You must not claim any save, edit, commit, push, or sync action succeeded. Explain that the requested action was not completed.',
      });
    }

    resolvedMessages = [...systemMessages, ...messages];
  }

  const requestedModel = normalizeModelLabel(clientConfig?.model || OPENAI_MODEL, OPENAI_MODEL);
  let usedModel = requestedModel;
  onMeta?.({
    provider: 'manual',
    requestedModel,
    usedModel,
    fallbackReason: toolFallbackReason,
  });

  const stream = await client.chat.completions.create({
    model: clientConfig?.model || OPENAI_MODEL,
    messages: resolvedMessages,
    stream: true,
    temperature: 0.7,
    max_tokens: 4096,
    store: false,
  }, { signal });

  let fullText = '';
  for await (const chunk of stream) {
    const chunkModel = typeof chunk?.model === 'string' ? chunk.model.trim() : '';
    if (chunkModel && chunkModel !== usedModel) {
      usedModel = chunkModel;
      onMeta?.({
        provider: 'manual',
        requestedModel,
        usedModel,
        fallbackReason: toolFallbackReason,
      });
    }

    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullText += delta;
      onChunk?.(delta, fullText);
    }
  }

  return fullText;
}

export async function quickChat(prompt) {
  if (!clientConfig) {
    return null;
  }

  if (clientConfig.provider === 'oauth') {
    const session = await getOAuthSession();
    return quickOpenAIOAuthChat({
      session,
      prompt,
      model: clientConfig.model,
    });
  }

  if (!client) {
    return null;
  }

  const response = await client.chat.completions.create({
    model: clientConfig?.model || OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Respond concisely.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 100,
    store: false,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

export async function generateTitle(userMessage) {
  return normalizeGeneratedTitle(await quickChat(
    `Generate a short, descriptive title (3-6 words, no quotes) for a conversation that starts with: "${userMessage.slice(0, 200)}"`
  ));
}
