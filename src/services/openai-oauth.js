import { NOTE_SYSTEM_PROMPT, OPENAI_MODEL } from '../utils/constants';

export const OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const OPENAI_OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
export const OPENAI_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
export const OPENAI_OAUTH_DEVICE_CODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';
export const OPENAI_OAUTH_DEVICE_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';
export const OPENAI_OAUTH_DEVICE_VERIFY_URL = 'https://auth.openai.com/codex/device';
export const OPENAI_OAUTH_DEVICE_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback';
export const OPENAI_CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';

const OPENAI_OAUTH_SCOPES = 'openid profile email offline_access';
const OPENAI_OAUTH_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const OPENAI_OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;
const OPENAI_OAUTH_DEVICE_TTL_MS = 15 * 60 * 1000;

function getCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure browser crypto is required for OpenAI sign-in.');
  }

  return globalThis.crypto;
}

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : (() => { throw new Error('Base64 encoding is unavailable in this environment.'); })();

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return typeof atob === 'function'
    ? atob(padded)
    : (() => { throw new Error('Base64 decoding is unavailable in this environment.'); })();
}

function randomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}

async function createCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await getCrypto().subtle.digest('SHA-256', encoded);
  return base64UrlEncode(digest);
}

function getRedirectUri(origin = globalThis.location?.origin) {
  if (!origin) {
    throw new Error('Unable to determine the OpenAI callback origin.');
  }

  return origin;
}

function getReturnPath(pathname = globalThis.location?.pathname, search = globalThis.location?.search, hash = globalThis.location?.hash) {
  return `${pathname || '/'}${search || ''}${hash || ''}`;
}

function parseJwtClaims(token) {
  if (!token || typeof token !== 'string') {
    return undefined;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return undefined;
  }

  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return undefined;
  }
}

function extractAccountIdFromClaims(claims) {
  if (!claims || typeof claims !== 'object') {
    return '';
  }

  return claims.chatgpt_account_id
    || claims['https://api.openai.com/auth']?.chatgpt_account_id
    || claims.organizations?.[0]?.id
    || '';
}

function extractAccountId(payload) {
  return extractAccountIdFromClaims(parseJwtClaims(payload.id_token))
    || extractAccountIdFromClaims(parseJwtClaims(payload.access_token));
}

function extractEmailFromPayload(payload) {
  if (payload.email) {
    return payload.email.trim();
  }

  const idClaims = parseJwtClaims(payload.id_token);
  if (idClaims?.email) {
    return idClaims.email.trim();
  }

  const accessClaims = parseJwtClaims(payload.access_token);
  if (accessClaims?.email) {
    return accessClaims.email.trim();
  }

  return '';
}

async function readErrorMessage(response) {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text);
    return parsed.error?.message || parsed.error_description || parsed.message || text;
  } catch {
    return text || `Request failed with status ${response.status}`;
  }
}

function normalizeSession(payload, currentStatus = 'connected') {
  return {
    status: currentStatus,
    accessToken: payload.access_token?.trim() || '',
    refreshToken: payload.refresh_token?.trim() || '',
    expiresAt: Date.now() + ((payload.expires_in || 0) * 1000),
    accountId: extractAccountId(payload),
    email: extractEmailFromPayload(payload),
    lastError: '',
  };
}

function buildInstructions(schemaContext = null) {
  return schemaContext
    ? `${NOTE_SYSTEM_PROMPT}\n\nThe user selected this note schema. Follow it exactly when producing the answer:\n\n${schemaContext}`
    : NOTE_SYSTEM_PROMPT;
}

function toResponsesInput(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: [{ type: 'input_text', text: message.content }],
  }));
}

function extractOutputText(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (typeof payload.output_text === 'string') {
    return payload.output_text.trim();
  }

  if (typeof payload.response?.output_text === 'string') {
    return payload.response.output_text.trim();
  }

  if (!Array.isArray(payload.output)) {
    return '';
  }

  const chunks = [];
  payload.output.forEach((item) => {
    item?.content?.forEach((content) => {
      if (typeof content?.text === 'string') {
        chunks.push(content.text);
      }
    });
  });

  return chunks.join('').trim();
}

