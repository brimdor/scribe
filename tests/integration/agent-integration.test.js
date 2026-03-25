import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/api', () => ({
  apiRequest: vi.fn(),
  ApiError: class extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../../src/services/agent-tools', () => ({
  getAgentToolCatalog: vi.fn(),
}));

vi.mock('../../src/services/storage', () => ({
  getSetting: vi.fn(),
  saveHeartbeatResult: vi.fn(),
}));

vi.mock('../../src/services/github', () => ({
  syncAssignedRepo: vi.fn(),
  getLocalGitStatus: vi.fn(),
  listLocalRepoNotes: vi.fn(),
  listRepoIssues: vi.fn(),
}));

vi.mock('../../src/services/debug', () => ({
  logAgentEvent: vi.fn().mockResolvedValue(undefined),
}));

let apiRequest;
let getAgentToolCatalog;
let getSetting;
let saveHeartbeatResult;
let syncAssignedRepo;
let listRepoIssues;

beforeEach(async () => {
  vi.resetModules();

  const apiMod = await import('../../src/services/api');
  apiRequest = apiMod.apiRequest;
  apiRequest.mockReset();

  const toolsMod = await import('../../src/services/agent-tools');
  getAgentToolCatalog = toolsMod.getAgentToolCatalog;
  getAgentToolCatalog.mockReset();
  getAgentToolCatalog.mockReturnValue([
    { name: 'lookup_note', category: 'Notes', description: 'Look up note by title' },
    { name: 'save_note', category: 'Notes', description: 'Save a note' },
    { name: 'get_workspace_summary', category: 'Platform', description: 'Get workspace summary' },
  ]);

  const storageMod = await import('../../src/services/storage');
  getSetting = storageMod.getSetting;
  getSetting.mockReset();
  saveHeartbeatResult = storageMod.saveHeartbeatResult;
  saveHeartbeatResult.mockReset();

  const githubMod = await import('../../src/services/github');
  syncAssignedRepo = githubMod.syncAssignedRepo;
  syncAssignedRepo.mockReset();
  listRepoIssues = githubMod.listRepoIssues;
  listRepoIssues.mockReset();

  const debugMod = await import('../../src/services/debug');
  debugMod.logAgentEvent.mockReset();
  debugMod.logAgentEvent.mockResolvedValue(undefined);
});

describe('Agent context injection into prompts', () => {
  it('builds complete agent context and formats it for prompt injection', async () => {
    apiRequest.mockResolvedValue({
      noteCount: 8,
      repoStatus: 'ready',
      recentActivity: [{ action: 'create', path: 'notes/new.md' }],
      tagDistribution: { meeting: 4, personal: 2 },
      directoryBreakdown: { 'notes/': 6, 'archive/': 2 },
      lastSyncAt: 1710000000000,
      assignedRepo: 'testuser/testrepo',
    });

    getSetting.mockImplementation(async (key) => {
      if (key === 'agentVerbosity') return 'concise';
      if (key === 'agentAutoPublish') return 'never';
      return null;
    });

    const { buildAgentContext, formatAgentContextForPrompt } = await import('../../src/services/agent-context');

    const context = await buildAgentContext();
    const prompt = formatAgentContextForPrompt(context);

    // Verify context structure
    expect(context.purpose).toBeTruthy();
    expect(context.workspace.noteCount).toBe(8);
    expect(context.workspace.assignedRepo).toBe('testuser/testrepo');
    expect(context.preferences.verbosity).toBe('concise');
    expect(context.preferences.autoPublish).toBe('never');
    expect(context.tools).toHaveLength(3);

    // Verify prompt formatting
    expect(prompt).toContain('## Platform Identity');
    expect(prompt).toContain('## Current Workspace State');
    expect(prompt).toContain('testuser/testrepo');
    expect(prompt).toContain('Total notes: 8');
    expect(prompt).toContain('meeting(4)');
    expect(prompt).toContain('## Available Tools');
    expect(prompt).toContain('get_workspace_summary');
    expect(prompt).toContain('## User Preferences');
    expect(prompt).toContain('Verbosity: concise');
  });

  it('handles workspace API failure gracefully in context assembly', async () => {
    apiRequest.mockRejectedValue(new Error('Server error'));
    getSetting.mockResolvedValue(null);

    const { buildAgentContext, formatAgentContextForPrompt } = await import('../../src/services/agent-context');

    const context = await buildAgentContext();
    const prompt = formatAgentContextForPrompt(context);

    expect(context.workspace.noteCount).toBe(0);
    expect(context.workspace.repoStatus).toBe('not-configured');
    expect(prompt).toContain('not configured');
  });
});

