import OpenAI from 'openai';
import { NOTE_SYSTEM_PROMPT, OPENAI_MODEL } from '../utils/constants';

let client = null;
let clientConfig = null;

export function resolveOpenAIConfig(config = {}) {
  if (typeof config === 'string') {
    return {
      apiKey: config.trim() || '1234',
      baseURL: undefined,
      model: OPENAI_MODEL,
    };
  }

  return {
    apiKey: config.apiKey?.trim() || '1234',
    baseURL: config.baseURL?.trim()?.replace(/\/+$/, '') || undefined,
    model: config.model?.trim() || OPENAI_MODEL,
  };
}

export function initOpenAI(config) {
  clientConfig = resolveOpenAIConfig(config);
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

/**
 * Send a chat completion request with streaming
 * @param {Array} messages - Array of { role, content } messages
 * @param {string} schemaContext - Optional schema template to include as context
 * @param {function} onChunk - Callback for each streamed text chunk
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<string>} Full response text
 */
export async function streamChat(messages, schemaContext = null, onChunk, signal = null) {
  if (!client) throw new Error('OpenAI client not initialized. Please configure your agent settings.');

  const systemMessages = [
    { role: 'system', content: NOTE_SYSTEM_PROMPT },
  ];

  if (schemaContext) {
    systemMessages.push({
      role: 'system',
      content: `The user has selected the following note schema. Use this template structure when generating notes:\n\n${schemaContext}`,
    });
  }

  const stream = await client.chat.completions.create({
    model: clientConfig?.model || OPENAI_MODEL,
    messages: [...systemMessages, ...messages],
    stream: true,
    temperature: 0.7,
    max_tokens: 4096,
  }, { signal });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullText += delta;
      onChunk?.(delta, fullText);
    }
  }

  return fullText;
}

/**
 * Non-streaming chat for short operations (title generation, etc.)
 */
export async function quickChat(prompt) {
  if (!client) return null;

  const response = await client.chat.completions.create({
    model: clientConfig?.model || OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Respond concisely.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 100,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

/**
 * Generate a conversation title from the first user message
 */
export async function generateTitle(userMessage) {
  return quickChat(
    `Generate a short, descriptive title (3-6 words, no quotes) for a conversation that starts with: "${userMessage.slice(0, 200)}"`
  );
}
