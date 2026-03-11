# Tasks: Reusable Agent Tool Suite

**Input**: Design documents from `specs/007-agent-tool-suite/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create feature documentation artifacts in `specs/007-agent-tool-suite/`
- [X] T002 Add frontend tool registry scaffolding in `src/services/agent-tools.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T003 Extend backend repository services for safe file search/write and local git inspection in `server/src/services/github-repo-files.js`
- [X] T004 Add GitHub issue/PR listing helpers in `server/src/routes/github-routes.js`
- [X] T005 Add frontend API helpers for tool-backed repository and GitHub operations in `src/services/github.js`

---

## Phase 3: User Story 1 - Agent works directly with repository files (Priority: P1)

**Goal**: Let the agent list, read, search, and write repository files safely.

**Independent Test**: Ask the agent to inspect and update repository files, then verify the local checkout changed safely.

- [X] T006 [US1] Add backend repository search and write endpoints in `server/src/routes/github-routes.js`
- [X] T007 [US1] Implement safe repo search/write client helpers in `src/services/github.js`
- [X] T008 [US1] Register repository file tools and executors in `src/services/agent-tools.js`

---

## Phase 4: User Story 2 - Agent can inspect repository and GitHub state (Priority: P1)

**Goal**: Let the agent inspect local git state and remote GitHub collaboration context.

**Independent Test**: Ask the agent for git status/history and open issue/PR summaries.

- [X] T009 [US2] Add backend git status/diff/log endpoints in `server/src/routes/github-routes.js`
- [X] T010 [US2] Add frontend git/GitHub inspection helpers in `src/services/github.js`
- [X] T011 [US2] Register git and GitHub inspection tools in `src/services/agent-tools.js`

---

## Phase 5: User Story 3 - Tooling is reusable across tool-capable models (Priority: P2)

**Goal**: Run agent tools through one reusable orchestration layer instead of feature-specific prompt hooks.

**Independent Test**: Verify tool definitions are centralized and the manual provider resolves tool calls before the final streamed answer.

- [X] T012 [US3] Add shared tool-call orchestration helpers in `src/services/agent-tools.js`
- [X] T013 [US3] Integrate tool-capable manual provider flow in `src/services/openai.js`
- [X] T014 [US3] Surface available tool categories in `src/components/Settings/SettingsPanel.jsx`

---

## Phase 6: User Story 4 - Documentation explains the full application and tool suite (Priority: P3)

**Goal**: Rewrite the README so setup, architecture, and agent tooling are easy to understand.

**Independent Test**: Read `README.md` and confirm it documents the application end to end.

- [X] T015 [US4] Rewrite application and tool suite documentation in `README.md`

---

## Phase 7: Polish & Validation

- [X] T016 [P] Add or update backend repo service tests in `server/src/services/__tests__/github-repo-files.test.js`
- [X] T017 [P] Add or update frontend tool registry and provider tests in `src/services/__tests__/github.test.js` and `src/services/__tests__/openai.test.js`
- [X] T018 Run full validation (`npm run lint`, `npm run test`, `npm run build`) and capture report in `tests/reports/007-agent-tool-suite-20260310.md`
