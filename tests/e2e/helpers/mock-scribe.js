function createUser(login = 'brimdor') {
  return {
    login,
    name: 'Brimdor',
    avatarUrl: '',
  };
}

function createResponseBody(content, model = 'gpt-4o') {
  return {
    id: 'chatcmpl-scribe',
    object: 'chat.completion',
    created: 1,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
  };
}

function createSseBody(content, model = 'gpt-4o') {
  const chunk = {
    id: 'chatcmpl-scribe',
    object: 'chat.completion.chunk',
    created: 1,
    model,
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content,
        },
        finish_reason: null,
      },
    ],
  };

  const doneChunk = {
    id: 'chatcmpl-scribe',
    object: 'chat.completion.chunk',
    created: 1,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: 'stop',
      },
    ],
  };

  return [
    `data: ${JSON.stringify(chunk)}`,
    '',
    `data: ${JSON.stringify(doneChunk)}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
}

function createBackendSseBody({ text, requestedModel = 'gpt-4o', usedModel = requestedModel, fallbackReason = '' }) {
  return [
    'event: meta',
    `data: ${JSON.stringify({ requestedModel, usedModel, fallbackReason })}`,
    '',
    'event: chunk',
    `data: ${JSON.stringify({ delta: text })}`,
    '',
    'event: done',
    `data: ${JSON.stringify({ text, requestedModel, model: usedModel, fallbackReason })}`,
    '',
  ].join('\n');
}

function createCodexSseBody(content, model = 'gpt-5.4') {
  return [
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: content, model })}`,
    '',
    `data: ${JSON.stringify({ type: 'response.completed', response: { output_text: content, model } })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
}

function json(route, status, body) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function empty(route, status = 204) {
  return route.fulfill({
    status,
    body: '',
  });
}

function getMessagesForThread(state, threadId) {
  return state.messages
    .filter((message) => message.threadId === threadId)
    .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
}

function buildRepoEntries(state) {
  const topLevel = new Map();

  for (const filePath of state.repoFiles.keys()) {
    const segments = filePath.split('/').filter(Boolean);
    if (!segments.length) {
      continue;
    }

    if (segments.length === 1) {
      topLevel.set(filePath, {
        type: 'file',
        name: segments[0],
        path: segments[0],
      });
      continue;
    }

    const dirName = segments[0];
    topLevel.set(dirName, {
      type: 'dir',
      name: dirName,
      path: dirName,
    });
  }

  return Array.from(topLevel.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function buildNotes(state) {
  return Array.from(state.repoFiles.entries())
    .filter(([filePath]) => filePath.toLowerCase().endsWith('.md'))
    .map(([filePath, content]) => ({
      path: filePath,
      title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || filePath.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled',
      tags: filePath.includes('Inbox') ? ['project'] : ['research'],
    }));
}

function buildAppSettings(state) {
  return {
    environmentName: state.settings.get('environmentName') || '',
    githubOwner: state.settings.get('githubOwner') || '',
    githubRepo: state.settings.get('githubRepo') || '',
    openaiConnectionMethod: state.settings.get('openaiConnectionMethod') === 'oauth' ? 'oauth' : 'manual',
    agentBaseUrl: (state.settings.get('agentBaseUrl') || '').replace(/\/+$/, ''),
    agentApiKey: '',
    agentApiKeyConfigured: Boolean(state.settings.get('agentApiKey')),
    agentModel: state.settings.get('agentModel') || '',
    heartbeatEnabled: state.settings.get('heartbeatEnabled') ?? false,
    heartbeatIntervalMinutes: state.settings.get('heartbeatIntervalMinutes') ?? 60,
    agentVerbosity: state.settings.get('agentVerbosity') ?? 'detailed',
    agentAutoPublish: state.settings.get('agentAutoPublish') ?? 'ask',
  };
}

function buildBootstrapPayload(state) {
  return {
    user: state.user,
    selectedRepo: state.settings.get('selectedRepo') || null,
    settings: buildAppSettings(state),
    openAIOAuthSession: state.settings.get('openaiOAuthSession') || null,
    openAIOAuthPendingFlow: state.settings.get('openaiOAuthPendingFlow') || null,
  };
}

function getLatestMessageContent(messages = []) {
  const latest = Array.isArray(messages) ? messages[messages.length - 1] : null;
  return String(latest?.content || '');
}

function resolveManualChatText(messages = []) {
  const latestMessage = getLatestMessageContent(messages);

  if (latestMessage.includes('Generate a short, descriptive title')) {
    return 'Project Kickoff Plan';
  }

  if (latestMessage.includes('Choose the best repository-relative markdown path for this note')) {
    return '{"path":"Inbox/project-kickoff-plan.md"}';
  }

  return [
    '# Project Kickoff Plan',
    '',
    '- Owner: OpenAI',
    '- Due: 2026-03-15',
    '- Goal: align note tooling and publish flow',
    '',
    'This kickoff note tracks the initial owners, milestones, and immediate actions for the work.',
  ].join('\n');
}

export function createMockState({ authenticated = false, oauth = false } = {}) {
  const user = authenticated ? createUser() : null;
  const oauthSession = oauth
    ? {
      status: 'connected',
      accessToken: 'oauth-access-token',
      refreshToken: 'oauth-refresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      accountId: 'acct_123',
      email: 'scribe@example.com',
      lastError: '',
    }
    : null;

  return {
    user,
    settings: new Map([
      ['environmentName', 'Local development'],
      ['githubOwner', 'brimdor'],
      ['githubRepo', 'ScribeVault'],
      ['openaiConnectionMethod', oauth ? 'oauth' : 'manual'],
      ['agentBaseUrl', oauth ? '' : 'http://127.0.0.1:4173/fake-openai/v1'],
      ['agentApiKey', ''],
      ['agentModel', oauth ? 'gpt-5.4' : 'gpt-4o'],
      ['openaiOAuthSession', oauthSession],
      ['openaiOAuthPendingFlow', null],
      ['selectedRepo', null],
      ['theme', null],
      ['heartbeatEnabled', false],
      ['heartbeatIntervalMinutes', 60],
      ['agentVerbosity', 'detailed'],
      ['agentAutoPublish', 'ask'],
    ]),
    threads: [],
    messages: [],
    schemas: [],
    heartbeats: [],
    repoFiles: new Map([
      ['README.md', '# ScribeVault\n\nA mocked vault for browser E2E tests.\n'],
      ['Inbox/existing-note.md', '# Existing Note\n\nStored in the inbox.\n'],
      ['Projects/reference.md', '# Reference\n\n#research\n'],
    ]),
    apiCalls: [],
    noteTagRequests: 0,
    publishCalls: [],
    oauthPlannerCalls: 0,
  };
}

export async function installScribeApiMocks(page, state) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;
    const method = request.method().toUpperCase();
    const body = request.postData() ? JSON.parse(request.postData()) : {};

    state.apiCalls.push(`${method} ${pathname}${url.search}`);

    if (pathname === '/api/auth/session' && method === 'GET') {
      if (!state.user) {
        return json(route, 401, { error: 'Not authenticated.' });
      }
      return json(route, 200, { user: state.user });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      state.user = createUser(String(body.username || '').trim() || 'brimdor');
      return json(route, 200, { user: state.user });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      state.user = null;
      return empty(route);
    }

    if (pathname === '/api/storage/bootstrap' && method === 'GET') {
      if (!state.user) {
        return json(route, 401, { error: 'Not authenticated.' });
      }
      return json(route, 200, buildBootstrapPayload(state));
    }

    if (pathname === '/api/storage/bootstrap' && method === 'PUT') {
      if (!state.user) {
        return json(route, 401, { error: 'Not authenticated.' });
      }

      if (Object.prototype.hasOwnProperty.call(body, 'selectedRepo')) {
        state.settings.set('selectedRepo', body.selectedRepo ?? null);
      }

      if (body.settings) {
        state.settings.set('environmentName', String(body.settings.environmentName || '').trim());
        state.settings.set('githubOwner', String(body.settings.githubOwner || '').trim());
        state.settings.set('githubRepo', String(body.settings.githubRepo || '').trim());
        state.settings.set('openaiConnectionMethod', body.settings.openaiConnectionMethod === 'oauth' ? 'oauth' : 'manual');
        state.settings.set('agentBaseUrl', String(body.settings.agentBaseUrl || '').trim().replace(/\/+$/, ''));
        state.settings.set('agentModel', String(body.settings.agentModel || '').trim());
        state.settings.set('heartbeatEnabled', Boolean(body.settings.heartbeatEnabled));
        state.settings.set('heartbeatIntervalMinutes', Number(body.settings.heartbeatIntervalMinutes) || 60);
        state.settings.set('agentVerbosity', body.settings.agentVerbosity === 'concise' ? 'concise' : 'detailed');
        state.settings.set('agentAutoPublish', ['ask', 'auto', 'never'].includes(body.settings.agentAutoPublish) ? body.settings.agentAutoPublish : 'ask');

        if (body.settings.clearAgentApiKey) {
          state.settings.set('agentApiKey', '');
        } else if (typeof body.settings.agentApiKey === 'string' && body.settings.agentApiKey.trim()) {
          state.settings.set('agentApiKey', body.settings.agentApiKey.trim());
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'openAIOAuthSession')) {
        state.settings.set('openaiOAuthSession', body.openAIOAuthSession ?? null);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'openAIOAuthPendingFlow')) {
        state.settings.set('openaiOAuthPendingFlow', body.openAIOAuthPendingFlow ?? null);
      }

      return json(route, 200, buildBootstrapPayload(state));
    }

    if (pathname.startsWith('/api/storage/settings/')) {
      const key = decodeURIComponent(pathname.replace('/api/storage/settings/', ''));
      if (method === 'GET') {
        return json(route, 200, { value: state.settings.has(key) ? state.settings.get(key) : null });
      }

      if (method === 'PUT') {
        state.settings.set(key, body.value ?? null);
        return empty(route);
      }
    }

    if (pathname === '/api/storage/app-settings' && method === 'GET') {
      return json(route, 200, { settings: buildAppSettings(state) });
    }

    if (pathname === '/api/storage/app-settings' && method === 'PUT') {
      state.settings.set('environmentName', String(body.environmentName || '').trim());
      state.settings.set('githubOwner', String(body.githubOwner || '').trim());
      state.settings.set('githubRepo', String(body.githubRepo || '').trim());
      state.settings.set('openaiConnectionMethod', body.openaiConnectionMethod === 'oauth' ? 'oauth' : 'manual');
      state.settings.set('agentBaseUrl', String(body.agentBaseUrl || '').trim().replace(/\/+$/, ''));
      state.settings.set('agentModel', String(body.agentModel || '').trim());

      if (body.clearAgentApiKey) {
        state.settings.set('agentApiKey', '');
      } else if (typeof body.agentApiKey === 'string' && body.agentApiKey.trim()) {
        state.settings.set('agentApiKey', body.agentApiKey.trim());
      }

      return json(route, 200, { settings: buildAppSettings(state) });
    }

    if (pathname === '/api/storage/threads' && method === 'GET') {
      return json(route, 200, { threads: state.threads });
    }

    if (pathname === '/api/storage/threads' && method === 'POST') {
      state.threads.push(body);
      return json(route, 201, { thread: body });
    }

    if (pathname.startsWith('/api/storage/threads/') && pathname.endsWith('/messages') && method === 'GET') {
      const threadId = decodeURIComponent(pathname.split('/')[4]);
      return json(route, 200, { messages: getMessagesForThread(state, threadId) });
    }

    if (pathname.startsWith('/api/storage/threads/') && method === 'GET') {
      const threadId = decodeURIComponent(pathname.replace('/api/storage/threads/', ''));
      const thread = state.threads.find((entry) => entry.id === threadId) || null;
      if (!thread) {
        return json(route, 404, { error: 'Thread not found.' });
      }
      return json(route, 200, { thread });
    }

    if (pathname.startsWith('/api/storage/threads/') && method === 'PATCH') {
      const threadId = decodeURIComponent(pathname.replace('/api/storage/threads/', ''));
      const index = state.threads.findIndex((entry) => entry.id === threadId);
      if (index < 0) {
        return json(route, 404, { error: 'Thread not found.' });
      }

      state.threads[index] = {
        ...state.threads[index],
        ...body,
        updatedAt: Date.now(),
      };
      return json(route, 200, { thread: state.threads[index] });
    }

    if (pathname.startsWith('/api/storage/threads/') && method === 'DELETE') {
      const threadId = decodeURIComponent(pathname.replace('/api/storage/threads/', ''));
      state.threads = state.threads.filter((entry) => entry.id !== threadId);
      state.messages = state.messages.filter((message) => message.threadId !== threadId);
      return empty(route);
    }

    if (pathname === '/api/storage/messages' && method === 'POST') {
      state.messages.push(body);
      return json(route, 201, { message: body });
    }

    if (pathname.startsWith('/api/storage/messages/') && method === 'PATCH') {
      const messageId = decodeURIComponent(pathname.replace('/api/storage/messages/', ''));
      const index = state.messages.findIndex((entry) => entry.id === messageId);
      if (index < 0) {
        return json(route, 404, { error: 'Message not found.' });
      }

      state.messages[index] = {
        ...state.messages[index],
        ...body,
      };
      return json(route, 200, { message: state.messages[index] });
    }

    if (pathname.startsWith('/api/storage/messages/') && method === 'DELETE') {
      const messageId = decodeURIComponent(pathname.replace('/api/storage/messages/', ''));
      state.messages = state.messages.filter((entry) => entry.id !== messageId);
      return empty(route);
    }

    if (pathname === '/api/storage/schemas' && method === 'GET') {
      return json(route, 200, { schemas: state.schemas });
    }

    if (pathname.startsWith('/api/storage/schemas/') && method === 'PUT') {
      return json(route, 201, { schema: body });
    }

    if (pathname === '/api/github/orgs' && method === 'GET') {
      return json(route, 200, { orgs: [{ login: 'openai' }] });
    }

    if (pathname === '/api/ai/manual/models' && method === 'GET') {
      return json(route, 200, { models: ['gpt-4o', 'gpt-4o-mini'] });
    }

    if (pathname === '/api/ai/manual/chat' && method === 'POST') {
      const text = resolveManualChatText(body.messages || []);
      const requestedModel = String(body.model || 'gpt-4o');

      if (body.stream) {
        return route.fulfill({
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
          },
          body: createBackendSseBody({ text, requestedModel, usedModel: requestedModel }),
        });
      }

      return json(route, 200, {
        text,
        requestedModel,
        model: requestedModel,
        fallbackReason: '',
      });
    }

    if (pathname === '/api/github/repos' && method === 'GET') {
      return json(route, 200, {
        repos: [
          { id: 1, name: 'ScribeVault' },
          { id: 2, name: 'ResearchVault' },
        ],
      });
    }

    if (pathname === '/api/github/sync' && method === 'POST') {
      return json(route, 200, {
        sync: {
          status: 'pulled',
          syncState: 'pulled',
          localPath: 'brimdor/brimdor/ScribeVault',
          message: 'Repository updated successfully.',
        },
      });
    }

    if (pathname === '/api/github/repo/tree' && method === 'GET') {
      return json(route, 200, {
        tree: {
          dir: searchParams.get('dir') || '',
          entries: buildRepoEntries(state),
          truncated: false,
        },
      });
    }

    if (pathname === '/api/github/repo/file' && method === 'GET') {
      const filePath = searchParams.get('path') || '';
      if (!state.repoFiles.has(filePath)) {
        return json(route, 404, { error: `File path does not exist: ${filePath}` });
      }

      const content = state.repoFiles.get(filePath);
      return json(route, 200, {
        file: {
          path: filePath,
          content,
          truncated: false,
          totalBytes: Buffer.byteLength(content, 'utf8'),
          totalLines: content.split(/\r?\n/).length,
        },
      });
    }

    if (pathname === '/api/github/repo/file' && method === 'PUT') {
      const filePath = String(body.path || '').trim();
      const created = !state.repoFiles.has(filePath);
      state.repoFiles.set(filePath, String(body.content || ''));
      return json(route, 200, {
        file: {
          path: filePath,
          created,
          message: created ? 'Repository file created successfully.' : 'Repository file updated successfully.',
        },
      });
    }

    if (pathname === '/api/github/repo/file' && method === 'PATCH') {
      const fromPath = String(body.fromPath || '').trim();
      const toPath = String(body.toPath || '').trim();
      const content = state.repoFiles.get(fromPath);
      state.repoFiles.delete(fromPath);
      state.repoFiles.set(toPath, content || '');
      return json(route, 200, {
        file: {
          fromPath,
          path: toPath,
          overwritten: false,
          message: 'Repository file moved successfully.',
        },
      });
    }

    if (pathname === '/api/github/repo/file' && method === 'DELETE') {
      const filePath = searchParams.get('path') || '';
      state.repoFiles.delete(filePath);
      return json(route, 200, {
        file: {
          path: filePath,
          deleted: true,
          message: 'Repository file deleted successfully.',
        },
      });
    }

    if (pathname === '/api/github/repo/search' && method === 'GET') {
      return json(route, 200, {
        search: {
          results: [],
          truncated: false,
        },
      });
    }

    if (pathname === '/api/github/repo/note-tags' && method === 'GET') {
      state.noteTagRequests += 1;
      return json(route, 200, {
        noteTags: {
          scannedFiles: 2,
          tags: [
            { tag: 'project', count: 2, files: ['Inbox/existing-note.md'] },
            { tag: 'research', count: 1, files: ['Projects/reference.md'] },
          ],
        },
      });
    }

    if (pathname === '/api/github/repo/notes' && method === 'GET') {
      return json(route, 200, {
        notes: {
          notes: buildNotes(state),
        },
      });
    }

    if (pathname === '/api/github/repo/notes/by-tag' && method === 'GET') {
      const tag = searchParams.get('tag') || '';
      return json(route, 200, {
        notes: {
          tag,
          notes: buildNotes(state).filter((note) => note.tags.includes(tag)),
        },
      });
    }

    if (pathname === '/api/github/repo/note/frontmatter' && method === 'GET') {
      const filePath = searchParams.get('path') || '';
      return json(route, 200, {
        note: {
          path: filePath,
          title: 'Existing Note',
          tags: ['project'],
          frontmatter: { title: 'Existing Note' },
        },
      });
    }

    if (pathname === '/api/github/repo/git/status' && method === 'GET') {
      return json(route, 200, { status: { clean: true, entries: [], output: '## main' } });
    }

    if (pathname === '/api/github/repo/git/diff' && method === 'GET') {
      return json(route, 200, { diff: { hasChanges: false, output: '' } });
    }

    if (pathname === '/api/github/repo/git/log' && method === 'GET') {
      return json(route, 200, { log: { entries: [] } });
    }

    if (pathname === '/api/github/issues' && method === 'GET') {
      return json(route, 200, { issues: [] });
    }

    if (pathname === '/api/github/pulls' && method === 'GET') {
      return json(route, 200, { pulls: [] });
    }

    if (pathname === '/api/storage/heartbeats' && method === 'GET') {
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);
      const slice = state.heartbeats.slice(offset, offset + limit);
      return json(route, 200, { heartbeats: slice, total: state.heartbeats.length });
    }

    if (pathname === '/api/storage/heartbeats' && method === 'POST') {
      if (!body.startedAt || !body.completedAt) {
        return json(route, 400, { error: 'startedAt and completedAt are required.' });
      }
      if (!Array.isArray(body.checklist)) {
        return json(route, 400, { error: 'checklist array is required.' });
      }
      if (typeof body.rating !== 'number' || body.rating < 0 || body.rating > 5) {
        return json(route, 400, { error: 'rating must be a number between 0 and 5.' });
      }
      const heartbeat = {
        id: `hb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...body,
      };
      state.heartbeats.unshift(heartbeat);
      return json(route, 201, { heartbeat });
    }

    if (pathname === '/api/agent/workspace-state' && method === 'GET') {
      return json(route, 200, {
        noteCount: state.repoFiles.size,
        repoStatus: 'synced',
        recentActivity: [],
        tagDistribution: { project: 1, research: 1 },
        directoryBreakdown: { Inbox: 1, Projects: 1 },
        lastSyncAt: null,
        assignedRepo: `${state.settings.get('githubOwner')}/${state.settings.get('githubRepo')}`,
      });
    }

    if (pathname === '/api/github/publish' && method === 'POST') {
      const publish = {
        status: 'published',
        publishState: 'published',
        branch: 'main',
        commitSha: 'abc123',
        remoteHeadSha: 'abc123',
        validatedRemote: true,
        stagedFiles: body.filePaths || [],
        message: 'Published mocked repository changes.',
      };
      state.publishCalls.push({
        ...body,
        publish,
      });
      return json(route, 200, { publish });
    }

    return json(route, 404, { error: `Unhandled mocked route: ${method} ${pathname}` });
  });
}

