import {
  deleteNoteFromRepoAndPublish,
  findLocalRepoNotesByTag,
  getLocalGitDiff,
  getLocalGitLog,
  getLocalGitStatus,
  listLocalRepoNotes,
  listLocalRepoTree,
  listLocalRepoNoteTags,
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
} from './github';
import { logAgentEvent } from './debug';

const TOOL_ROUND_LIMIT = 6;

function serializeToolResult(result) {
  return JSON.stringify(result, null, 2);
}

function parseToolArguments(rawArguments) {
  if (!rawArguments) {
    return {};
  }

  if (typeof rawArguments === 'object') {
    return rawArguments;
  }

  try {
    return JSON.parse(rawArguments);
  } catch {
    throw new Error('Tool arguments must be valid JSON.');
  }
}

async function executeTool(definition, rawArguments) {
  const args = parseToolArguments(rawArguments);
  await logAgentEvent('tools', 'tool_execution_started', {
    toolName: definition.name,
    argumentKeys: Object.keys(args),
  });

  try {
    const data = await definition.execute(args);
    await logAgentEvent('tools', 'tool_execution_succeeded', {
      toolName: definition.name,
      resultKeys: data && typeof data === 'object' ? Object.keys(data) : [],
    });
    return {
      ok: true,
      toolName: definition.name,
      data,
    };
  } catch (error) {
    await logAgentEvent('tools', 'tool_execution_failed', {
      toolName: definition.name,
      error: error?.message || `${definition.name} failed.`,
    });
    return {
      ok: false,
      toolName: definition.name,
      error: error?.message || `${definition.name} failed.`,
    };
  }
}

