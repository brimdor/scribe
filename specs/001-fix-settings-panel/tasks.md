# Tasks: Settings Panel and Integrations

## Phase 1: Setup

- [X] T001 [P] [US1] Create shared settings context in `src/context/SettingsContext.jsx`
- [X] T002 [P] [US1] Create settings panel UI in `src/components/Settings/SettingsPanel.jsx`
- [X] T003 [P] [US1] Add settings panel styles in `src/components/Settings/SettingsPanel.css`

## Phase 2: Foundational

- [X] T004 [US1] Wire `SettingsProvider` into `src/App.jsx`
- [X] T005 [US1] Connect settings triggers in `src/components/Sidebar/Sidebar.jsx` and `src/components/TopBar/TopBar.jsx`
- [X] T006 [US1] Mount the settings panel in `src/components/Layout/Layout.jsx`

## Phase 3: User Story 2 - Agent Configuration

- [X] T007 [US2] Add settings persistence helpers in `src/services/storage.js`
- [X] T008 [US2] Update OpenAI client configuration in `src/services/openai.js`
- [X] T009 [US2] Load and apply saved agent settings in `src/components/Chat/InputConsole.jsx`
- [X] T010 [US2] Add validation and save feedback for agent settings in `src/components/Settings/SettingsPanel.jsx`

## Phase 4: User Story 3 - GitHub and Environment Configuration

- [X] T011 [US3] Add environment and GitHub fields to settings state in `src/context/SettingsContext.jsx`
- [X] T012 [US3] Render GitHub and environment sections in `src/components/Settings/SettingsPanel.jsx`
- [X] T013 [US3] Persist GitHub-related defaults through `src/services/storage.js`

## Final Phase: Polish

- [X] T014 [P] [US1] Add responsive and accessibility refinements in `src/components/Settings/SettingsPanel.css`
- [X] T015 [P] [US2] Add unit tests for settings persistence and OpenAI fallback behavior in `src/services/__tests__/`
- [X] T016 [US1] Validate build, lint, and tests for the new settings flow
