# Implementation Tasks: Agentic AI Overhaul

**Feature**: 009-agentic-overhaul
**Created**: 2026-03-11

---

## Phase 1: Setup

- [ ] T001 [P] Verify existing dependencies cover all needs (no new deps required)
- [ ] T002 [P] Create directory structure for new files: `src/services/`, `src/components/Heartbeat/`, `server/src/routes/`

## Phase 2: Backend Foundation

- [ ] T003 Add V2 database migration for `heartbeat_executions` table in `server/src/db/database.js`
- [ ] T004 Add heartbeat execution CRUD operations to `server/src/services/storage-store.js`
- [ ] T005 [P] Create `server/src/routes/agent-routes.js` with `GET /api/agent/workspace-state` endpoint
- [ ] T006 [P] Add heartbeat storage routes (`GET /POST /api/storage/heartbeats`) to `server/src/routes/storage-routes.js`
- [ ] T007 Register new agent routes in `server/src/app.js`

## Phase 3: Agent Context System (US1 - Agent Platform Awareness)

- [ ] T008 [US1] Create `src/services/agent-context.js` — agent context builder with purpose, tools, workspace state, preferences
- [ ] T009 [US1] Update `src/utils/constants.js` — enhanced system prompt with full platform awareness directive
- [ ] T010 [US1] Modify `src/services/openai.js` — inject agent context into manual provider flow
- [ ] T011 [US1] Modify `src/services/openai-oauth.js` — inject agent context into OAuth provider flow
- [ ] T012 [US1] Update `src/services/storage.js` — add new settings keys to `DEFAULT_APP_SETTINGS` (agentVerbosity, agentAutoPublish, heartbeatEnabled, heartbeatIntervalMinutes)

## Phase 4: Agent Platform Management (US2 - Agent as Platform Manager)

- [ ] T013 [US2] Enhance agent context with workspace summary capability in `src/services/agent-context.js`
- [ ] T014 [US2] Add `get_workspace_summary` tool to `src/services/agent-tools.js`
- [ ] T015 [US2] Verify multi-step workflow support in tool resolution loop (existing TOOL_ROUND_LIMIT=6 in `src/services/agent-tools.js`)

## Phase 5: Heartbeat System (US3 - Heartbeat)

- [ ] T016 [US3] Create `src/services/heartbeat.js` — heartbeat scheduler with start/stop/configure
- [ ] T017 [US3] Define heartbeat checklist items (repo_sync, workspace_health, issue_check, activity_summary)
- [ ] T018 [US3] Implement heartbeat checklist execution logic with Pass/Fail per item
- [ ] T019 [US3] Implement rating calculation (0-5 scale from checklist results)
- [ ] T020 [US3] Add heartbeat result persistence via storage API calls
- [ ] T021 [US3] Integrate heartbeat scheduler into `src/context/SettingsContext.jsx`

## Phase 6: Enhanced Settings Panel (US4 - Settings)

- [ ] T022 [US4] Add Agent section to `src/components/Settings/SettingsPanel.jsx` with heartbeat toggle and interval selector
- [ ] T023 [US4] Add agent behavior preferences (verbosity, auto-publish) to Settings Agent section
- [ ] T024 [US4] Ensure settings overlay dismissal via outside click, Escape, and close button in `src/components/Settings/SettingsPanel.jsx`
- [ ] T025 [US4] Add heartbeat history link in settings pointing to heartbeat panel

## Phase 7: Heartbeat Panel & UI (US4/US5 - History + Touch)

- [ ] T026 [US4] Create `src/components/Heartbeat/HeartbeatPanel.jsx` — overlay showing heartbeat execution history
- [ ] T027 [US4] Create `src/components/Heartbeat/HeartbeatPanel.css` — styles for heartbeat panel
- [ ] T028 [US5] Add heartbeat status indicator to `src/components/TopBar/TopBar.jsx`
- [ ] T029 [US5] Verify all interactive elements meet 44px minimum touch targets across modified components
- [ ] T030 [US5] Verify 8px minimum spacing between adjacent interactive elements
- [ ] T031 [US5] Ensure overlay animations complete within 300ms

## Phase 8: Testing Suite (US6 - Exhaustive Testing)

- [ ] T032 [US6] Create `src/services/__tests__/agent-context.test.js` — unit tests for agent context assembly
- [ ] T033 [US6] Create `src/services/__tests__/heartbeat.test.js` — unit tests for heartbeat scheduler
- [ ] T034 [US6] Create `tests/integration/agent-integration.test.js` — agent integration tests (context injection, tool execution, error handling)
- [ ] T035 [US6] Create `tests/integration/heartbeat-flow.test.js` — heartbeat flow tests (scheduling, execution, persistence)
- [ ] T036 [US6] Update `tests/e2e/scribe-browser.spec.js` — E2E tests for agent settings, heartbeat UI, touch targets
- [ ] T037 [US6] Create test report generation with 0-5 category ratings

## Phase 9: Polish

- [ ] T038 Run full lint pass and fix any issues
- [ ] T039 Run full test suite and ensure all categories achieve rating >= 4
- [ ] T040 Update constitution with new capabilities (agent context, heartbeat, workspace state)
