# Tasks: Reliable Note Sync and Tool Routing

**Input**: Design documents from `specs/008-fix-note-sync/`
**Prerequisites**: plan.md, spec.md, checklists/

## Phase 1: Implementation

- [x] T001 Add shared direct save execution helper in `src/services/openai.js`
- [x] T002 Execute structured save-note sync requests in OAuth mode inside `src/services/openai.js`
- [x] T003 Add repository-aware publish path remapping in `src/services/github.js`
- [x] T004 Add OAuth tool-routing fallback for grounded note/repository tasks in `src/services/openai.js`

## Phase 2: Validation

- [x] T005 Add OAuth structured sync coverage in `src/services/__tests__/openai.test.js`
- [x] T006 Add repository folder remapping coverage in `src/services/__tests__/github.test.js`
- [x] T007 Add markdown-only and canonical filename coverage in `src/utils/__tests__/note-publish.test.js`
- [x] T008 Add OAuth shared-tool routing coverage in `src/services/__tests__/openai.test.js`
- [x] T009 Run targeted validation for updated service tests
- [x] T010 Add safe repository move/delete primitives in `server/src/services/github-repo-files.js` and `server/src/routes/github-routes.js`
- [x] T011 Add grounded note move/delete publish flows in `src/services/github.js` and `src/services/agent-tools.js`
- [x] T012 Add test coverage for note move/delete workflows in frontend and backend service tests
- [x] T013 Restore a fully green lint baseline with JSX-aware ESLint configuration
- [x] T014 Add Playwright browser test infrastructure and scripts
- [x] T015 Add browser E2E coverage for manual publish and OAuth grounded-tool flows
- [x] T016 Fix the UI send-button path so browser-triggered prompts are submitted as text instead of event objects
