import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteNoteFromRepoAndPublish = vi.fn();
const getLocalGitDiff = vi.fn();
const getLocalGitLog = vi.fn();
const getLocalGitStatus = vi.fn();
const findLocalRepoNotesByTag = vi.fn();
const listLocalRepoTree = vi.fn();
const listLocalRepoNoteTags = vi.fn();
const listLocalRepoNotes = vi.fn();
const moveNoteInRepoAndPublish = vi.fn();
const publishRepoChanges = vi.fn();
const listRepoIssues = vi.fn();
const listRepoPullRequests = vi.fn();
const readLocalRepoNoteFrontmatter = vi.fn();
const readLocalRepoFile = vi.fn();
const saveNoteToRepoAndPublish = vi.fn();
const searchLocalRepoFiles = vi.fn();
const syncAssignedRepo = vi.fn();
const writeLocalRepoFile = vi.fn();

vi.mock('../github', () => ({
  deleteNoteFromRepoAndPublish,
  getLocalGitDiff,
  getLocalGitLog,
  getLocalGitStatus,
  findLocalRepoNotesByTag,
  listLocalRepoTree,
  listLocalRepoNoteTags,
  listLocalRepoNotes,
  moveNoteInRepoAndPublish,
  publishRepoChanges,
  listRepoIssues,
  listRepoPullRequests,
  readLocalRepoNoteFrontmatter,
  readLocalRepoFile,
  saveNoteToRepoAndPublish,
  searchLocalRepoFiles,
  syncAssignedRepo,
  writeLocalRepoFile,
}));

