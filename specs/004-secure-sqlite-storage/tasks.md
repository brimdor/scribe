# Tasks: Secure SQLite-Centric Persistent Storage

**Input**: Design documents from `specs/004-secure-sqlite-storage/`  
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create backend scaffold and entrypoint in `server/index.js` and `server/src/app.js`
- [x] T002 Add backend runtime dependencies and scripts in `package.json`
- [x] T003 [P] Configure Vite API proxy and dev workflow updates in `vite.config.js` and `run_local.sh`

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Implement SQLite connection, migration runner, and table creation in `server/src/db/database.js`
- [x] T005 [P] Implement encryption utilities for at-rest payload protection in `server/src/utils/crypto.js`
- [x] T006 [P] Implement session and HTTPS enforcement middleware in `server/src/middleware/auth.js` and `server/src/middleware/transport.js`
- [x] T007 Implement GitHub PAT validation and capability checks in `server/src/services/github-auth.js`
- [x] T008 Implement user/session persistence services in `server/src/services/user-store.js`

## Phase 3: User Story 1 - Persistent user workspace on any device (Priority: P1)

**Goal**: Persist user-scoped data centrally and retrieve it consistently across devices.

**Independent Test**: Log in on two clients with the same GitHub username and verify shared data.

- [x] T009 [US1] Add auth endpoints for login/session/logout in `server/src/routes/auth-routes.js`
- [x] T010 [US1] Add storage CRUD endpoints for settings/threads/messages/schemas in `server/src/routes/storage-routes.js`
- [x] T011 [US1] Replace browser storage service with API-backed storage client in `src/services/storage.js`
- [x] T012 [US1] Update React contexts/components to use API session-backed persistence in `src/context/AuthContext.jsx`, `src/context/SettingsContext.jsx`, `src/context/ThemeContext.jsx`, and chat/sidebar components

## Phase 4: User Story 2 - PAT rotation without matching old token (Priority: P1)

**Goal**: Allow PAT replacement when capability checks pass, and reject insufficient scope tokens with clear messaging.

**Independent Test**: Existing user logs in with different PAT and receives correct success/failure behavior.

- [x] T013 [US2] Implement token-rotation-aware login flow in `server/src/services/user-store.js` and `server/src/routes/auth-routes.js`
- [x] T014 [US2] Return explicit repo capability failure error contracts in `server/src/routes/auth-routes.js`
- [x] T015 [US2] Update login UX error handling text in `src/components/Auth/LoginPage.jsx`

## Phase 5: User Story 3 - Zero browser-resident application storage (Priority: P2)

**Goal**: Remove Scribe persistence use of browser local storage APIs.

**Independent Test**: Browser dev tools show no Scribe app persistence entries while app remains functional.

- [x] T016 [US3] Remove session/local storage persistence helpers from `src/services/auth.js` and migrate to API calls
- [x] T017 [US3] Refactor GitHub API client usage to backend-proxied endpoints in `src/services/github.js` and server GitHub routes
- [x] T018 [US3] Add regression tests for storage/auth service behavior in `src/services/__tests__/storage.test.js`

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T019 [P] Add backend security and transport tests in `tests/integration/storage-auth.test.js`
- [x] T020 [P] Update README runtime documentation for backend + SQLite setup in `README.md`
- [x] T021 Run full checks (`npm run test`, `npm run build`) and remediate issues
- [x] T022 Document test outcomes in `tests/reports/004-secure-sqlite-storage-2026-03-10.md`