export async function installManualProviderMock(page) {
  await page.route('**/fake-openai/v1/chat/completions', async (route) => {
    const request = route.request();
    const payload = request.postData() ? JSON.parse(request.postData()) : {};
    const latestMessage = payload.messages?.[payload.messages.length - 1]?.content || '';

    if (latestMessage.includes('Generate a short, descriptive title')) {
      return json(route, 200, createResponseBody('Project Kickoff Plan'));
    }

    if (latestMessage.includes('Choose the best repository-relative markdown path for this note')) {
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        },
        body: createSseBody('{"path":"Inbox/project-kickoff-plan.md"}'),
      });
    }

    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: createSseBody([
        '# Project Kickoff Plan',
        '',
        '- Owner: OpenAI',
        '- Due: 2026-03-15',
        '- Goal: align note tooling and publish flow',
        '',
        'This kickoff note tracks the initial owners, milestones, and immediate actions for the work.',
      ].join('\n')),
    });
  });
}

export async function installOAuthProviderMock(page, state) {
  await page.route('https://chatgpt.com/backend-api/models?**', async (route) => {
    return json(route, 200, {
      models: [
        { slug: 'gpt-5.4' },
        { slug: 'gpt-5' },
      ],
    });
  });

  await page.route('https://chatgpt.com/backend-api/codex/responses', async (route) => {
    const request = route.request();
    const payload = request.postData() ? JSON.parse(request.postData()) : {};
    const latestInputText = payload.input?.[payload.input.length - 1]?.content?.[0]?.text || '';

    if (latestInputText.includes('Generate a short, descriptive title')) {
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        },
        body: createCodexSseBody('Note Tags Overview'),
      });
    }

    if (latestInputText.includes('Choose the best repository-relative markdown path for this note')) {
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        },
        body: createCodexSseBody('{"path":"Inbox/oauth-publish-note.md"}'),
      });
    }

    state.oauthPlannerCalls += 1;

    const outputText = state.oauthPlannerCalls === 1
      ? JSON.stringify({
        type: 'tool_calls',
        calls: [
          {
            name: 'list_note_tags',
            arguments: {},
          },
        ],
      })
      : JSON.stringify({
        type: 'final',
        message: 'You currently use #project and #research.',
      });

    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: createCodexSseBody(outputText),
    });
  });
}
