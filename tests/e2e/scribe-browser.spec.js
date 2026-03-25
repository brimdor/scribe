import { expect, test } from '@playwright/test';
import {
  createMockState,
  installManualProviderMock,
  installOAuthProviderMock,
  installScribeApiMocks,
} from './helpers/mock-scribe.js';

async function login(page) {
  await page.goto('/');
  await page.getByLabel('GitHub Username').fill('brimdor');
  await page.getByLabel('GitHub Personal Access Token').fill('ghp_test_token');
  await page.getByRole('button', { name: /Connect with GitHub/i }).click();
  await expect(page.getByRole('button', { name: /New Chat/i })).toBeVisible();
}

test('manual browser flow can generate and publish a note', async ({ page }) => {
  const state = createMockState();
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  await page.getByRole('button', { name: /Settings/i }).click();
  await expect(page.getByRole('dialog', { name: 'Settings panel' })).toBeVisible();

  await page.locator('label:has-text("Org/Owner") select').selectOption('brimdor');
  await page.locator('label:has-text("Repository") select').selectOption('ScribeVault');
  await page.locator('label:has-text("Base URL") input').fill('http://127.0.0.1:4173/fake-openai/v1');
  await page.locator('label:has-text("Model") input').fill('gpt-4o');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('.settings-status')).toContainText('Settings saved.');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.locator('textarea[placeholder="Ask Scribe to create a note..."]').fill('Draft a project kickoff agenda with owners and dates.');
  await page.getByTitle('Send message').click();

  const publishButton = page.getByRole('button', { name: 'Publish note' });
  await expect(publishButton).toBeVisible();
  await publishButton.click();

  await expect(page.getByText(/Saved note to/i)).toBeVisible();
  await expect(page.getByText(/Committed and pushed to/i)).toBeVisible();

  expect(state.repoFiles.get('Inbox/project-kickoff-plan.md')).toContain('# Project Kickoff Plan');
  expect(state.publishCalls).toHaveLength(1);
  expect(state.publishCalls[0].filePaths).toEqual(['Inbox/project-kickoff-plan.md']);
});

test('oauth browser flow routes note-tag questions through grounded tools', async ({ page }) => {
  const state = createMockState({ authenticated: true, oauth: true });
  await installScribeApiMocks(page, state);
  await installOAuthProviderMock(page, state);

  await page.goto('/');
  await expect(page.getByRole('button', { name: /New Chat/i })).toBeVisible();

  await page.locator('textarea[placeholder="Ask Scribe to create a note..."]').fill('What note tags do I use right now?');
  await page.getByTitle('Send message').click();

  await expect(page.getByText('You currently use #project and #research.')).toBeVisible();
  expect(state.noteTagRequests).toBe(1);
  expect(state.oauthPlannerCalls).toBe(2);
});

test('oauth browser flow can publish an existing note draft', async ({ page }) => {
  const state = createMockState({ authenticated: true, oauth: true });
  state.threads.push({
    id: 'thread-oauth-publish',
    title: 'OAuth Publish Draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPinned: false,
  });
  state.messages.push({
    id: 'message-oauth-draft',
    threadId: 'thread-oauth-publish',
    role: 'assistant',
    content: '# OAuth Publish Note\n\nThis note should publish through the OAuth tool path.',
    timestamp: Date.now(),
    modelMeta: {
      provider: 'oauth',
      requestedModel: 'gpt-5.4',
      usedModel: 'gpt-5.4',
      fallbackReason: '',
    },
  });

  await installScribeApiMocks(page, state);
  await installOAuthProviderMock(page, state);

  await page.goto('/');
  await page.getByRole('button', { name: /OAuth Publish Draft/i }).click();

  const publishButton = page.getByRole('button', { name: 'Publish note' });
  await expect(publishButton).toBeVisible();
  await publishButton.click();

  await expect(page.getByText(/Saved note to/i)).toBeVisible();
  await expect(page.getByText('Inbox/oauth-publish-note.md')).toBeVisible();
  expect(state.repoFiles.get('Inbox/oauth-publish-note.md')).toContain('# OAuth Publish Note');
  expect(state.publishCalls).toHaveLength(1);
  expect(state.publishCalls[0].filePaths).toEqual(['Inbox/oauth-publish-note.md']);
});

