# Implementation Plan: Reusable Agent Tool Suite

**Branch**: `007-agent-tool-suite` | **Date**: 2026-03-10 | **Spec**: `specs/007-agent-tool-suite/spec.md`
**Input**: Feature specification from `specs/007-agent-tool-suite/spec.md`

## Summary

Add a centralized agent tool registry for repository file operations and repository/GitHub inspection, expose safe authenticated backend endpoints for those tools, wire the manual model flow to execute tool calls through a shared orchestration loop, preserve existing fallback behavior for non-tool flows, and rewrite the README to document the application and tool suite.

## Technical Context

**Language/Version**: JavaScript (Node.js + React, ESM)  
**Primary Dependencies**: Express, @octokit/rest, OpenAI SDK, React  
**Storage**: SQLite for user/session/settings data plus user-scoped local git checkouts under `server/repos/`  
**Testing**: Vitest (service/unit/integration style)  
**Target Platform**: Localhost Linux/macOS development environment  
**Project Type**: web (frontend + backend in one repository)  
**Performance Goals**: Tool execution should keep typical local repo inspection under a few seconds and avoid loading unbounded file content into the model context  
**Constraints**: Preserve auth boundaries; keep tool outputs structured; prevent path traversal; avoid destructive git mutations; retain compatibility with existing non-tool chat behavior  
**Scale/Scope**: Single authenticated user session working against one assigned repository at a time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-First Development**: PASS - feature spec, plan, tasks, and supporting artifacts are created before code changes.
- **II. Test-Driven Quality**: PASS - add focused unit/service coverage for tool registry orchestration, repo file safety, and backend git/GitHub inspection endpoints; run lint/test/build validation.
- **III. Security by Default**: PASS - all tool endpoints remain authenticated, repo paths stay user-scoped, write operations are limited to text files within the assigned checkout, and failures are structured.
- **IV. Iterative Refinement**: PASS - work proceeds through specification, planning, tasking, implementation, and validation phases.
- **V. Documentation as Code**: PASS - README and spec artifacts are updated alongside code and test report output.

## Research Decisions

- Use a shared client-side tool registry with provider-agnostic metadata and executor bindings.
- Keep backend tools limited to safe repository operations and inspection-oriented git/GitHub actions.
- Use a non-stream tool-resolution pass before the final streamed assistant response in the manual provider flow.
- Preserve existing OAuth/provider flows even when native tool-calling is not used.

## Project Structure

### Documentation (this feature)

```text
specs/007-agent-tool-suite/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- agent-tools.openapi.yaml
`-- checklists/
    |-- requirements.md
    |-- api.md
    `-- security.md
```

### Source Code (repository root)

```text
server/
|-- src/
|   |-- routes/
|   `-- services/

src/
|-- components/
|   `-- Settings/
|-- context/
`-- services/

tests/
|-- integration/
`-- reports/
```

**Structure Decision**: Keep the current single-repo web app structure, add backend repo tool services/routes, add a dedicated frontend tool registry/orchestrator, and limit UI changes to documentation/visibility improvements where helpful.
