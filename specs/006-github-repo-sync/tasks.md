# Tasks: GitHub Repository Sync Automation

**Input**: Design documents from `specs/006-github-repo-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create sync service scaffolding in `server/src/services/github-repo-sync.js`
- [X] T002 Add sync root configuration support in `server/src/config/env.js`
- [X] T003 Update ignore patterns for local sync workspace in `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T004 Add authenticated repository sync endpoint to `server/src/routes/github-routes.js`
- [X] T005 Integrate login-triggered sync flow in `server/src/routes/auth-routes.js`
- [X] T006 Add reusable frontend sync client functions in `src/services/github.js`

---

## Phase 3: User Story 1 - Auto-sync assigned repository (Priority: P1)

**Goal**: Sync assigned repository on login and settings assignment changes.

**Independent Test**: Save/change owner+repo and verify local checkout clone/pull result under user folder.

- [X] T007 [US1] Implement clone-or-pull logic and safe path validation in `server/src/services/github-repo-sync.js`
- [X] T008 [US1] Return structured sync payloads from API route in `server/src/routes/github-routes.js`
- [X] T009 [US1] Trigger settings-change sync after successful save in `src/components/Settings/SettingsPanel.jsx`

---

## Phase 4: User Story 2 - Manual sync action in settings (Priority: P2)

**Goal**: Let user trigger sync on demand from settings.

**Independent Test**: Click sync button and verify status message and backend sync call.

- [X] T010 [US2] Add Sync repository button and click handler in `src/components/Settings/SettingsPanel.jsx`
- [X] T011 [US2] Add button and state styling in `src/components/Settings/SettingsPanel.css`

---

## Phase 5: User Story 3 - Assistant sync tool path (Priority: P3)

**Goal**: Trigger git pull tool path before repo-freshness assistant prompts.

**Independent Test**: Send freshness prompt and verify sync tool executes before model response.

- [X] T012 [US3] Add assistant sync-intent detection and tool invocation helpers in `src/services/github.js`
- [X] T013 [US3] Invoke assistant sync tool path in `src/services/openai.js` prior to chat generation

---

## Phase 6: Polish & Validation

- [X] T014 [P] Add/extend unit tests for assistant sync trigger behavior in `src/services/__tests__/openai.test.js`
- [X] T015 [P] Add/extend unit tests for sync API client and intent detection in `src/services/__tests__/github.test.js`
- [X] T016 Run full validation (`npm run lint`, `npm run test`, `npm run build`) and capture report in `tests/reports/006-github-repo-sync-20260310.md`
