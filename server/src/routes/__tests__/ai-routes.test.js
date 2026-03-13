import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listManualModels = vi.fn();
const completeManualChat = vi.fn();
const streamManualChat = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.auth = { userId: 'user-1' };
    next();
  },
}));

vi.mock('../../services/manual-openai.js', () => ({
  listManualModels,
  completeManualChat,
  streamManualChat,
}));

async function createTestServer() {
  const { default: aiRoutes } = await import('../ai-routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

describe('ai routes', () => {
  let currentServer = null;
  let baseUrl = '';

  beforeEach(async () => {
    vi.resetModules();
    listManualModels.mockReset();
    completeManualChat.mockReset();
    streamManualChat.mockReset();
    const serverInfo = await createTestServer();
    currentServer = serverInfo.server;
    baseUrl = serverInfo.baseUrl;
  });

  afterEach(async () => {
    if (currentServer) {
      await new Promise((resolve, reject) => {
        currentServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    currentServer = null;
    baseUrl = '';
  });

  it('returns manual model listings for the authenticated user', async () => {
    listManualModels.mockResolvedValue(['gpt-4o', 'gpt-4o-mini']);

    const response = await fetch(`${baseUrl}/api/ai/manual/models`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ models: ['gpt-4o', 'gpt-4o-mini'] });
    expect(listManualModels).toHaveBeenCalledWith('user-1');
  });

  it('returns manual chat completions as json for non-stream requests', async () => {
    completeManualChat.mockResolvedValue({
      text: 'Hello from backend',
      requestedModel: 'gpt-4o',
      model: 'gpt-4o-mini',
      fallbackReason: '',
    });

    const response = await fetch(`${baseUrl}/api/ai/manual/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-4o',
        stream: false,
        temperature: 0.2,
        maxTokens: 128,
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.text).toBe('Hello from backend');
    expect(completeManualChat).toHaveBeenCalledWith('user-1', {
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 128,
    });
  });

  it('streams manual chat responses over sse', async () => {
    streamManualChat.mockImplementation(async (_userId, { onMeta, onChunk }) => {
      onMeta({ requestedModel: 'gpt-4o', usedModel: 'gpt-4o-mini', fallbackReason: '' });
      onChunk({ delta: 'Hello ' });
      onChunk({ delta: 'world' });
      return {
        text: 'Hello world',
        requestedModel: 'gpt-4o',
        model: 'gpt-4o-mini',
        fallbackReason: '',
      };
    });

    const response = await fetch(`${baseUrl}/api/ai/manual/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-4o',
        stream: true,
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(text).toContain('event: meta');
    expect(text).toContain('event: chunk');
    expect(text).toContain('event: done');
    expect(text).toContain('Hello world');
  });

  it('maps manual provider configuration errors to a 400 response', async () => {
    completeManualChat.mockRejectedValue(new Error('Agent base URL is required for manual provider mode.'));

    const response = await fetch(`${baseUrl}/api/ai/manual/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: 'Agent base URL is required for manual provider mode.' });
  });

  it('closes the sse response when manual streaming fails after headers are sent', async () => {
    streamManualChat.mockImplementation(async (_userId, { onMeta }) => {
      onMeta({ requestedModel: 'gpt-4o', usedModel: 'gpt-4o', fallbackReason: '' });
      throw new Error('Upstream manual provider failed.');
    });

    const response = await fetch(`${baseUrl}/api/ai/manual/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-4o',
        stream: true,
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(text).toContain('event: meta');
    expect(text).toContain('event: error');
    expect(text).toContain('Upstream manual provider failed.');
  });
});
