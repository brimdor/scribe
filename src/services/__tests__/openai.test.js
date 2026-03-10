import { beforeEach, describe, expect, it, vi } from 'vitest';

const openAIConstructor = vi.fn(() => ({ chat: { completions: { create: vi.fn() } } }));

vi.mock('openai', () => ({
  default: openAIConstructor,
}));

describe('openai service', () => {
  beforeEach(() => {
    openAIConstructor.mockClear();
  });

  it('uses fallback api key when the provided key is blank', async () => {
    const { initOpenAI, resolveOpenAIConfig } = await import('../openai');

    expect(resolveOpenAIConfig({ apiKey: '   ', baseURL: 'http://localhost:11434/v1/' })).toEqual({
      apiKey: '1234',
      baseURL: 'http://localhost:11434/v1',
      model: 'gpt-4',
    });

    initOpenAI({ apiKey: '', baseURL: 'http://localhost:11434/v1/' });

    expect(openAIConstructor).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: '1234',
      baseURL: 'http://localhost:11434/v1',
      dangerouslyAllowBrowser: true,
    }));
  });
});
