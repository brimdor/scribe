# Implementation Plan: Safe Publish Scoping

**Branch**: `fix/audit-finding-4-publish-scope` | **Date**: 2026-03-12 | **Spec**: `specs/009-safe-publish-scoping/spec.md`
**Input**: Feature specification from `specs/009-safe-publish-scoping/spec.md`

## Summary

Remove the unsafe whole-tree publish fallback, require explicit path lists for all publish operations, update caller/tool contract wording to match, and add tests that prove unrelated checkout changes are not committed.

## Technical Context

**Language/Version**: JavaScript (Node.js + React, ESM)  
**Primary Dependencies**: Express, React, Vitest, Playwright  
**Storage**: Local git checkout workspace plus SQLite-backed app state  
**Testing**: Vitest integration tests, Playwright E2E, lint, production build  
**Target Platform**: Localhost Linux development environment  
**Project Type**: web (frontend + backend in same repository)  
**Constraints**: Resolve only audit Finding #4; preserve existing note publish flows; do not broaden publish behavior beyond explicit scoping  
**Scale/Scope**: Single publish pipeline in `server/src/services/github-repo-sync.js` and its direct callers

## Constitution Check

- **I. Spec-First Development**: PASS - spec and plan created before code changes.
- **II. Test-Driven Quality**: PASS - implementation will add focused automated coverage and run full validation.
- **III. Constitution Alignment**: PASS - scope is limited to the requested audit finding.
- **IV. Iterative Refinement**: PASS - follow spec, plan, tasks, implementation, and validation phases.
- **V. Documentation as Code**: PASS - feature artifacts and validation results will match the implemented behavior.

## Project Structure

```text
specs/009-safe-publish-scoping/
├── spec.md
├── plan.md
└── tasks.md

server/src/services/github-repo-sync.js
server/src/routes/github-routes.js
src/services/agent-tools.js
tests/integration/
tests/e2e/
```

**Structure Decision**: Keep the change inside the existing publish service and its direct API/tool callers, with regression coverage in current test locations.
