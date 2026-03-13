import { NOTE_SYSTEM_PROMPT, OPENAI_MODEL } from '../utils/constants';
import { getAgentToolPromptCatalog, getAgentToolSystemPrompt, resolveManualToolMessages, runAgentTool } from './agent-tools';
import { ApiError, apiRequest } from './api';
import { logAgentEvent } from './debug';
import { buildRepoContextForPrompt, getLatestUserPrompt, shouldRequireToolUsage, shouldUseRepoKnowledgeBase } from './github';
import { isMarkdownPath, parseSaveNotePromptAction, resolveNoteSavePath } from '../utils/note-publish';
import {
  completeOpenAIOAuthChat,
  getValidOpenAIOAuthSession,
  isOpenAIOAuthSessionActive,
  quickOpenAIOAuthChat,
  streamOpenAIOAuthChat,
} from './openai-oauth';

const OAUTH_TOOL_ROUND_LIMIT = 6;

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

function normalizeRepoPath(value) {
  const normalized = String(value || '').trim().replace(/^['"`]+|['"`]+$/g, '');
  if (!normalized || normalized.includes('..') || normalized.startsWith('/')) {
    return '';
  }

  const withForwardSlashes = normalized.replace(/\\/g, '/');
  return withForwardSlashes;
}

function extractPathFromSelectionResponse(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return '';
  }

  const candidates = [];

  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === 'object') {
      candidates.push(parsed.path);
    }
  } catch {
    // Ignore JSON parsing failures and continue with regex extraction.
  }

  const jsonPathMatch = normalized.match(/"path"\s*:\s*"([^"]+\.md)"/i);
  if (jsonPathMatch?.[1]) {
    candidates.push(jsonPathMatch[1]);
  }

  const fencedPathMatch = normalized.match(/```(?:json|text)?\n([\s\S]*?)\n```/i);
  if (fencedPathMatch?.[1]) {
    candidates.push(fencedPathMatch[1]);
  }

  const plainPathMatch = normalized.match(/\b(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md\b/);
  if (plainPathMatch?.[0]) {
    candidates.push(plainPathMatch[0]);
  }

  for (const candidate of candidates) {
    const resolved = normalizeRepoPath(candidate);
    if (isMarkdownPath(resolved)) {
      return resolved;
    }
  }

  return '';
}

async function collectManualResponseText({ messages, temperature = 0.2, maxTokens = 200 } = {}) {
  if (!clientConfig?.baseURL) {
    return '';
  }

  const response = await apiRequest('/api/ai/manual/chat', {
    method: 'POST',
    body: {
      messages,
      model: clientConfig?.model || OPENAI_MODEL,
      stream: false,
      temperature,
      maxTokens,
    },
  });

  return response.text || '';
}

async function parseErrorResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json();
      throw new ApiError(payload?.error || `Request failed with status ${response.status}`, {
        status: response.status,
        code: payload?.code || null,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
    }
  }

  const message = await response.text();
  throw new ApiError(message || `Request failed with status ${response.status}`, {
    status: response.status,
  });
}

function readSseEventBlock(block = '') {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return {
    event,
    payload: JSON.parse(dataLines.join('\n')),
  };
}

async function streamManualChatResponse({ messages, model, temperature = 0.7, maxTokens = 4096, signal = null, onChunk, onMeta } = {}) {
  const response = await fetch('/api/ai/manual/chat', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      model,
      stream: true,
      temperature,
      maxTokens,
    }),
    signal,
  });

  if (!response.ok) {
    await parseErrorResponse(response);
  }

  if (!response.body) {
    throw new Error('Manual provider response body is unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finalPayload = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);
      if (block) {
        const message = readSseEventBlock(block);
        if (message?.event === 'meta') {
          onMeta?.({
            provider: 'manual',
            requestedModel: message.payload?.requestedModel || model || OPENAI_MODEL,
            usedModel: message.payload?.usedModel || model || OPENAI_MODEL,
            fallbackReason: message.payload?.fallbackReason || '',
          });
        } else if (message?.event === 'chunk') {
          const delta = message.payload?.delta || '';
          if (delta) {
            fullText += delta;
            onChunk?.(delta, fullText);
          }
        } else if (message?.event === 'done') {
          finalPayload = message.payload;
        } else if (message?.event === 'error') {
          throw new Error(message.payload?.error || 'Manual provider request failed.');
        }
      }
      boundaryIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      break;
    }
  }

  return finalPayload?.text || fullText;
}

