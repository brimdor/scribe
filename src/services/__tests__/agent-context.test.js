import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../agent-tools', () => ({
  getAgentToolCatalog: vi.fn(),
}));

vi.mock('../storage', () => ({
  getSetting: vi.fn(),
}));

let apiRequest;
let getAgentToolCatalog;
let getSetting;

let fetchWorkspaceState;
let fetchAgentPreferences;
let buildToolInventory;
let buildAgentContext;
let formatAgentContextForPrompt;

beforeEach(async () => {
  vi.resetModules();

  const apiMod = await import('../api');
  apiRequest = apiMod.apiRequest;
  apiRequest.mockReset();

  const toolsMod = await import('../agent-tools');
  getAgentToolCatalog = toolsMod.getAgentToolCatalog;
  getAgentToolCatalog.mockReset();

  const storageMod = await import('../storage');
  getSetting = storageMod.getSetting;
  getSetting.mockReset();

  const mod = await import('../agent-context');
  fetchWorkspaceState = mod.fetchWorkspaceState;
  fetchAgentPreferences = mod.fetchAgentPreferences;
  buildToolInventory = mod.buildToolInventory;
  buildAgentContext = mod.buildAgentContext;
  formatAgentContextForPrompt = mod.formatAgentContextForPrompt;
});

describe('fetchWorkspaceState', () => {
  it('returns workspace data from API', async () => {
    const mockData = {
      noteCount: 12,
      repoStatus: 'ready',
      recentActivity: [],
      tagDistribution: { journal: 3, work: 2 },
      directoryBreakdown: { 'notes/': 10 },
      lastSyncAt: Date.now(),
      assignedRepo: 'user/repo',
    };

    apiRequest.mockResolvedValue(mockData);

    const result = await fetchWorkspaceState();
    expect(result).toEqual(mockData);
    expect(apiRequest).toHaveBeenCalledWith('/api/agent/workspace-state');
  });

  it('returns fallback when API fails', async () => {
    apiRequest.mockRejectedValue(new Error('Network error'));

    const result = await fetchWorkspaceState();
    expect(result.noteCount).toBe(0);
    expect(result.repoStatus).toBe('not-configured');
    expect(result.recentActivity).toEqual([]);
    expect(result.assignedRepo).toBeNull();
  });
});

describe('fetchAgentPreferences', () => {
  it('returns stored preferences', async () => {
    getSetting.mockImplementation(async (key) => {
      if (key === 'agentVerbosity') return 'concise';
      if (key === 'agentAutoPublish') return 'auto';
      return null;
    });

    const result = await fetchAgentPreferences();
    expect(result.verbosity).toBe('concise');
    expect(result.autoPublish).toBe('auto');
  });

  it('returns defaults when settings are not stored', async () => {
    getSetting.mockResolvedValue(null);

    const result = await fetchAgentPreferences();
    expect(result.verbosity).toBe('detailed');
    expect(result.autoPublish).toBe('ask');
  });
});

describe('buildToolInventory', () => {
  it('maps tool catalog to name/category/description', () => {
    getAgentToolCatalog.mockReturnValue([
      { name: 'lookup_note', category: 'Notes', description: 'Look up a note', someExtraField: true },
      { name: 'save_note', category: 'Notes', description: 'Save a note', parameters: {} },
    ]);

    const result = buildToolInventory();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'lookup_note', category: 'Notes', description: 'Look up a note' });
    expect(result[1]).toEqual({ name: 'save_note', category: 'Notes', description: 'Save a note' });
    // Extra fields should be stripped
    expect(result[0].someExtraField).toBeUndefined();
    expect(result[1].parameters).toBeUndefined();
  });
});

describe('buildAgentContext', () => {
  it('assembles full context from workspace, preferences, and tools', async () => {
    apiRequest.mockResolvedValue({
      noteCount: 5,
      repoStatus: 'ready',
      recentActivity: [],
      tagDistribution: {},
      directoryBreakdown: {},
      lastSyncAt: null,
      assignedRepo: 'user/repo',
    });

    getSetting.mockResolvedValue(null);

    getAgentToolCatalog.mockReturnValue([
      { name: 'test_tool', category: 'Test', description: 'A test tool' },
    ]);

    const context = await buildAgentContext();
    expect(context.purpose).toContain('Scribe');
    expect(context.workspace.noteCount).toBe(5);
    expect(context.preferences.verbosity).toBe('detailed');
    expect(context.tools).toHaveLength(1);
    expect(context.tools[0].name).toBe('test_tool');
  });
});

describe('formatAgentContextForPrompt', () => {
  it('returns empty string for null context', () => {
    expect(formatAgentContextForPrompt(null)).toBe('');
  });

  it('formats all sections', () => {
    const context = {
      purpose: 'Test agent purpose.',
      workspace: {
        assignedRepo: 'user/repo',
        repoStatus: 'ready',
        noteCount: 10,
        lastSyncAt: 1710000000000,
        recentActivity: [
          { action: 'edit', path: 'notes/test.md' },
        ],
        tagDistribution: { journal: 5, work: 3 },
        directoryBreakdown: { 'notes/': 8, 'drafts/': 2 },
      },
      tools: [
        { name: 'lookup_note', category: 'Notes', description: 'Look up a note' },
      ],
      preferences: {
        verbosity: 'detailed',
        autoPublish: 'ask',
      },
    };

    const prompt = formatAgentContextForPrompt(context);

    expect(prompt).toContain('## Platform Identity');
    expect(prompt).toContain('Test agent purpose.');
    expect(prompt).toContain('## Current Workspace State');
    expect(prompt).toContain('user/repo');
    expect(prompt).toContain('Total notes: 10');
    expect(prompt).toContain('Last sync:');
    expect(prompt).toContain('edit: notes/test.md');
    expect(prompt).toContain('journal(5)');
    expect(prompt).toContain('notes/(8)');
    expect(prompt).toContain('## Available Tools');
    expect(prompt).toContain('lookup_note [Notes]');
    expect(prompt).toContain('## User Preferences');
    expect(prompt).toContain('Verbosity: detailed');
    expect(prompt).toContain('Auto-publish: ask');
  });

  it('omits optional sections when data is missing', () => {
    const context = {
      purpose: 'Minimal test.',
      workspace: {
        assignedRepo: null,
        repoStatus: 'not-configured',
        noteCount: 0,
      },
      tools: [],
      preferences: null,
    };

    const prompt = formatAgentContextForPrompt(context);
    expect(prompt).toContain('## Platform Identity');
    expect(prompt).toContain('## Current Workspace State');
    expect(prompt).not.toContain('## Available Tools');
    expect(prompt).not.toContain('## User Preferences');
  });
});