test('agent behavior settings section shows heartbeat toggle, interval, verbosity, and auto-publish', async ({ page }) => {
  const state = createMockState();
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  await page.getByRole('button', { name: /Settings/i }).click();
  await expect(page.getByRole('dialog', { name: 'Settings panel' })).toBeVisible();

  // Configure repo so settings can save
  await page.locator('label:has-text("Org/Owner") select').selectOption('brimdor');
  await page.locator('label:has-text("Repository") select').selectOption('ScribeVault');

  // Agent behavior section is present
  await expect(page.getByText('Agent behavior')).toBeVisible();

  // Heartbeat toggle is present and starts unchecked (disabled by default)
  const heartbeatToggle = page.getByRole('switch', { name: 'Toggle heartbeat' });
  await expect(heartbeatToggle).toBeVisible();
  await expect(heartbeatToggle).toHaveAttribute('aria-checked', 'false');

  // Interval selector should NOT be visible when heartbeat is off
  await expect(page.locator('select[name="heartbeatIntervalMinutes"]')).not.toBeVisible();

  // Enable heartbeat
  await heartbeatToggle.click();
  await expect(heartbeatToggle).toHaveAttribute('aria-checked', 'true');

  // Interval selector should now be visible
  const intervalSelect = page.locator('select[name="heartbeatIntervalMinutes"]');
  await expect(intervalSelect).toBeVisible();
  // Default is 60 minutes
  await expect(intervalSelect).toHaveValue('60');

  // Change interval to 30 minutes
  await intervalSelect.selectOption('30');
  await expect(intervalSelect).toHaveValue('30');

  // Verbosity dropdown
  const verbositySelect = page.locator('select[name="agentVerbosity"]');
  await expect(verbositySelect).toBeVisible();
  await expect(verbositySelect).toHaveValue('detailed');
  await verbositySelect.selectOption('concise');
  await expect(verbositySelect).toHaveValue('concise');

  // Auto-publish dropdown
  const autoPublishSelect = page.locator('select[name="agentAutoPublish"]');
  await expect(autoPublishSelect).toBeVisible();
  await expect(autoPublishSelect).toHaveValue('ask');
  await autoPublishSelect.selectOption('auto');
  await expect(autoPublishSelect).toHaveValue('auto');

  // Save settings
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('.settings-status')).toContainText('Settings saved.');

  // Verify settings were persisted in mock state
  expect(state.settings.get('heartbeatEnabled')).toBe(true);
  expect(state.settings.get('heartbeatIntervalMinutes')).toBe(30);
  expect(state.settings.get('agentVerbosity')).toBe('concise');
  expect(state.settings.get('agentAutoPublish')).toBe('auto');
});

test('heartbeat panel opens from settings history link and closes with backdrop', async ({ page }) => {
  const state = createMockState();
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  // Open settings
  await page.getByRole('button', { name: /Settings/i }).click();
  await expect(page.getByRole('dialog', { name: 'Settings panel' })).toBeVisible();

  // Click heartbeat history link
  await page.getByRole('button', { name: 'View heartbeat history' }).click();

  // Settings panel should close, heartbeat panel should open
  await expect(page.getByRole('dialog', { name: 'Heartbeat panel' })).toBeVisible();
  await expect(page.getByText('Agent monitoring')).toBeVisible();
  await expect(page.getByText('No heartbeat executions yet.')).toBeVisible();

  // Run heartbeat now button is visible
  await expect(page.getByRole('button', { name: 'Run heartbeat now' })).toBeVisible();

  // Close via backdrop click
  await page.locator('.heartbeat-panel-backdrop').click();
  await expect(page.getByRole('dialog', { name: 'Heartbeat panel' })).not.toBeVisible();
});

test('heartbeat panel closes with Escape key', async ({ page }) => {
  const state = createMockState();
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  // Open heartbeat panel via settings
  await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByRole('button', { name: 'View heartbeat history' }).click();
  await expect(page.getByRole('dialog', { name: 'Heartbeat panel' })).toBeVisible();

  // Close with Escape
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Heartbeat panel' })).not.toBeVisible();
});