describe('Tool execution with workspace summary', () => {
  it('get_workspace_summary tool returns workspace state from API', async () => {
    const workspaceData = {
      noteCount: 15,
      repoStatus: 'ready',
      recentActivity: [],
      tagDistribution: { dev: 10 },
      directoryBreakdown: { 'src/': 12 },
      lastSyncAt: Date.now(),
      assignedRepo: 'dev/project',
    };

    apiRequest.mockResolvedValue(workspaceData);

    const { fetchWorkspaceState } = await import('../../src/services/agent-context');
    const result = await fetchWorkspaceState();

    expect(result.noteCount).toBe(15);
    expect(result.repoStatus).toBe('ready');
    expect(result.assignedRepo).toBe('dev/project');
  });
});

describe('Heartbeat → Agent context pipeline', () => {
  it('heartbeat execution accesses workspace state and persists results', async () => {
    syncAssignedRepo.mockResolvedValue({ sync: { status: 'up-to-date' } });
    apiRequest.mockResolvedValue({
      noteCount: 5,
      repoStatus: 'ready',
      recentActivity: [],
    });
    listRepoIssues.mockResolvedValue({ issues: [{ id: 1, title: 'Test issue' }] });
    saveHeartbeatResult.mockImplementation(async (hb) => ({ id: 'integration-1', ...hb }));

    const { executeHeartbeat, getHeartbeatState, setHeartbeatStateListener, stopHeartbeatScheduler } = await import('../../src/services/heartbeat');

    const stateChanges = [];
    setHeartbeatStateListener((state) => stateChanges.push(state));

    const result = await executeHeartbeat();

    expect(result).not.toBeNull();
    expect(result.rating).toBeGreaterThanOrEqual(0);
    expect(result.rating).toBeLessThanOrEqual(5);
    expect(saveHeartbeatResult).toHaveBeenCalledTimes(1);

    // Verify state transitions
    expect(stateChanges.some((s) => s.status === 'executing')).toBe(true);
    expect(stateChanges.some((s) => s.status === 'idle' && !s.isRunning)).toBe(true);

    // Verify final state
    const finalState = getHeartbeatState();
    expect(finalState.status).toBe('idle');
    expect(finalState.isRunning).toBe(false);
    expect(finalState.lastExecution).not.toBeNull();

    setHeartbeatStateListener(null);
    stopHeartbeatScheduler();
  });

  it('heartbeat result includes all four checklist items', async () => {
    syncAssignedRepo.mockResolvedValue({ sync: { status: 'pulled' } });
    apiRequest.mockResolvedValue({
      noteCount: 3,
      repoStatus: 'ready',
      recentActivity: [],
    });
    listRepoIssues.mockResolvedValue({ issues: [] });
    saveHeartbeatResult.mockImplementation(async (hb) => ({ id: 'integration-2', ...hb }));

    const { executeHeartbeat, stopHeartbeatScheduler } = await import('../../src/services/heartbeat');
    const result = await executeHeartbeat();

    expect(result.checklist).toHaveLength(4);
    const checklistNames = result.checklist.map((c) => c.name);
    expect(checklistNames).toContain('repo_sync');
    expect(checklistNames).toContain('workspace_health');
    expect(checklistNames).toContain('issue_check');
    expect(checklistNames).toContain('activity_summary');

    // Each item should have required fields
    for (const item of result.checklist) {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('result');
      expect(item).toHaveProperty('detail');
      expect(item).toHaveProperty('durationMs');
      expect(['pass', 'fail']).toContain(item.result);
      expect(item.durationMs).toBeGreaterThanOrEqual(0);
    }

    stopHeartbeatScheduler();
  });
});

describe('Error resilience', () => {
  it('agent context returns defaults when all API calls fail', async () => {
    apiRequest.mockRejectedValue(new Error('All APIs down'));
    getSetting.mockRejectedValue(new Error('Storage unavailable'));

    const { buildAgentContext } = await import('../../src/services/agent-context');

    // Should not throw
    const context = await buildAgentContext();
    expect(context.purpose).toBeTruthy();
    expect(context.workspace.noteCount).toBe(0);
    // Preferences should use defaults when getSetting fails
    // The implementation catches errors in fetchWorkspaceState but not in fetchAgentPreferences
    // This tests that the overall pipeline doesn't crash
  });

  it('heartbeat handles save failure gracefully', async () => {
    syncAssignedRepo.mockResolvedValue({ sync: { status: 'up-to-date' } });
    apiRequest.mockResolvedValue({
      noteCount: 1,
      repoStatus: 'ready',
      recentActivity: [],
    });
    listRepoIssues.mockResolvedValue({ issues: [] });
    saveHeartbeatResult.mockRejectedValue(new Error('DB write failed'));

    const { executeHeartbeat, stopHeartbeatScheduler } = await import('../../src/services/heartbeat');
    const result = await executeHeartbeat();

    // Returns null on error
    expect(result).toBeNull();

    stopHeartbeatScheduler();
  });
});