describe('agent tools service', () => {
  beforeEach(() => {
    vi.resetModules();
    deleteNoteFromRepoAndPublish.mockReset();
    getLocalGitDiff.mockReset();
    getLocalGitLog.mockReset();
    getLocalGitStatus.mockReset();
    findLocalRepoNotesByTag.mockReset();
    listLocalRepoTree.mockReset();
    listLocalRepoNoteTags.mockReset();
    listLocalRepoNotes.mockReset();
    moveNoteInRepoAndPublish.mockReset();
    publishRepoChanges.mockReset();
    listRepoIssues.mockReset();
    listRepoPullRequests.mockReset();
    readLocalRepoNoteFrontmatter.mockReset();
    readLocalRepoFile.mockReset();
    saveNoteToRepoAndPublish.mockReset();
    searchLocalRepoFiles.mockReset();
    syncAssignedRepo.mockReset();
    writeLocalRepoFile.mockReset();
  });

  it('exposes a grouped reusable tool catalog', async () => {
    const { getAgentToolCatalog, getManualToolDefinitions } = await import('../agent-tools');

    const catalog = getAgentToolCatalog();
    const toolNames = catalog.map((tool) => tool.name);

    expect(toolNames).toContain('read_repository_file');
    expect(toolNames).toContain('list_note_tags');
    expect(toolNames).toContain('list_notes');
    expect(toolNames).toContain('find_notes_by_tag');
    expect(toolNames).toContain('read_note_frontmatter');
    expect(toolNames).toContain('publish_repository_changes');
    expect(toolNames).toContain('save_note_to_repository');
    expect(toolNames).toContain('move_note_in_repository');
    expect(toolNames).toContain('delete_note_from_repository');
    expect(toolNames).toContain('get_git_status');
    expect(toolNames).toContain('list_github_pull_requests');
    expect(getManualToolDefinitions()).toHaveLength(catalog.length);
  });

  it('executes registered tool helpers with parsed JSON arguments', async () => {
    writeLocalRepoFile.mockResolvedValueOnce({ path: 'notes/todo.md', created: true });

    const { runAgentTool } = await import('../agent-tools');
    const result = await runAgentTool('write_repository_file', JSON.stringify({
      path: 'notes/todo.md',
      content: 'hello',
    }));

    expect(writeLocalRepoFile).toHaveBeenCalledWith({
      owner: undefined,
      repo: undefined,
      filePath: 'notes/todo.md',
      content: 'hello',
      createDirectories: true,
    });
    expect(result).toEqual({
      ok: true,
      toolName: 'write_repository_file',
      data: { path: 'notes/todo.md', created: true },
    });
  });

  it('resolves manual tool calls into assistant and tool messages', async () => {
    getLocalGitStatus.mockResolvedValueOnce({ clean: true, output: '## main' });
    const create = vi.fn()
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'tool-1',
              function: {
                name: 'get_git_status',
                arguments: '{}',
              },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Final answer',
          },
        }],
      });

    const { resolveManualToolMessages } = await import('../agent-tools');
    const messages = await resolveManualToolMessages({
      client: {
        chat: {
          completions: { create },
        },
      },
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'What changed?' }],
      signal: null,
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].tools).toHaveLength(18);
    expect(create.mock.calls[0][0].tool_choice).toBe('auto');
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant' }),
      expect.objectContaining({ role: 'tool', tool_call_id: 'tool-1' }),
    ]));
    expect(messages[messages.length - 1]).toEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'tool-1',
    }));
  });

  it('can require tool usage on the first orchestration round', async () => {
    const create = vi.fn().mockResolvedValueOnce({
      choices: [{
        message: {
          content: 'Done',
          tool_calls: [{
            id: 'tool-1',
            function: {
              name: 'list_note_tags',
              arguments: '{}',
            },
          }],
        },
      }],
    }).mockResolvedValueOnce({
      choices: [{ message: { content: 'Final' } }],
    });
    listLocalRepoNoteTags.mockResolvedValueOnce({ tags: [{ tag: 'project', count: 1 }] });

    const { resolveManualToolMessages } = await import('../agent-tools');
    await resolveManualToolMessages({
      client: { chat: { completions: { create } } },
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'What tags do I use?' }],
      signal: null,
      requireToolUse: true,
    });

    expect(create.mock.calls[0][0].tool_choice).toBe('required');
    expect(create.mock.calls[1][0].tool_choice).toBe('auto');
  });

  it('fails when required tool usage is ignored by the model', async () => {
    const create = vi.fn().mockResolvedValueOnce({
      choices: [{
        message: {
          content: 'I saved it for you.',
          tool_calls: [],
        },
      }],
    });

    const { resolveManualToolMessages } = await import('../agent-tools');

    await expect(resolveManualToolMessages({
      client: { chat: { completions: { create } } },
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Publish this note' }],
      signal: null,
      requireToolUse: true,
    })).rejects.toThrow(/did not use the required repository tools/i);
  });

  it('executes save note tool with publish step', async () => {
    saveNoteToRepoAndPublish.mockResolvedValueOnce({
      file: { path: 'Projects/Scribe.md' },
      publish: { status: 'published' },
    });

    const { runAgentTool } = await import('../agent-tools');
    const result = await runAgentTool('save_note_to_repository', JSON.stringify({
      path: 'Projects/Scribe.md',
      content: '# Scribe',
      commitMessage: 'sync notes from Scribe',
    }));

    expect(saveNoteToRepoAndPublish).toHaveBeenCalledWith({
      owner: undefined,
      repo: undefined,
      filePath: 'Projects/Scribe.md',
      content: '# Scribe',
      commitMessage: 'sync notes from Scribe',
      createDirectories: true,
    });
    expect(result.ok).toBe(true);
  });

  it('executes note move and delete tools with publish steps', async () => {
    moveNoteInRepoAndPublish.mockResolvedValueOnce({
      file: { fromPath: 'Inbox/rough.md', path: 'Inbox/final.md' },
      publish: { status: 'published' },
    });
    deleteNoteFromRepoAndPublish.mockResolvedValueOnce({
      file: { path: 'Inbox/final.md', deleted: true },
      publish: { status: 'published' },
    });

    const { runAgentTool } = await import('../agent-tools');
    const moveResult = await runAgentTool('move_note_in_repository', JSON.stringify({
      fromPath: 'Inbox/rough.md',
      toPath: 'Inbox/final.md',
      commitMessage: 'rename note',
    }));
    const deleteResult = await runAgentTool('delete_note_from_repository', JSON.stringify({
      path: 'Inbox/final.md',
      commitMessage: 'delete note',
    }));

    expect(moveNoteInRepoAndPublish).toHaveBeenCalledWith({
      owner: undefined,
      repo: undefined,
      fromPath: 'Inbox/rough.md',
      toPath: 'Inbox/final.md',
      commitMessage: 'rename note',
      createDirectories: true,
    });
    expect(deleteNoteFromRepoAndPublish).toHaveBeenCalledWith({
      owner: undefined,
      repo: undefined,
      filePath: 'Inbox/final.md',
      commitMessage: 'delete note',
    });
    expect(moveResult.ok).toBe(true);
    expect(deleteResult.ok).toBe(true);
  });
});
