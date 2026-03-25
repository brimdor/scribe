import { apiRequest } from './api';
import { getAgentToolCatalog } from './agent-tools';
import { getSetting } from './storage';

const AGENT_PURPOSE = [
  'You are Scribe, an AI-powered platform manager for note-taking with GitHub storage.',
  'You manage the entire platform, not just notes — including repository state, workspace health, and user workflows.',
  'You have full awareness of the user\'s workspace: their notes, repository status, tags, directory structure, and recent activity.',
  'You proactively help users organize, find, and maintain their knowledge base.',
  'When performing heartbeat maintenance, you follow a defined checklist and report results with quantifiable ratings.',
].join(' ');

export async function fetchWorkspaceState() {
  try {
    const response = await apiRequest('/api/agent/workspace-state');
    return response;
  } catch {
    return {
      noteCount: 0,
      repoStatus: 'not-configured',
      recentActivity: [],
      tagDistribution: {},
      directoryBreakdown: {},
      lastSyncAt: null,
      assignedRepo: null,
    };
  }
}

export async function fetchAgentPreferences() {
  try {
    const verbosity = await getSetting('agentVerbosity');
    const autoPublish = await getSetting('agentAutoPublish');

    return {
      verbosity: verbosity || 'detailed',
      autoPublish: autoPublish || 'ask',
    };
  } catch {
    return {
      verbosity: 'detailed',
      autoPublish: 'ask',
    };
  }
}

export function buildToolInventory() {
  const catalog = getAgentToolCatalog();
  return catalog.map(({ name, category, description }) => ({
    name,
    category,
    description,
  }));
}

export async function buildAgentContext() {
  const [workspace, preferences] = await Promise.all([
    fetchWorkspaceState(),
    fetchAgentPreferences(),
  ]);

  const tools = buildToolInventory();

  return {
    purpose: AGENT_PURPOSE,
    tools,
    workspace,
    preferences,
  };
}

export function formatAgentContextForPrompt(context) {
  if (!context) {
    return '';
  }

  const sections = [];

  sections.push(`## Platform Identity\n${context.purpose}`);

  if (context.workspace) {
    const ws = context.workspace;
    const workspaceLines = [
      '## Current Workspace State',
      `- Assigned repository: ${ws.assignedRepo || 'not configured'}`,
      `- Repository status: ${ws.repoStatus || 'unknown'}`,
      `- Total notes: ${ws.noteCount || 0}`,
    ];

    if (ws.lastSyncAt) {
      workspaceLines.push(`- Last sync: ${new Date(ws.lastSyncAt).toISOString()}`);
    }

    if (ws.recentActivity?.length) {
      workspaceLines.push('- Recent activity:');
      for (const activity of ws.recentActivity.slice(0, 5)) {
        workspaceLines.push(`  - ${activity.action}: ${activity.path}`);
      }
    }

    if (ws.tagDistribution && Object.keys(ws.tagDistribution).length) {
      const topTags = Object.entries(ws.tagDistribution)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([tag, count]) => `${tag}(${count})`)
        .join(', ');
      workspaceLines.push(`- Top tags: ${topTags}`);
    }

    if (ws.directoryBreakdown && Object.keys(ws.directoryBreakdown).length) {
      const dirs = Object.entries(ws.directoryBreakdown)
        .sort(([, a], [, b]) => b - a)
        .map(([dir, count]) => `${dir}(${count})`)
        .join(', ');
      workspaceLines.push(`- Directory breakdown: ${dirs}`);
    }

    sections.push(workspaceLines.join('\n'));
  }

  if (context.tools?.length) {
    const toolList = context.tools
      .map((t) => `- ${t.name} [${t.category}]: ${t.description}`)
      .join('\n');
    sections.push(`## Available Tools\n${toolList}`);
  }

  if (context.preferences) {
    const prefLines = [
      '## User Preferences',
      `- Verbosity: ${context.preferences.verbosity}`,
      `- Auto-publish: ${context.preferences.autoPublish}`,
    ];
    sections.push(prefLines.join('\n'));
  }

  return sections.join('\n\n');
}