function formatOAuthToolTranscript(messages, toolEvents = []) {
  const conversationLines = messages.map((message) => {
    const role = String(message?.role || 'user').toUpperCase();
    return `[${role}]\n${String(message?.content || '').trim()}`;
  });

  const toolLines = toolEvents.flatMap((event) => {
    const lines = [];
    if (event?.call) {
      lines.push(`[ASSISTANT_TOOL_CALL]\n${JSON.stringify(event.call, null, 2)}`);
    }
    if (event?.result) {
      lines.push(`[TOOL_RESULT]\n${JSON.stringify(event.result, null, 2)}`);
    }
    return lines;
  });

  return [...conversationLines, ...toolLines].filter(Boolean).join('\n\n');
}

function extractJsonBlock(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) {
    throw new Error('Empty tool-routing response.');
  }

  const fencedMatch = normalized.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return normalized.slice(firstBrace, lastBrace + 1);
  }

  return normalized;
}

function parseOAuthToolPlannerResponse(text = '') {
  let parsed;
  try {
    parsed = JSON.parse(extractJsonBlock(text));
  } catch {
    throw new Error('OAuth tool planner returned invalid JSON.');
  }

  if (parsed?.type === 'final' && typeof parsed.message === 'string') {
    return {
      type: 'final',
      message: parsed.message.trim(),
    };
  }

  if (parsed?.type === 'tool_calls' && Array.isArray(parsed.calls) && parsed.calls.length) {
    return {
      type: 'tool_calls',
      calls: parsed.calls
        .filter((call) => typeof call?.name === 'string' && call.name.trim())
        .map((call) => ({
          name: call.name.trim(),
          arguments: call.arguments && typeof call.arguments === 'object' ? call.arguments : {},
        })),
    };
  }

  throw new Error('OAuth tool planner returned an unsupported response shape.');
}

