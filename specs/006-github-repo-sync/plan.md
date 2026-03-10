# Implementation Plan: GitHub Repository Sync Automation

**Branch**: `006-github-repo-sync` | **Date**: 2026-03-10 | **Spec**: `specs/006-github-repo-sync/spec.md`
**Input**: Feature specification from `specs/006-github-repo-sync/spec.md`

## Summary

Add a backend repository sync service that clones/pulls the configured GitHub repository into a user-scoped local folder, expose sync through authenticated API routes, trigger sync on login and relevant settings saves, add a manual Sync action in settings, and add an assistant sync tool path for repo-freshness prompts.

## Technical Context

**Language/Version**: JavaScript (Node.js + React, ESM)  
**Primary Dependencies**: Express, @octokit/rest, React, OpenAI SDK  
**Storage**: SQLite (encrypted settings/user/session records) + local filesystem checkout workspace  
**Testing**: Vitest (unit + integration)  
**Target Platform**: Localhost Linux/macOS development environment  
**Project Type**: web (frontend + backend in same repository)  
**Performance Goals**: Sync endpoint responds with completion/failure within 10s for normal repositories  
**Constraints**: Preserve current login/settings reliability; never store PAT in local git remote URL; avoid path traversal in local checkout paths  
**Scale/Scope**: Single-user interactive desktop/browser usage; one active assigned repository per authenticated user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-First Development**: PASS - feature artifacts are created before implementation.
- **II. Test-Driven Quality**: PASS - add/adjust unit tests for repo sync logic and assistant sync trigger behavior; run full test suite.
- **III. Security by Default**: PASS - authenticated sync endpoint only, token retrieved from encrypted user store, local path validation prevents traversal.
- **IV. Iterative Refinement**: PASS - follow spec -> plan -> tasks -> implementation -> validation phases.
- **V. Documentation as Code**: PASS - update feature specs/plan/tasks and produce test report.

## Project Structure

### Documentation (this feature)

```text
specs/006-github-repo-sync/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── github-sync.openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── config/
│   ├── routes/
│   └── services/

src/
├── components/
│   └── Settings/
├── services/
└── context/

tests/
├── integration/
└── reports/
```

**Structure Decision**: Keep existing single-repo web application structure and add backend sync service + route, frontend settings sync affordances, and assistant-trigger hook in current service layer.
