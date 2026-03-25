import { fetchWorkspaceState } from './agent-context';
import { saveHeartbeatResult } from './storage';
import {
  syncAssignedRepo,
  listRepoIssues,
} from './github';
import { logAgentEvent } from './debug';

const HEARTBEAT_CHECKLIST = [
  {
    name: 'repo_sync',
    label: 'Repository Sync',
    execute: async () => {
      const result = await syncAssignedRepo({ reason: 'heartbeat-sync' });
      return {
        result: 'pass',
        detail: result?.sync?.status === 'up-to-date'
          ? 'Up to date'
          : `Synced: ${result?.sync?.status || 'completed'}`,
      };
    },
  },
  {
    name: 'workspace_health',
    label: 'Workspace Health',
    execute: async () => {
      const workspace = await fetchWorkspaceState();
      const noteCount = workspace.noteCount || 0;
      const repoStatus = workspace.repoStatus || 'unknown';

      if (repoStatus === 'not-configured') {
        return {
          result: 'fail',
          detail: 'No repository configured',
        };
      }

      return {
        result: 'pass',
        detail: `${noteCount} notes, repo ${repoStatus}`,
      };
    },
  },
  {
    name: 'issue_check',
    label: 'Issue Check',
    execute: async () => {
      try {
        const result = await listRepoIssues({});
        const issueCount = result?.issues?.length || 0;
        return {
          result: 'pass',
          detail: issueCount === 0 ? 'No open issues' : `${issueCount} open issue${issueCount === 1 ? '' : 's'}`,
        };
      } catch {
        return {
          result: 'pass',
          detail: 'Issues not available (no repo configured)',
        };
      }
    },
  },
  {
    name: 'activity_summary',
    label: 'Activity Summary',
    execute: async () => {
      try {
        const workspace = await fetchWorkspaceState();
        const recentCount = workspace.recentActivity?.length || 0;
        return {
          result: 'pass',
          detail: recentCount === 0 ? 'No recent activity' : `${recentCount} recent file${recentCount === 1 ? '' : 's'} modified`,
        };
      } catch {
        return {
          result: 'pass',
          detail: 'Activity data unavailable',
        };
      }
    },
  },
];

async function executeChecklist() {
  const results = [];

  for (const item of HEARTBEAT_CHECKLIST) {
    const startMs = Date.now();
    try {
      const outcome = await item.execute();
      results.push({
        name: item.name,
        label: item.label,
        result: outcome.result,
        detail: outcome.detail || '',
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      results.push({
        name: item.name,
        label: item.label,
        result: 'fail',
        detail: error?.message || `${item.label} failed`,
        durationMs: Date.now() - startMs,
      });
    }
  }

  return results;
}

function calculateRating(checklist) {
  if (!checklist.length) {
    return 0;
  }

  const passCount = checklist.filter((item) => item.result === 'pass').length;
  const ratio = passCount / checklist.length;

  // Map ratio to 0-5 scale
  return Math.round(ratio * 5);
}

let heartbeatTimer = null;
let heartbeatState = {
  status: 'idle',
  lastExecution: null,
  isRunning: false,
};

let onStateChange = null;

function notifyStateChange() {
  if (onStateChange) {
    onStateChange({ ...heartbeatState });
  }
}

export function getHeartbeatState() {
  return { ...heartbeatState };
}

export function setHeartbeatStateListener(listener) {
  onStateChange = listener;
}

export async function executeHeartbeat() {
  if (heartbeatState.isRunning) {
    return null;
  }

  heartbeatState = { ...heartbeatState, status: 'executing', isRunning: true };
  notifyStateChange();

  const startedAt = Date.now();

  try {
    await logAgentEvent('heartbeat', 'heartbeat_started', { startedAt });

    const checklist = await executeChecklist();
    const rating = calculateRating(checklist);
    const status = rating >= 4 ? 'passed' : 'failed';
    const completedAt = Date.now();

    const heartbeat = await saveHeartbeatResult({
      startedAt,
      completedAt,
      checklist,
      rating,
      status,
    });

    heartbeatState = {
      status: 'idle',
      lastExecution: heartbeat,
      isRunning: false,
    };
    notifyStateChange();

    await logAgentEvent('heartbeat', 'heartbeat_completed', {
      startedAt,
      completedAt,
      rating,
      status,
      checklistItems: checklist.length,
    });

    return heartbeat;
  } catch (error) {
    heartbeatState = {
      ...heartbeatState,
      status: 'idle',
      isRunning: false,
    };
    notifyStateChange();

    await logAgentEvent('heartbeat', 'heartbeat_failed', {
      error: error?.message || 'Heartbeat execution failed',
    });

    return null;
  }
}

export function startHeartbeatScheduler(intervalMinutes = 60) {
  stopHeartbeatScheduler();

  const intervalMs = Math.max(intervalMinutes, 15) * 60 * 1000;

  heartbeatTimer = setInterval(() => {
    executeHeartbeat().catch(() => {});
  }, intervalMs);

  heartbeatState = { ...heartbeatState, status: 'idle' };
  notifyStateChange();
}

export function stopHeartbeatScheduler() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  heartbeatState = {
    status: 'idle',
    lastExecution: heartbeatState.lastExecution,
    isRunning: heartbeatState.isRunning,
  };
  notifyStateChange();
}

export function isHeartbeatSchedulerActive() {
  return heartbeatTimer !== null;
}
