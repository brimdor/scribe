# Tasks: Safe Publish Scoping

**Input**: Design documents from `specs/009-safe-publish-scoping/`
**Prerequisites**: plan.md, spec.md

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Safe Publish Contract

- [X] T001 [US1] Update backend publish logic in `server/src/services/github-repo-sync.js` to require explicit paths and stage only those paths.
- [X] T002 [US1] Update API/tool contract wording in `server/src/routes/github-routes.js` and `src/services/agent-tools.js` to reflect explicit-path-only publishing.

## Phase 2: Validation

- [X] T003 [US1] Add or extend automated tests for explicit-path publish success, missing-path rejection, and unrelated-dirty-file isolation.
- [X] T004 [US1] Run full validation (`npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`) and capture results.