test('heartbeat panel closes with close button', async ({ page }) => {
  const state = createMockState();
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  // Open heartbeat panel via settings
  await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByRole('button', { name: 'View heartbeat history' }).click();
  await expect(page.getByRole('dialog', { name: 'Heartbeat panel' })).toBeVisible();

  // Close with close button
  await page.getByRole('button', { name: 'Close heartbeat panel' }).click();
  await expect(page.getByRole('dialog', { name: 'Heartbeat panel' })).not.toBeVisible();
});

test('heartbeat status indicator appears in topbar when heartbeat is enabled', async ({ page }) => {
  const state = createMockState();
  // Pre-enable heartbeat so the indicator shows immediately
  state.settings.set('heartbeatEnabled', true);
  state.settings.set('heartbeatIntervalMinutes', 60);
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  // Heartbeat dot indicator should be visible in the topbar
  const heartbeatDot = page.locator('.topbar-heartbeat-dot');
  await expect(heartbeatDot).toBeVisible();
  // Should have idle state initially
  await expect(heartbeatDot).toHaveClass(/idle/);

  // Clicking the dot should open the heartbeat panel
  await page.locator('.topbar-heartbeat').click();
  await expect(page.getByRole('dialog', { name: 'Heartbeat panel' })).toBeVisible();
});

test('heartbeat status indicator is hidden when heartbeat is disabled', async ({ page }) => {
  const state = createMockState();
  // Heartbeat defaults to disabled
  state.settings.set('heartbeatEnabled', false);
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  // Heartbeat dot indicator should NOT be visible
  await expect(page.locator('.topbar-heartbeat')).not.toBeVisible();
});

test('heartbeat panel shows execution history when heartbeats exist', async ({ page }) => {
  const state = createMockState();
  // Pre-populate with heartbeat history
  state.heartbeats.push(
    {
      id: 'hb-1',
      startedAt: Date.now() - 3600000,
      completedAt: Date.now() - 3599000,
      status: 'passed',
      rating: 4.5,
      checklist: [
        { name: 'repo_sync', label: 'Repository sync', result: 'pass', detail: 'Clean working tree' },
        { name: 'workspace_health', label: 'Workspace health', result: 'pass', detail: '3 notes, 2 tags' },
        { name: 'issue_check', label: 'Issue tracker', result: 'pass', detail: 'No open issues' },
        { name: 'activity_summary', label: 'Activity summary', result: 'pass', detail: 'Recent activity logged' },
      ],
    },
    {
      id: 'hb-2',
      startedAt: Date.now() - 7200000,
      completedAt: Date.now() - 7198000,
      status: 'failed',
      rating: 2.0,
      checklist: [
        { name: 'repo_sync', label: 'Repository sync', result: 'fail', detail: 'Dirty working tree' },
        { name: 'workspace_health', label: 'Workspace health', result: 'pass', detail: '3 notes, 2 tags' },
        { name: 'issue_check', label: 'Issue tracker', result: 'fail', detail: 'API error' },
        { name: 'activity_summary', label: 'Activity summary', result: 'pass', detail: 'Recent activity logged' },
      ],
    },
  );
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  // Open heartbeat panel via settings
  await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByRole('button', { name: 'View heartbeat history' }).click();
  await expect(page.getByRole('dialog', { name: 'Heartbeat panel' })).toBeVisible();

  // Should NOT show the empty state message
  await expect(page.getByText('No heartbeat executions yet.')).not.toBeVisible();

  // Should show heartbeat entries with ratings
  await expect(page.getByText('4.5/5')).toBeVisible();
  await expect(page.getByText('2/5')).toBeVisible();

  // Should show checklist labels
  await expect(page.getByText('Repository sync').first()).toBeVisible();
  await expect(page.getByText('Workspace health').first()).toBeVisible();
});

test('interactive elements meet 44px minimum touch targets', async ({ page }) => {
  const state = createMockState();
  await installScribeApiMocks(page, state);
  await installManualProviderMock(page);

  await login(page);

  // Check btn-icon elements in topbar meet 44px minimum
  const topbarButtons = page.locator('.topbar .btn-icon');
  const buttonCount = await topbarButtons.count();

  for (let i = 0; i < buttonCount; i++) {
    const box = await topbarButtons.nth(i).boundingBox();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
});
