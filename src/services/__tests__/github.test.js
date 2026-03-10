import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('../api', () => ({
  apiRequest,
}));

describe('github service', () => {
  beforeEach(() => {
    vi.resetModules();
    apiRequest.mockReset();
  });

  it('detects repo freshness prompts for assistant sync tool', async () => {
    const { shouldRunRepoSyncTool } = await import('../github');

    expect(shouldRunRepoSyncTool('Pull latest repo and summarize commits')).toBe(true);
    expect(shouldRunRepoSyncTool('Keep this response concise.')).toBe(false);
  });

  it('posts to sync endpoint with override values', async () => {
    apiRequest.mockResolvedValueOnce({
      sync: {
        status: 'pulled',
        localPath: 'brimdor/ScribeVault',
      },
    });

    const { syncAssignedRepo } = await import('../github');
    const result = await syncAssignedRepo({
      owner: 'brimdor',
      repo: 'ScribeVault',
      reason: 'manual-sync',
    });

    expect(apiRequest).toHaveBeenCalledWith('/api/github/sync', {
      method: 'POST',
      body: {
        owner: 'brimdor',
        repo: 'ScribeVault',
        reason: 'manual-sync',
      },
    });
    expect(result).toEqual({
      status: 'pulled',
      localPath: 'brimdor/ScribeVault',
    });
  });

  it('runs assistant sync tool only when intent matches', async () => {
    apiRequest.mockResolvedValueOnce({
      sync: {
        status: 'pulled',
        reason: 'assistant-tool',
      },
    });

    const { runRepoSyncToolForPrompt } = await import('../github');
    const skipped = await runRepoSyncToolForPrompt('Write a haiku about spring');
    const synced = await runRepoSyncToolForPrompt('Refresh the latest repository state before answering');

    expect(skipped.status).toBe('skipped');
    expect(synced.status).toBe('pulled');
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('extracts likely file paths from prompt text', async () => {
    const { extractPromptFilePaths } = await import('../github');

    const paths = extractPromptFilePaths('Refresh repo then summarize `README.md` and src/services/openai.js');
    expect(paths).toEqual(['README.md', 'src/services/openai.js']);
  });

  it('builds repository context after sync for repo-aware prompts', async () => {
    apiRequest
      .mockResolvedValueOnce({
        sync: {
          status: 'skipped',
          syncState: 'local-changes',
          message: 'Local changes detected; skipping git pull to avoid merge conflicts.',
          localPath: 'brimdor/ScribeVault',
        },
      })
      .mockResolvedValueOnce({
        tree: {
          dir: '',
          entries: [
            { type: 'file', name: 'README.md', path: 'README.md' },
            { type: 'dir', name: 'src', path: 'src' },
          ],
        },
      })
      .mockResolvedValueOnce({
        file: {
          path: 'README.md',
          content: '# ScribeVault',
          truncated: false,
        },
      });

    const { buildRepoContextForPrompt } = await import('../github');
    const context = await buildRepoContextForPrompt('sync repo and summarize README.md');

    expect(context?.contextText).toContain('Local changes detected');
    expect(context?.contextText).toContain('README.md');
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });
});