function extractDelta(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
    return payload.delta;
  }

  if (typeof payload.delta === 'string') {
    return payload.delta;
  }

  return '';
}

async function parseEventStream(body, onChunk) {
  if (!body) {
    return '';
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  const processBlock = (block) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');

    if (!data || data === '[DONE]') {
      return false;
    }

    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return false;
    }

    const delta = extractDelta(parsed);
    if (delta) {
      fullText += delta;
      onChunk?.(delta, fullText);
    }

    if (!delta && parsed.type === 'response.completed' && !fullText) {
      fullText = extractOutputText(parsed.response || parsed);
      if (fullText) {
        onChunk?.(fullText, fullText);
      }
    }

    return parsed.type === 'response.completed';
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      if (processBlock(block)) {
        return fullText;
      }
      boundaryIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    processBlock(buffer.trim());
  }

  return fullText;
}

export async function fetchOpenAIModels({ session, signal } = {}) {
  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
  };

  if (session.accountId) {
    headers['ChatGPT-Account-Id'] = session.accountId;
  }

  const response = await fetch('https://chatgpt.com/backend-api/models?history_and_training_disabled=false', {
    method: 'GET',
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = await response.json();

  // ChatGPT backend-api/models returns { models: [{ slug, title, ... }] }
  const models = payload.models || payload.data || [];
  if (!Array.isArray(models)) {
    return [];
  }

  return models
    .map((model) => model.slug || model.id || '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function createCodexResponse({ session, model, messages, schemaContext, signal, stream = true, onChunk }) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
    Authorization: `Bearer ${session.accessToken}`,
    originator: 'scribe',
  };

  if (session.accountId) {
    headers['ChatGPT-Account-Id'] = session.accountId;
  }

  const response = await fetch(OPENAI_CODEX_RESPONSES_URL, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: model || OPENAI_MODEL,
      instructions: buildInstructions(schemaContext),
      input: toResponsesInput(messages),
      stream,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (!stream) {
    const payload = await response.json();
    return extractOutputText(payload);
  }

  return parseEventStream(response.body, onChunk);
}

export function isOpenAIOAuthCallback(search = globalThis.location?.search) {
  const params = new URLSearchParams(search || '');
  return params.has('code') || params.has('error');
}

export function isOpenAIOAuthSessionActive(session) {
  return !!(session?.refreshToken && session?.status === 'connected');
}

export function isOpenAIOAuthSessionExpired(session) {
  return !session?.expiresAt || Date.now() >= (session.expiresAt - OPENAI_OAUTH_REFRESH_BUFFER_MS);
}

export async function createOpenAIOAuthFlow({ origin, returnPath } = {}) {
  const codeVerifier = randomString(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = randomString(32);
  const redirectUri = getRedirectUri(origin);
  const safeReturnPath = returnPath || getReturnPath();

  const params = new URLSearchParams({
    client_id: OPENAI_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: OPENAI_OAUTH_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    response_type: 'code',
    state,
    codex_cli_simplified_flow: 'true',
    id_token_add_organizations: 'true',
    originator: 'scribe',
  });

  return {
    authorizationUrl: `${OPENAI_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
    pendingFlow: {
      codeVerifier,
      state,
      startedAt: Date.now(),
      returnPath: safeReturnPath,
    },
  };
}

export async function createOpenAIDeviceFlow({ returnPath } = {}) {
  const response = await fetch(OPENAI_OAUTH_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: OPENAI_OAUTH_CLIENT_ID }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = await response.json();
  const parsedExpiry = Date.parse(payload.expires_at || '');
  const intervalSeconds = Number.parseInt(payload.interval, 10);
  const deviceAuthId = payload.device_auth_id?.trim() || '';
  const userCode = payload.user_code?.trim() || '';

  if (!deviceAuthId || !userCode) {
    throw new Error('OpenAI did not return a valid device sign-in code.');
  }

  return {
    verificationUrl: OPENAI_OAUTH_DEVICE_VERIFY_URL,
    pendingFlow: {
      type: 'device',
      startedAt: Date.now(),
      returnPath: returnPath || getReturnPath(),
      deviceAuthId,
      userCode,
      verificationUrl: OPENAI_OAUTH_DEVICE_VERIFY_URL,
      intervalMs: Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds * 1000 : 5000,
      expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + OPENAI_OAUTH_DEVICE_TTL_MS,
    },
  };
}

export async function exchangeOpenAIOAuthCode({ code, codeVerifier, redirectUri }) {
  const response = await fetch(OPENAI_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OPENAI_OAUTH_CLIENT_ID,
      code,
      redirect_uri: getRedirectUri(redirectUri),
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return normalizeSession(await response.json());
}

export async function refreshOpenAIOAuthSession(session) {
  const response = await fetch(OPENAI_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OPENAI_OAUTH_CLIENT_ID,
      refresh_token: session.refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = await response.json();
  return {
    ...normalizeSession(payload),
    refreshToken: payload.refresh_token?.trim() || session.refreshToken,
    accountId: extractAccountId(payload) || session.accountId || '',
    email: extractEmailFromPayload(payload) || session.email || '',
  };
}

export function isOpenAIDeviceFlowExpired(pendingFlow) {
  if (!pendingFlow) {
    return true;
  }

  return !pendingFlow.expiresAt || Date.now() >= pendingFlow.expiresAt;
}

export async function pollOpenAIDeviceFlow(pendingFlow) {
  if (!pendingFlow?.deviceAuthId || !pendingFlow?.userCode) {
    throw new Error('The OpenAI sign-in session was not found. Start the connection again.');
  }

  if (isOpenAIDeviceFlowExpired(pendingFlow)) {
    throw new Error('The OpenAI sign-in attempt expired. Start it again.');
  }

  const response = await fetch(OPENAI_OAUTH_DEVICE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_auth_id: pendingFlow.deviceAuthId,
      user_code: pendingFlow.userCode,
    }),
  });

  if (response.status === 403 || response.status === 404) {
    return { status: 'pending' };
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = await response.json();
  if (!payload.authorization_code || !payload.code_verifier) {
    throw new Error('OpenAI did not return a valid device authorization result.');
  }

  const session = await exchangeOpenAIOAuthCode({
    code: payload.authorization_code,
    codeVerifier: payload.code_verifier,
    redirectUri: OPENAI_OAUTH_DEVICE_REDIRECT_URI,
  });

  return { status: 'connected', session };
}

export async function completeOpenAIOAuthCallback({ code, state, pendingFlow, redirectUri }) {
  if (!pendingFlow) {
    throw new Error('The OpenAI sign-in session was not found. Start the connection again.');
  }

  if (!code) {
    throw new Error('OpenAI did not return an authorization code.');
  }

  if (pendingFlow.state !== state) {
    throw new Error('The OpenAI callback could not be validated. Please try again.');
  }

  if (Date.now() - pendingFlow.startedAt > OPENAI_OAUTH_PENDING_TTL_MS) {
    throw new Error('The OpenAI sign-in attempt expired. Please start it again.');
  }

  return exchangeOpenAIOAuthCode({
    code,
    codeVerifier: pendingFlow.codeVerifier,
    redirectUri,
  });
}

export async function getValidOpenAIOAuthSession(session, options = {}) {
  if (!isOpenAIOAuthSessionActive(session)) {
    throw new Error('OpenAI sign-in is not connected.');
  }

  if (!isOpenAIOAuthSessionExpired(session)) {
    return session;
  }

  const refreshed = await refreshOpenAIOAuthSession(session, options);
  options.onRefresh?.(refreshed);
  return refreshed;
}

export async function streamOpenAIOAuthChat({ session, model, messages, schemaContext, signal, onChunk }) {
  return createCodexResponse({
    session,
    model,
    messages,
    schemaContext,
    signal,
    stream: true,
    onChunk,
  });
}

export async function quickOpenAIOAuthChat({ session, prompt, model }) {
  return createCodexResponse({
    session,
    model,
    messages: [{ role: 'user', content: prompt }],
    schemaContext: null,
    stream: false,
  });
}