const TOOL_DEFINITIONS = [
  {
    name: 'sync_repository',
    category: 'Repository',
    exposure: 'manual-provider',
    description: 'Refresh the local checkout from GitHub by cloning or pulling remote changes. This does not commit or push local edits.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Optional override for the GitHub owner or organization.' },
        repo: { type: 'string', description: 'Optional override for the repository name.' },
        reason: { type: 'string', description: 'Why the sync is being requested.' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, reason = 'agent-tool' } = {}) => syncAssignedRepo({ owner, repo, reason }),
  },
  {
    name: 'publish_repository_changes',
    category: 'Repository',
    exposure: 'manual-provider',
    description: 'Stage selected repository changes, create a commit, and push them to origin/main.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        filePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional repository-relative files to include in the commit. Omitting this stages all local changes.',
        },
        commitMessage: { type: 'string', description: 'Commit message for the publish action.' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, filePaths = [], commitMessage = '' } = {}) => publishRepoChanges({
      owner,
      repo,
      filePaths,
      commitMessage,
      reason: 'agent-publish',
    }),
  },
  {
    name: 'list_repository_tree',
    category: 'Files',
    exposure: 'manual-provider',
    description: 'List files and folders in the assigned local repository checkout.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        dir: { type: 'string', description: 'Optional repository-relative directory to inspect.' },
        limit: { type: 'integer', description: 'Maximum number of entries to return.' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, dir = '', limit = 120 } = {}) => listLocalRepoTree({ owner, repo, dir, limit }),
  },
  {
    name: 'read_repository_file',
    category: 'Files',
    exposure: 'manual-provider',
    description: 'Read a UTF-8 text file from the assigned repository.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'Repository-relative file path.' },
        maxBytes: { type: 'integer' },
        maxLines: { type: 'integer' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, path, maxBytes, maxLines } = {}) => readLocalRepoFile({ owner, repo, filePath: path, maxBytes, maxLines }),
  },
  {
    name: 'search_repository_files',
    category: 'Files',
    exposure: 'manual-provider',
    description: 'Search text files in the assigned repository for matching content.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        query: { type: 'string', description: 'Case-insensitive text query.' },
        dir: { type: 'string' },
        limit: { type: 'integer' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, query, dir = '', limit = 20 } = {}) => searchLocalRepoFiles({ owner, repo, query, dir, limit }),
  },
  {
    name: 'write_repository_file',
    category: 'Files',
    exposure: 'manual-provider',
    description: 'Create or update a UTF-8 text file inside the assigned repository checkout.',
    parameters: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'Repository-relative file path.' },
        content: { type: 'string', description: 'Full UTF-8 file content to write.' },
        createDirectories: { type: 'boolean', description: 'Create missing parent directories when true.' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, path, content, createDirectories = true } = {}) => writeLocalRepoFile({
      owner,
      repo,
      filePath: path,
      content,
      createDirectories,
    }),
  },
  {
    name: 'save_note_to_repository',
    category: 'Notes',
    exposure: 'manual-provider',
    description: 'Write a markdown note into the selected repository, normalize it to the project note path and filename conventions, and immediately commit and push it to main.',
    parameters: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'Repository-relative markdown note path.' },
        content: { type: 'string', description: 'Complete markdown note content to save.' },
        commitMessage: { type: 'string', description: 'Commit message for the note publish.' },
        createDirectories: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, path, content, commitMessage = '', createDirectories = true } = {}) => saveNoteToRepoAndPublish({
      owner,
      repo,
      filePath: path,
      content,
      commitMessage,
      createDirectories,
    }),
  },
  {
    name: 'move_note_in_repository',
    category: 'Notes',
    exposure: 'manual-provider',
    description: 'Move or rename a markdown note inside the selected repository, normalize the destination to the project note path and filename conventions, and immediately commit and push it to main.',
    parameters: {
      type: 'object',
      required: ['fromPath', 'toPath'],
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        fromPath: { type: 'string', description: 'Current repository-relative markdown note path.' },
        toPath: { type: 'string', description: 'Requested repository-relative markdown note destination.' },
        commitMessage: { type: 'string', description: 'Commit message for the note move.' },
        createDirectories: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, fromPath, toPath, commitMessage = '', createDirectories = true } = {}) => moveNoteInRepoAndPublish({
      owner,
      repo,
      fromPath,
      toPath,
      commitMessage,
      createDirectories,
    }),
  },
  {
    name: 'delete_note_from_repository',
    category: 'Notes',
    exposure: 'manual-provider',
    description: 'Delete a markdown note from the selected repository and immediately commit and push the removal to main.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'Repository-relative markdown note path to delete.' },
        commitMessage: { type: 'string', description: 'Commit message for the note deletion.' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, path, commitMessage = '' } = {}) => deleteNoteFromRepoAndPublish({
      owner,
      repo,
      filePath: path,
      commitMessage,
    }),
  },
  {
    name: 'list_note_tags',
    category: 'Notes',
    exposure: 'manual-provider',
    description: 'Scan markdown notes in the assigned repository and return discovered tags with counts.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo } = {}) => listLocalRepoNoteTags({ owner, repo }),
  },
  {
    name: 'list_notes',
    category: 'Notes',
    exposure: 'manual-provider',
    description: 'List markdown notes in the assigned repository with titles and tags.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        dir: { type: 'string' },
        limit: { type: 'integer' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, dir = '', limit = 20 } = {}) => listLocalRepoNotes({ owner, repo, dir, limit }),
  },
  {
    name: 'find_notes_by_tag',
    category: 'Notes',
    exposure: 'manual-provider',
    description: 'Find markdown notes in the assigned repository that use a given tag.',
    parameters: {
      type: 'object',
      required: ['tag'],
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        tag: { type: 'string', description: 'Tag name without the leading #.' },
        limit: { type: 'integer' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, tag, limit = 20 } = {}) => findLocalRepoNotesByTag({ owner, repo, tag, limit }),
  },
  {
    name: 'read_note_frontmatter',
    category: 'Notes',
    exposure: 'manual-provider',
    description: 'Read note metadata, frontmatter, and tags from a markdown note in the assigned repository.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'Repository-relative markdown note path.' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, path } = {}) => readLocalRepoNoteFrontmatter({ owner, repo, filePath: path }),
  },
  {
    name: 'get_git_status',
    category: 'Git',
    exposure: 'manual-provider',
    description: 'Inspect the local git working tree status for the assigned repository.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo } = {}) => getLocalGitStatus({ owner, repo }),
  },
  {
    name: 'get_git_diff',
    category: 'Git',
    exposure: 'manual-provider',
    description: 'Inspect the local git diff for the assigned repository or a specific file.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'Optional repository-relative file path.' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, path } = {}) => getLocalGitDiff({ owner, repo, filePath: path }),
  },
  {
    name: 'get_git_log',
    category: 'Git',
    exposure: 'manual-provider',
    description: 'Inspect recent local git commit history for the assigned repository.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        limit: { type: 'integer', description: 'Maximum number of commits to return.' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo, limit = 10 } = {}) => getLocalGitLog({ owner, repo, limit }),
  },
  {
    name: 'list_github_issues',
    category: 'GitHub',
    exposure: 'manual-provider',
    description: 'List open GitHub issues for the assigned repository.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo } = {}) => listRepoIssues({ owner, repo }),
  },
  {
    name: 'list_github_pull_requests',
    category: 'GitHub',
    exposure: 'manual-provider',
    description: 'List open GitHub pull requests for the assigned repository.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      additionalProperties: false,
    },
    execute: async ({ owner, repo } = {}) => listRepoPullRequests({ owner, repo }),
  },
];

