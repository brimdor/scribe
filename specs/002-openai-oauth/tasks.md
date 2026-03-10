# Tasks: OpenAI OAuth Sign-In

## Phase 1: Setup

- [x] T001 Review the existing provider setup flow in `src/components/Settings/SettingsPanel.jsx`, `src/components/Chat/InputConsole.jsx`, and `src/services/openai.js`
- [x] T002 [P] Add test scaffolding for OAuth session and pending-flow storage behavior in `src/services/__tests__/storage.test.js`

## Phase 2: Foundational

- [x] T003 Extend persisted app settings and storage helpers for OpenAI connection mode, OAuth session, and pending flow state in `src/services/storage.js`
- [x] T004 Create a browser PKCE OpenAI OAuth service for authorization URL creation, callback completion, refresh, and disconnect helpers in `src/services/openai-oauth.js`
- [x] T005 Add service tests for OAuth URL generation, callback validation, and refresh behavior in `src/services/__tests__/openai-oauth.test.js`
- [x] T006 Refactor provider initialization and request routing so manual OpenAI-compatible mode and OAuth-backed OpenAI mode can coexist in `src/services/openai.js`
- [x] T007 Add provider routing tests for manual mode, OAuth mode, and fallback behavior in `src/services/__tests__/openai.test.js`

## Phase 3: User Story 1 - Connect OpenAI without manually copying an API key

- [x] T008 [US1] Add OpenAI OAuth session state and actions to the settings context in `src/context/SettingsContext.jsx`
- [x] T009 [US1] Add OpenAI connect UI and connection status messaging to `src/components/Settings/SettingsPanel.jsx`
- [x] T010 [US1] Add OpenAI OAuth styling states and action layouts to `src/components/Settings/SettingsPanel.css`
- [x] T011 [US1] Wire OAuth-backed provider initialization into chat send flow in `src/components/Chat/InputConsole.jsx`

## Phase 4: User Story 2 - Complete the connection with a simple callback experience

- [x] T012 [US2] Add app boot logic that detects and completes OpenAI OAuth callbacks in `src/App.jsx`
- [x] T013 [US2] Surface callback progress, cancellation, and retry feedback in `src/components/Settings/SettingsPanel.jsx`
- [x] T014 [P] [US2] Add callback completion and failure-path tests in `src/services/__tests__/openai-oauth.test.js`

## Phase 5: User Story 3 - Manage OpenAI OAuth alongside existing provider settings

- [x] T015 [US3] Add disconnect and reconnect behavior while preserving manual provider settings in `src/context/SettingsContext.jsx`
- [x] T016 [US3] Update the settings UI copy and manual-provider affordances so both connection methods remain understandable in `src/components/Settings/SettingsPanel.jsx`
- [x] T017 [P] [US3] Add persistence tests proving manual provider settings survive connect, failure, refresh loss, and disconnect in `src/services/__tests__/storage.test.js`

## Final Phase: Polish

- [x] T018 Update the login/help messaging to point users toward Settings-based OpenAI sign-in in `src/components/Auth/LoginPage.jsx`
- [x] T019 Run targeted regression checks and fix any integration issues across `src/App.jsx`, `src/components/Chat/InputConsole.jsx`, and `src/components/Settings/SettingsPanel.jsx`
- [x] T020 Document manual verification results in `tests/reports/002-openai-oauth-2026-03-10.md`
