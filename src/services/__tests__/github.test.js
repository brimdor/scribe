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
    const { shouldRunRepoSyncTool, shouldUseRepoKnowledgeBase } = await import('../github');

    expect(shouldRunRepoSyncTool('Pull latest repo and summarize commits')).toBe(true);
    expect(shouldRunRepoSyncTool('Keep this response concise.')).toBe(false);
    expect(shouldUseRepoKnowledgeBase('What are my current note tags?')).toBe(true);
  });

  it('treats note mutation prompts as grounded tool tasks', async () => {
    const { shouldRequireToolUsage, shouldUseRepoKnowledgeBase } = await import('../github');

    expect(shouldUseRepoKnowledgeBase('Rename the note in `Inbox/sprint-review.md` and publish it.')).toBe(true);
    expect(shouldRequireToolUsage('Delete this journal note from the repository.')).toBe(true);
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
    expect(apiRequest).toHaveBeenCalledTimes(4);
  });

  it('builds note-tag context for note knowledge-base prompts', async () => {
    apiRequest
      .mockResolvedValueOnce({
        tree: {
          dir: '',
          entries: [
            { type: 'file', name: 'README.md', path: 'README.md' },
          ],
        },
      })
      .mockResolvedValueOnce({
        noteTags: {
          scannedFiles: 2,
          tags: [
            { tag: 'project', count: 2, files: ['Projects/Watchtower.md'] },
            { tag: 'journal', count: 1, files: ['Journal/Journal.md'] },
          ],
        },
      })
      .mockResolvedValueOnce({
        notes: {
          notes: [
            { path: 'Projects/Watchtower.md', title: 'Watchtower', tags: ['project', 'homelab'] },
          ],
        },
      })
      .mockResolvedValueOnce({
        search: {
          results: [
            { path: 'Projects/Watchtower.md', line: 2, preview: 'tags: [project, homelab]' },
          ],
        },
      })
      .mockResolvedValueOnce({
        search: {
          results: [],
        },
      })
      .mockResolvedValueOnce({
        file: {
          path: 'Projects/Watchtower.md',
          content: '---\ntags: [project, homelab]\n---',
          truncated: false,
        },
      });

    const { buildRepoContextForPrompt } = await import('../github');
    const context = await buildRepoContextForPrompt('What are my current note tags?');

    expect(context?.contextText).toContain('Repository note tags');
    expect(context?.contextText).toContain('project (2)');
    expect(context?.contextText).toContain('Projects/Watchtower.md');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/github/repo/note-tags');
  });

  it('calls repository tool endpoints with structured parameters', async () => {
    apiRequest
      .mockResolvedValueOnce({ file: { path: 'notes/todo.md', created: true } })
      .mockResolvedValueOnce({ file: { fromPath: 'notes/todo.md', path: 'archive/todo.md' } })
      .mockResolvedValueOnce({ file: { path: 'archive/todo.md', deleted: true } })
      .mockResolvedValueOnce({ search: { results: [{ path: 'README.md' }] } })
      .mockResolvedValueOnce({ status: { clean: true } })
      .mockResolvedValueOnce({ diff: { hasChanges: false } })
      .mockResolvedValueOnce({ log: { entries: [] } })
      .mockResolvedValueOnce({ publish: { status: 'published', branch: 'main' } })
      .mockResolvedValueOnce({ file: { path: 'Projects/Scribe.md', created: true } })
      .mockResolvedValueOnce({ publish: { status: 'published', branch: 'main', stagedFiles: ['Projects/Scribe.md'] } })
      .mockResolvedValueOnce({ issues: [{ number: 1, title: 'Issue' }] })
      .mockResolvedValueOnce({ pulls: [{ number: 2, title: 'PR' }] })
      .mockResolvedValueOnce({ noteTags: { tags: [{ tag: 'project', count: 1 }] } })
      .mockResolvedValueOnce({ notes: { notes: [{ path: 'Projects/Watchtower.md', title: 'Watchtower' }] } })
      .mockResolvedValueOnce({ notes: { tag: 'project', notes: [{ path: 'Projects/Watchtower.md', title: 'Watchtower' }] } })
      .mockResolvedValueOnce({ note: { path: 'Projects/Watchtower.md', frontmatter: { title: 'Watchtower' } } });

    const {
      deleteLocalRepoFile,
      findLocalRepoNotesByTag,
      getLocalGitDiff,
      getLocalGitLog,
      getLocalGitStatus,
      listLocalRepoNotes,
      listLocalRepoNoteTags,
      publishRepoChanges,
      listRepoIssues,
      listRepoPullRequests,
      moveLocalRepoFile,
      readLocalRepoNoteFrontmatter,
      saveNoteToRepoAndPublish,
      searchLocalRepoFiles,
      writeLocalRepoFile,
    } = await import('../github');

    await writeLocalRepoFile({ filePath: 'notes/todo.md', content: 'hello' });
    await moveLocalRepoFile({ fromPath: 'notes/todo.md', toPath: 'archive/todo.md' });
    await deleteLocalRepoFile({ filePath: 'archive/todo.md' });
    await searchLocalRepoFiles({ query: 'readme', limit: 5 });
    await getLocalGitStatus();
    await getLocalGitDiff({ filePath: 'README.md' });
    await getLocalGitLog({ limit: 5 });
    await publishRepoChanges({ filePaths: ['Projects/Scribe.md'], commitMessage: 'sync notes from Scribe' });
    await saveNoteToRepoAndPublish({ filePath: 'Projects/Scribe.md', content: '# Scribe', commitMessage: 'publish note' });
    await listRepoIssues();
    await listRepoPullRequests();
    await listLocalRepoNoteTags();
    await listLocalRepoNotes({ limit: 10 });
    await findLocalRepoNotesByTag({ tag: 'project', limit: 5 });
    await readLocalRepoNoteFrontmatter({ filePath: 'Projects/Watchtower.md' });

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/github/repo/file', {
      method: 'PUT',
      body: {
        path: 'notes/todo.md',
        content: 'hello',
        createDirectories: true,
      },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/github/repo/file', {
      method: 'PATCH',
      body: {
        fromPath: 'notes/todo.md',
        toPath: 'archive/todo.md',
        createDirectories: true,
      },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(3, '/api/github/repo/file?path=archive%2Ftodo.md', {
      method: 'DELETE',
    });
    expect(apiRequest).toHaveBeenNthCalledWith(4, '/api/github/repo/search?q=readme&limit=5');
    expect(apiRequest).toHaveBeenNthCalledWith(5, '/api/github/repo/git/status');
    expect(apiRequest).toHaveBeenNthCalledWith(6, '/api/github/repo/git/diff?path=README.md');
    expect(apiRequest).toHaveBeenNthCalledWith(7, '/api/github/repo/git/log?limit=5');
    expect(apiRequest).toHaveBeenNthCalledWith(8, '/api/github/publish', {
      method: 'POST',
      body: {
        reason: 'manual-publish',
        filePaths: ['Projects/Scribe.md'],
        commitMessage: 'sync notes from Scribe',
      },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(9, '/api/github/repo/file', {
      method: 'PUT',
      body: {
        path: 'Projects/scribe.md',
        content: '# Scribe',
        createDirectories: true,
      },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(10, '/api/github/publish', {
      method: 'POST',
      body: {
        reason: 'save-note-and-publish',
        filePaths: ['Projects/Scribe.md'],
        commitMessage: 'publish note',
      },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(11, '/api/github/issues');
    expect(apiRequest).toHaveBeenNthCalledWith(12, '/api/github/pulls');
    expect(apiRequest).toHaveBeenNthCalledWith(13, '/api/github/repo/note-tags');
    expect(apiRequest).toHaveBeenNthCalledWith(14, '/api/github/repo/notes?limit=10');
    expect(apiRequest).toHaveBeenNthCalledWith(15, '/api/github/repo/notes/by-tag?tag=project&limit=5');
    expect(apiRequest).toHaveBeenNthCalledWith(16, '/api/github/repo/note/frontmatter?path=Projects%2FWatchtower.md');
  });

  it('remaps note publish paths to existing vault directories', async () => {
    apiRequest
      .mockResolvedValueOnce({
        tree: {
          dir: '',
          entries: [
            { type: 'dir', name: 'Inbox', path: 'Inbox' },
            { type: 'dir', name: 'Journal', path: 'Journal' },
            { type: 'dir', name: 'Projects', path: 'Projects' },
            { type: 'dir', name: 'Resources', path: 'Resources' },
          ],
        },
      })
      .mockResolvedValueOnce({ file: { path: 'Inbox/scribe.md', created: true } })
      .mockResolvedValueOnce({ publish: { status: 'published', branch: 'main', stagedFiles: ['Inbox/scribe.md'] } });

    const { saveNoteToRepoAndPublish } = await import('../github');
    const result = await saveNoteToRepoAndPublish({ filePath: 'Notes/My rough draft.md', content: '# Scribe', commitMessage: 'publish note' });

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/github/repo/tree?limit=200');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/github/repo/file', {
      method: 'PUT',
      body: {
        path: 'Inbox/scribe.md',
        content: '# Scribe',
        createDirectories: true,
      },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(3, '/api/github/publish', {
      method: 'POST',
      body: {
        reason: 'save-note-and-publish',
        filePaths: ['Inbox/scribe.md'],
        commitMessage: 'publish note',
      },
    });
    expect(result.file.path).toBe('Inbox/scribe.md');
  });

  it('rejects non-markdown note publish paths', async () => {
    const { saveNoteToRepoAndPublish } = await import('../github');

    await expect(saveNoteToRepoAndPublish({
      filePath: 'Projects/scribe.txt',
      content: '# Scribe',
      commitMessage: 'publish note',
    })).rejects.toThrow(/markdown files/i);

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('moves a note using canonical markdown naming and publishes the change', async () => {
    apiRequest
      .mockResolvedValueOnce({ file: { path: 'Inbox/sprint-review-notes.md', content: '# Sprint Review Notes\n' } })
      .mockResolvedValueOnce({ tree: { dir: '', entries: [{ type: 'dir', name: 'Inbox', path: 'Inbox' }] } })
      .mockResolvedValueOnce({ file: { fromPath: 'Inbox/rough.md', path: 'Inbox/sprint-review-notes.md' } })
      .mockResolvedValueOnce({ publish: { status: 'published', branch: 'main', stagedFiles: ['Inbox/rough.md', 'Inbox/sprint-review-notes.md'] } });

    const { moveNoteInRepoAndPublish } = await import('../github');
    const result = await moveNoteInRepoAndPublish({
      fromPath: 'Inbox/rough.md',
      toPath: 'Notes/not-final.txt',
      commitMessage: 'rename note',
    });

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/github/repo/file?path=Inbox%2Frough.md&maxBytes=24576&maxLines=180');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/github/repo/tree?limit=200');
    expect(apiRequest).toHaveBeenNthCalledWith(3, '/api/github/repo/file', {
      method: 'PATCH',
      body: {
        fromPath: 'Inbox/rough.md',
        toPath: 'Inbox/sprint-review-notes.md',
        createDirectories: true,
      },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(4, '/api/github/publish', {
      method: 'POST',
      body: {
        reason: 'move-note-and-publish',
        filePaths: ['Inbox/rough.md', 'Inbox/sprint-review-notes.md'],
        commitMessage: 'rename note',
      },
    });
    expect(result.file.path).toBe('Inbox/sprint-review-notes.md');
  });

  it('deletes a markdown note and publishes the removal', async () => {
    apiRequest
      .mockResolvedValueOnce({ file: { path: 'Inbox/old-note.md', deleted: true } })
      .mockResolvedValueOnce({ publish: { status: 'published', branch: 'main', stagedFiles: ['Inbox/old-note.md'] } });

    const { deleteNoteFromRepoAndPublish } = await import('../github');
    const result = await deleteNoteFromRepoAndPublish({
      filePath: 'Inbox/old-note.md',
      commitMessage: 'delete note',
    });

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/github/repo/file?path=Inbox%2Fold-note.md', {
      method: 'DELETE',
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/github/publish', {
      method: 'POST',
      body: {
        reason: 'delete-note-and-publish',
        filePaths: ['Inbox/old-note.md'],
        commitMessage: 'delete note',
      },
    });
    expect(result.file.deleted).toBe(true);
  });

  it('rejects non-markdown note move and delete paths', async () => {
    const { deleteNoteFromRepoAndPublish, moveNoteInRepoAndPublish } = await import('../github');

    await expect(moveNoteInRepoAndPublish({
      fromPath: 'Inbox/rough.txt',
      toPath: 'Inbox/final.md',
    })).rejects.toThrow(/markdown files/i);
    await expect(deleteNoteFromRepoAndPublish({
      filePath: 'Inbox/old-note.txt',
    })).rejects.toThrow(/markdown files/i);

    expect(apiRequest).not.toHaveBeenCalled();
  });
});