export function getAgentToolCatalog() {
  return TOOL_DEFINITIONS.map(({ name, category, description, exposure }) => ({
    name,
    category,
    description,
    exposure,
  }));
}

export function getAgentToolPromptCatalog() {
  return TOOL_DEFINITIONS.map(({ name, category, description, parameters }) => ({
    name,
    category,
    description,
    parameters,
  }));
}

export function getAgentToolSystemPrompt() {
  const toolNames = TOOL_DEFINITIONS.map((tool) => tool.name).join(', ');
  return [
    'Treat the selected repository as your knowledge base for notes, markdown files, code, and project context.',
    `Available tools: ${toolNames}.`,
    'You must use the available tools whenever the user asks about current notes, tags, files, repository contents, git state, or GitHub collaboration state.',
    'In Scribe, syncing current notes means saving the markdown file to the selected repository, creating a git commit, and pushing that commit to the remote main branch.',
    'If the user asks to save, sync, publish, commit, or push notes to GitHub, you must use save_note_to_repository or write_repository_file followed by publish_repository_changes.',
    'If the user asks to move, rename, relocate, archive, or delete a note in the repository, you must use move_note_in_repository or delete_note_from_repository so the change is committed and pushed.',
    'save_note_to_repository is for markdown notes only and should keep filenames aligned to the note title format unless a date-based schema applies.',
    'move_note_in_repository and delete_note_from_repository are for markdown notes only.',
    'sync_repository only refreshes local state from GitHub; it does not publish local edits.',
    'Never claim a file was saved, committed, or pushed unless the corresponding tool result confirms success.',
    'Prefer tools over guessing for note tags, note lists, frontmatter, file contents, git status, diffs, commit history, issues, and pull requests.',
    'When editing files, write complete updated content only after inspecting the relevant file first.',
    'If a tool fails, explain the failure briefly and continue with the information that is available.',
  ].join(' ');
}

export function getManualToolDefinitions() {
  return TOOL_DEFINITIONS
    .filter((tool) => tool.exposure === 'manual-provider')
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
}

export async function runAgentTool(name, rawArguments) {
  const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
  if (!definition) {
    return {
      ok: false,
      toolName: name,
      error: `Unknown tool: ${name}`,
    };
  }

  return executeTool(definition, rawArguments);
}

export async function resolveManualToolMessages({ client, model, messages, signal, requireToolUse = false }) {
  const conversation = [...messages];
  const tools = getManualToolDefinitions();
  let usedAnyTools = false;

  for (let round = 0; round < TOOL_ROUND_LIMIT; round += 1) {
    const response = await client.chat.completions.create({
      model,
      messages: conversation,
      tools,
      tool_choice: requireToolUse && round === 0 ? 'required' : 'auto',
      temperature: 0.2,
      max_tokens: 1200,
      stream: false,
      store: false,
    }, { signal });

    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls || [];

    if (!toolCalls.length) {
      if (requireToolUse && !usedAnyTools) {
        throw new Error('The configured model did not use the required repository tools.');
      }

      return conversation;
    }

    usedAnyTools = true;

    conversation.push({
      role: 'assistant',
      content: typeof message?.content === 'string' ? message.content : '',
      tool_calls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments || '{}',
        },
      })),
    });

    for (const toolCall of toolCalls) {
      const result = await runAgentTool(toolCall.function.name, toolCall.function.arguments);
      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: serializeToolResult(result),
      });
    }
  }

  throw new Error('Tool call limit reached before the model produced a final answer.');
}
