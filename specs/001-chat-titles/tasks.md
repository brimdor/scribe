# Tasks: Chat Titles

## Phase 1: Setup

- [x] T001 Review existing thread, sidebar, and title helper flow in `src/components/Chat/InputConsole.jsx`, `src/components/Sidebar/Sidebar.jsx`, and `src/services/openai.js`

## Phase 2: Foundational

- [x] T002 Add shared title utility behavior for prompt-based fallback and title normalization in `src/services/openai.js`
- [x] T003 Ensure first-message title updates happen only once per thread in `src/components/Chat/InputConsole.jsx`

## Phase 3: User Story 1 - Auto-title new chats (P1)

- [x] T004 [US1] Update new-thread send flow to generate and persist first-message titles in `src/components/Chat/InputConsole.jsx`
- [x] T005 [P] [US1] Add service tests for title generation and fallback behavior in `src/services/__tests__/openai.test.js`

## Phase 4: User Story 2 - Rename chat from the sidebar (P2)

- [x] T006 [US2] Add inline rename state and hover pencil control in `src/components/Sidebar/Sidebar.jsx`
- [x] T007 [US2] Style rename affordances and inline editor states in `src/components/Sidebar/Sidebar.css`
- [x] T008 [P] [US2] Add storage helper tests covering thread title persistence rules in `src/services/__tests__/storage.test.js`

## Phase 5: Polish

- [x] T009 Verify active-thread refresh behavior after title changes in `src/components/Layout/Layout.jsx`
- [x] T010 Run lint and tests, then write validation report in `tests/reports/001-chat-titles-2026-03-10.md`