async function resolveOAuthToolResponse({ session, model, messages, signal = null, requireToolUse = false, onMeta = null } = {}) {
  const toolCatalog = JSON.stringify(getAgentToolPromptCatalog(), null, 2);
  const toolEvents = [];
  let usedAnyTools = false;
  let latestMeta = {
    provider: 'oauth',
    requestedModel: model?.trim() || 'auto',
    usedModel: model?.trim() || 'auto',
    fallbackReason: '',
  };

  for (let round = 0; round < OAUTH_TOOL_ROUND_LIMIT; round += 1) {
    const plannerPrompt = [
      'You are Scribe\'s tool router for repository, git, GitHub, and markdown note tasks.',
      'Decide whether the next step should be tool calls or a final grounded answer.',
      'Return strict JSON only with one of these shapes:',
      '{"type":"tool_calls","calls":[{"name":"tool_name","arguments":{}}]}',
      '{"type":"final","message":"grounded answer text"}',
      requireToolUse && !usedAnyTools
        ? 'You must call at least one tool before returning a final answer.'
        : 'Return a final answer only when the available tool results already support it.',
      'Never claim a repository save, note publish, commit, push, sync, or edit succeeded unless the tool result confirms it.',
      'Use `save_note_to_repository` only for markdown notes that should be saved and published immediately.',
      'Use `move_note_in_repository` for markdown note renames or moves that should be published immediately.',
      'Use `delete_note_from_repository` for markdown note deletions that should be published immediately.',
      'If the user asks to edit or create a repository file without an immediate publish, use `write_repository_file` and then `publish_repository_changes` only if the user asked to commit/push/publish.',
      `Available tools:\n${toolCatalog}`,
      `Conversation and tool transcript:\n\n${formatOAuthToolTranscript(messages, toolEvents)}`,
    ].join('\n\n');

    const response = await completeOpenAIOAuthChat({
      session,
      model,
      messages: [{ role: 'user', content: plannerPrompt }],
      signal,
    });

    latestMeta = {
      provider: 'oauth',
      requestedModel: response.requestedModel || latestMeta.requestedModel,
      usedModel: response.model || latestMeta.usedModel,
      fallbackReason: response.fallbackReason || latestMeta.fallbackReason || '',
    };
    onMeta?.(latestMeta);

    const decision = parseOAuthToolPlannerResponse(response.text);
    if (decision.type === 'final') {
      if (requireToolUse && !usedAnyTools) {
        throw new Error('The configured OAuth model did not use the required repository tools.');
      }

      return {
        text: decision.message,
        meta: latestMeta,
      };
    }

    usedAnyTools = true;

    for (const call of decision.calls) {
      const result = await runAgentTool(call.name, JSON.stringify(call.arguments || {}));
      toolEvents.push({ call, result });
    }
  }

  throw new Error('OAuth tool call limit reached before the model produced a final answer.');
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

  client = { provider: 'manual-proxy' };

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

async function chooseSavePath(requestedSaveAction) {
  const explicitPath = normalizeRepoPath(requestedSaveAction?.path);
  if (explicitPath) {
    return resolveNoteSavePath(requestedSaveAction?.content || '', explicitPath);
  }

  const pathHint = normalizeRepoPath(requestedSaveAction?.pathHint);
  const routingPrompt = 'Choose the best repository-relative markdown path for saving this note. Review the repository folders, existing notes, tags, and schema cues. Return JSON only in the form {"path":"Folder/file.md"}.';
  const repoContext = await buildRepoContextForPrompt(routingPrompt, { reason: 'assistant-tool' });
  const selectionPrompt = [
    'Choose the best repository-relative markdown path for this note and return JSON only.',
    'Rules: use an existing top-level folder when appropriate, keep the filename as markdown, prefer lowercase kebab-case based on the note title, and prefer the repo\'s real structure over the path hint when they differ.',
    pathHint ? `Path hint: ${pathHint}` : '',
    repoContext?.contextText ? `Repository context:\n\n${repoContext.contextText}` : 'Repository context is unavailable.',
    'Note markdown:',
    '```markdown',
    requestedSaveAction?.content || '',
    '```',
  ].filter(Boolean).join('\n\n');

  if (clientConfig?.provider === 'oauth') {
    const session = await getOAuthSession();
    const responseText = await quickOpenAIOAuthChat({
      session,
      prompt: selectionPrompt,
      model: clientConfig.model,
    });
    return resolveNoteSavePath(requestedSaveAction?.content || '', extractPathFromSelectionResponse(responseText) || pathHint);
  }

  if (client) {
    const responseText = await collectManualResponseText({
      messages: [
        {
          role: 'system',
          content: 'You choose repository-relative markdown paths for notes. Return JSON only in the form {"path":"Folder/file.md"}.',
        },
        {
          role: 'user',
          content: selectionPrompt,
        },
      ],
      temperature: 0.1,
      maxTokens: 200,
    });
    return resolveNoteSavePath(requestedSaveAction?.content || '', extractPathFromSelectionResponse(responseText) || pathHint);
  }

  return resolveNoteSavePath(requestedSaveAction?.content || '', pathHint);
}

async function runDirectSaveAction(requestedSaveAction, onChunk) {
  const resolvedPath = await chooseSavePath(requestedSaveAction);
  if (!resolvedPath) {
    return {
      ok: false,
      error: 'Could not determine a repository path for this note.',
    };
  }

  const result = await runAgentTool('save_note_to_repository', JSON.stringify({
    ...requestedSaveAction,
    path: resolvedPath,
  }));
  if (result.ok) {
    await logAgentEvent('tools', 'direct_save_fallback_succeeded', {
      path: result.data?.file?.path || resolvedPath,
      commitSha: result.data?.publish?.commitSha || '',
      remoteHeadSha: result.data?.publish?.remoteHeadSha || '',
    });

    const successText = [
      `Saved note to \`${result.data?.file?.path || resolvedPath}\`.`,
      `Committed and pushed to \`origin/main\` with commit \`${result.data?.publish?.commitSha || 'unknown'}\`.`,
      result.data?.publish?.validatedRemote
        ? `Remote verification passed: \`${result.data.publish.remoteHeadSha}\` is now the latest commit on \`origin/main\`.`
        : 'Remote verification status is unavailable.',
    ].join('\n\n');

    onChunk?.(successText, successText);
    return {
      ok: true,
      text: successText,
    };
  }

  await logAgentEvent('tools', 'direct_save_fallback_failed', {
    error: result.error || 'save_note_to_repository failed',
    path: resolvedPath,
  });

  return {
    ok: false,
    error: result.error || 'save_note_to_repository failed',
  };
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
    if (requestedSaveAction) {
      await logAgentEvent('tools', 'direct_save_fallback_requested', {
        path: requestedSaveAction.path,
        commitMessage: requestedSaveAction.commitMessage,
      });

      const saveResult = await runDirectSaveAction(requestedSaveAction, onChunk);
      if (saveResult.ok) {
        return saveResult.text;
      }

      const failureText = `I could not sync the current note because \`save_note_to_repository\` failed: ${saveResult.error}`;
      onChunk?.(failureText, failureText);
      return failureText;
    }

    if (shouldLoadRepoKnowledge || requireToolUse) {
      try {
        const session = await getOAuthSession();
        const toolResponse = await resolveOAuthToolResponse({
          session,
          model: clientConfig.model,
          messages,
          signal,
          requireToolUse,
          onMeta,
        });
        onChunk?.(toolResponse.text, toolResponse.text);
        return toolResponse.text;
      } catch (error) {
        await logAgentEvent('tools', 'oauth_tool_orchestration_failed', {
          error: error?.message || 'OAuth tool orchestration failed.',
          requireToolUse,
          hasRepoKnowledge: shouldLoadRepoKnowledge,
        });
      }
    }

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

  if (!clientConfig?.baseURL) {
    throw new Error('OpenAI client not initialized. Please configure your agent settings.');
  }

  if (requestedSaveAction) {
    await logAgentEvent('tools', 'direct_save_fallback_requested', {
      path: requestedSaveAction.path || requestedSaveAction.pathHint,
      commitMessage: requestedSaveAction.commitMessage,
    });

    const saveResult = await runDirectSaveAction(requestedSaveAction, onChunk);
    if (saveResult.ok) {
      return saveResult.text;
    }

    if (requireToolUse) {
      const failureText = `I could not sync the current note because \`save_note_to_repository\` failed: ${saveResult.error}`;
      onChunk?.(failureText, failureText);
      return failureText;
    }
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

      const saveResult = await runDirectSaveAction(requestedSaveAction, onChunk);
      if (saveResult.ok) {
        return saveResult.text;
      }

      if (requireToolUse) {
        const failureText = `I could not sync the current note because \`save_note_to_repository\` failed: ${saveResult.error}`;
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

  return streamManualChatResponse({
    messages: resolvedMessages,
    model: clientConfig?.model || OPENAI_MODEL,
    temperature: 0.7,
    maxTokens: 4096,
    signal,
    onChunk,
    onMeta: (nextMeta) => {
      usedModel = nextMeta?.usedModel || usedModel;
      onMeta?.({
        provider: 'manual',
        requestedModel,
        usedModel,
        fallbackReason: toolFallbackReason,
      });
    },
  });
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

  if (!clientConfig?.baseURL) {
    return null;
  }

  const response = await apiRequest('/api/ai/manual/chat', {
    method: 'POST',
    body: {
      model: clientConfig?.model || OPENAI_MODEL,
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Respond concisely.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      maxTokens: 100,
      stream: false,
    },
  });

  return response.text || '';
}

export async function generateTitle(userMessage) {
  return normalizeGeneratedTitle(await quickChat(
    `Generate a short, descriptive title (3-6 words, no quotes) for a conversation that starts with: "${userMessage.slice(0, 200)}"`
  ));
}
