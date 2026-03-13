import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSetting = vi.fn();

vi.mock('../storage-store.js', () => ({
  getSetting,
}));

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    body: null,
  };
}

function streamResponse(status, events) {
  const encoder = new TextEncoder();
  const chunks = events.map((event) => encoder.encode(event));
  let index = 0;

  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ error: 'stream response has no json body' }),
    text: async () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }
            const value = chunks[index];
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
  };
}

describe('manual openai service', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    getSetting.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    getSetting.mockImplementation((_userId, key) => {
      if (key === 'agentBaseUrl') return 'http://localhost:11434/v1/';
      if (key === 'agentApiKey') return '';
      if (key === 'agentModel') return 'gpt-4o';
      return '';
    });
  });

  it('lists models using server-stored manual provider settings', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      data: [{ id: 'z-model' }, { id: 'a-model' }, { id: ' ' }],
    }));

    const { listManualModels } = await import('../manual-openai.js');
    await expect(listManualModels('user-1')).resolves.toEqual(['a-model', 'z-model']);

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/v1/models', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer 1234',
      },
    });
  });

  it('completes chat using the stored model and trimmed api key', async () => {
    getSetting.mockImplementation((_userId, key) => {
      if (key === 'agentBaseUrl') return 'http://localhost:11434/v1/';
      if (key === 'agentApiKey') return ' secret-key ';
      if (key === 'agentModel') return ' custom-model ';
      return '';
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      model: 'custom-model-response',
      choices: [{ message: { content: 'Hello from backend' } }],
    }));

    const { completeManualChat } = await import('../manual-openai.js');
    await expect(completeManualChat('user-1', {
      messages: [{ role: 'user', content: 'Hi' }],
    })).resolves.toEqual({
      text: 'Hello from backend',
      requestedModel: 'custom-model',
      model: 'custom-model-response',
      fallbackReason: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-key',
      },
      body: JSON.stringify({
        model: 'custom-model',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.7,
        max_tokens: 4096,
        store: false,
      }),
      signal: undefined,
    });
  });

  it('streams chat chunks and emits model metadata updates', async () => {
    fetchMock.mockResolvedValueOnce(streamResponse(200, [
      'data: {"model":"gpt-4o-mini","choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"model":"gpt-4o-mini","choices":[{"delta":{"content":"world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]));

    const onMeta = vi.fn();
    const onChunk = vi.fn();
    const { streamManualChat } = await import('../manual-openai.js');
    await expect(streamManualChat('user-1', {
      messages: [{ role: 'user', content: 'Hi' }],
      onMeta,
      onChunk,
    })).resolves.toEqual({
      text: 'Hello world',
      requestedModel: 'gpt-4o',
      model: 'gpt-4o-mini',
      fallbackReason: '',
    });

    expect(onMeta).toHaveBeenCalledWith({
      requestedModel: 'gpt-4o',
      usedModel: 'gpt-4o',
      fallbackReason: '',
    });
    expect(onMeta).toHaveBeenCalledWith({
      requestedModel: 'gpt-4o',
      usedModel: 'gpt-4o-mini',
      fallbackReason: '',
    });
    expect(onChunk).toHaveBeenCalledWith({ delta: 'Hello ', fullText: 'Hello ' });
    expect(onChunk).toHaveBeenCalledWith({ delta: 'world', fullText: 'Hello world' });
  });
});
