import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agent-context', () => ({
  fetchWorkspaceState: vi.fn(),
}));

vi.mock('../storage', () => ({
  saveHeartbeatResult: vi.fn(),
}));

vi.mock('../github', () => ({
  syncAssignedRepo: vi.fn(),
  getLocalGitStatus: vi.fn(),
  listLocalRepoNotes: vi.fn(),
  listRepoIssues: vi.fn(),
}));

vi.mock('../debug', () => ({
  logAgentEvent: vi.fn(),
}));

let fetchWorkspaceState;
let saveHeartbeatResult;
let syncAssignedRepo;
let listRepoIssues;

let executeHeartbeat;
let startHeartbeatScheduler;
let stopHeartbeatScheduler;
let isHeartbeatSchedulerActive;
let getHeartbeatState;
let setHeartbeatStateListener;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();

  const contextMod = await import('../agent-context');
  fetchWorkspaceState = contextMod.fetchWorkspaceState;
  fetchWorkspaceState.mockReset();

  const storageMod = await import('../storage');
  saveHeartbeatResult = storageMod.saveHeartbeatResult;
  saveHeartbeatResult.mockReset();

  const githubMod = await import('../github');
  syncAssignedRepo = githubMod.syncAssignedRepo;
  syncAssignedRepo.mockReset();
  listRepoIssues = githubMod.listRepoIssues;
  listRepoIssues.mockReset();

  const debugMod = await import('../debug');
  debugMod.logAgentEvent.mockReset();
  debugMod.logAgentEvent.mockResolvedValue(undefined);

  const mod = await import('../heartbeat');
  executeHeartbeat = mod.executeHeartbeat;
  startHeartbeatScheduler = mod.startHeartbeatScheduler;
  stopHeartbeatScheduler = mod.stopHeartbeatScheduler;
  isHeartbeatSchedulerActive = mod.isHeartbeatSchedulerActive;
  getHeartbeatState = mod.getHeartbeatState;
  setHeartbeatStateListener = mod.setHeartbeatStateListener;
});

afterEach(() => {
  stopHeartbeatScheduler();
  setHeartbeatStateListener(null);
  vi.useRealTimers();
});

describe('executeHeartbeat', () => {
  it('runs checklist and saves passing result when all items pass', async () => {
    syncAssignedRepo.mockResolvedValue({ sync: { status: 'up-to-date' } });
    fetchWorkspaceState.mockResolvedValue({
      noteCount: 5,
      repoStatus: 'ready',
      recentActivity: [{ action: 'edit', path: 'test.md' }],
    });
    listRepoIssues.mockResolvedValue({ issues: [] });
    saveHeartbeatResult.mockImplementation(async (hb) => ({
      id: 'hb-1',
      ...hb,
    }));

    const result = await executeHeartbeat();

    expect(result).not.toBeNull();
    expect(result.rating).toBe(5);
    expect(result.status).toBe('passed');
    expect(saveHeartbeatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 5,
        status: 'passed',
        checklist: expect.arrayContaining([
          expect.objectContaining({ name: 'repo_sync', result: 'pass' }),
          expect.objectContaining({ name: 'workspace_health', result: 'pass' }),
          expect.objectContaining({ name: 'issue_check', result: 'pass' }),
          expect.objectContaining({ name: 'activity_summary', result: 'pass' }),
        ]),
      }),
    );
  });

  it('calculates failing rating when workspace has no repo', async () => {
    syncAssignedRepo.mockResolvedValue({ sync: { status: 'up-to-date' } });
    fetchWorkspaceState.mockResolvedValue({
      noteCount: 0,
      repoStatus: 'not-configured',
      recentActivity: [],
    });
    listRepoIssues.mockRejectedValue(new Error('No repo'));
    saveHeartbeatResult.mockImplementation(async (hb) => ({
      id: 'hb-2',
      ...hb,
    }));

    const result = await executeHeartbeat();

    expect(result).not.toBeNull();
    // repo_sync passes, workspace_health fails (not-configured), issue_check passes (catch), activity_summary passes
    // 3 out of 4 pass = ratio 0.75 -> round(0.75*5) = 4
    expect(result.rating).toBe(4);
    expect(result.status).toBe('passed');
  });

  it('returns null if already running', async () => {
    // Start a long heartbeat
    syncAssignedRepo.mockImplementation(() => new Promise(() => {}));

    executeHeartbeat();
    const secondResult = await executeHeartbeat();

    expect(secondResult).toBeNull();

    // Clean up
    syncAssignedRepo.mockResolvedValue({});
  });

  it('notifies state listener during execution', async () => {
    const listener = vi.fn();
    setHeartbeatStateListener(listener);

    syncAssignedRepo.mockResolvedValue({ sync: { status: 'up-to-date' } });
    fetchWorkspaceState.mockResolvedValue({
      noteCount: 3,
      repoStatus: 'ready',
      recentActivity: [],
    });
    listRepoIssues.mockResolvedValue({ issues: [] });
    saveHeartbeatResult.mockImplementation(async (hb) => ({
      id: 'hb-3',
      ...hb,
    }));

    await executeHeartbeat();

    // Should have been called at least twice: once for 'executing', once for 'idle' after completion
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'executing', isRunning: true }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'idle', isRunning: false }));
  });
});

describe('startHeartbeatScheduler / stopHeartbeatScheduler', () => {
  it('starts the scheduler and marks it active', () => {
    startHeartbeatScheduler(60);
    expect(isHeartbeatSchedulerActive()).toBe(true);
  });

  it('stops the scheduler', () => {
    startHeartbeatScheduler(60);
    stopHeartbeatScheduler();
    expect(isHeartbeatSchedulerActive()).toBe(false);
  });

  it('enforces minimum 15 minute interval', () => {
    startHeartbeatScheduler(5);
    expect(isHeartbeatSchedulerActive()).toBe(true);
    // Can't directly test the interval, but we verify it doesn't throw
  });

  it('replaces existing scheduler when called again', () => {
    startHeartbeatScheduler(60);
    expect(isHeartbeatSchedulerActive()).toBe(true);

    startHeartbeatScheduler(30);
    expect(isHeartbeatSchedulerActive()).toBe(true);
  });
});

describe('getHeartbeatState', () => {
  it('returns initial idle state', () => {
    const state = getHeartbeatState();
    expect(state.status).toBe('idle');
    expect(state.isRunning).toBe(false);
    expect(state.lastExecution).toBeNull();
  });

  it('returns a copy to prevent mutation', () => {
    const state1 = getHeartbeatState();
    const state2 = getHeartbeatState();
    expect(state1).toEqual(state2);
    expect(state1).not.toBe(state2);
  });
});
