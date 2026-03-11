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
