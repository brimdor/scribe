import { getSetting } from './storage-store.js';

const DEFAULT_MODEL = 'gpt-4';
const FALLBACK_API_KEY = '1234';

function readSetting(userId, key) {
  const value = getSetting(userId, key);
  return typeof value === 'string' ? value.trim() : '';
}

function createConfig(userId) {
  const baseURL = readSetting(userId, 'agentBaseUrl').replace(/\/+$/, '');
  if (!baseURL) {
    throw new Error('Agent base URL is required for manual provider mode.');
  }

  return {
    baseURL,
    apiKey: readSetting(userId, 'agentApiKey') || FALLBACK_API_KEY,
    model: readSetting(userId, 'agentModel') || DEFAULT_MODEL,
  };
}

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function parseJsonError(response) {
  try {
    const payload = await response.json();
    return payload?.error?.message || payload?.error || payload?.message || `Manual provider request failed with status ${response.status}.`;
  } catch {
    const text = await response.text();
    return text || `Manual provider request failed with status ${response.status}.`;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(await parseJsonError(response));
  }
  return response.json();
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message === 'object')
    .map((message) => ({
      role: message.role === 'system' || message.role === 'assistant' ? message.role : 'user',
      content: typeof message.content === 'string' ? message.content : '',
    }));
}

function extractDeltaContent(delta) {
  if (typeof delta?.content === 'string') {
    return delta.content;
  }

  if (Array.isArray(delta?.content)) {
    return delta.content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }

  return '';
}

function parseSseEventBlock(block = '') {
  const lines = String(block).split('\n');
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

  return {
    event,
    data: dataLines.join('\n'),
  };
}

export async function listManualModels(userId) {
  const { baseURL, apiKey } = createConfig(userId);
  const response = await fetchJson(`${baseURL}/models`, {
    headers: buildHeaders(apiKey),
  });

  return (response.data || [])
    .map((model) => String(model?.id || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export async function completeManualChat(userId, {
  messages,
  model,
  temperature = 0.7,
  maxTokens = 4096,
  signal,
} = {}) {
  const { baseURL, apiKey, model: storedModel } = createConfig(userId);
  const requestedModel = String(model || '').trim() || storedModel || DEFAULT_MODEL;
  const response = await fetchJson(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model: requestedModel,
      messages: normalizeMessages(messages),
      temperature,
      max_tokens: maxTokens,
      store: false,
    }),
    signal,
  });

  return {
    text: response.choices?.[0]?.message?.content?.trim() || '',
    requestedModel,
    model: String(response.model || requestedModel).trim() || requestedModel,
    fallbackReason: '',
  };
}

export async function streamManualChat(userId, {
  messages,
  model,
  temperature = 0.7,
  maxTokens = 4096,
  signal,
  onMeta,
  onChunk,
} = {}) {
  const { baseURL, apiKey, model: storedModel } = createConfig(userId);
  const requestedModel = String(model || '').trim() || storedModel || DEFAULT_MODEL;
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model: requestedModel,
      messages: normalizeMessages(messages),
      stream: true,
      temperature,
      max_tokens: maxTokens,
      store: false,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response));
  }

  if (!response.body) {
    throw new Error('Manual provider response body is unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let usedModel = requestedModel;

  onMeta?.({
    requestedModel,
    usedModel,
    fallbackReason: '',
  });

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);
      if (block) {
        const message = parseSseEventBlock(block);
        if (message.data === '[DONE]') {
          boundaryIndex = buffer.indexOf('\n\n');
          continue;
        }

        let payload = null;
        try {
          payload = JSON.parse(message.data);
        } catch {
          payload = null;
        }

        const chunkModel = String(payload?.model || '').trim();
        if (chunkModel && chunkModel !== usedModel) {
          usedModel = chunkModel;
          onMeta?.({
            requestedModel,
            usedModel,
            fallbackReason: '',
          });
        }

        const delta = extractDeltaContent(payload?.choices?.[0]?.delta);
        if (delta) {
          fullText += delta;
          onChunk?.({ delta, fullText });
        }
      }

      boundaryIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      break;
    }
  }

  return {
    text: fullText,
    requestedModel,
    model: usedModel,
    fallbackReason: '',
  };
}
