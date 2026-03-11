# Implementation Plan: Reliable Note Sync and Tool Routing

**Branch**: `008-fix-note-sync` | **Date**: 2026-03-11 | **Spec**: `specs/008-fix-note-sync/spec.md`
**Input**: Feature specification from `specs/008-fix-note-sync/spec.md`

## Summary

Make note sync reliable by executing the direct save/publish path for structured sync requests in OAuth chat mode, routing grounded OAuth note/repository tasks through the shared tool suite, remapping generic note folders to existing vault folders, enforcing markdown-only title-formatted note filenames through a shared save contract, and extending grounded note management to move/delete workflows.

## Technical Context

**Language/Version**: JavaScript (Node.js + React, ESM)  
**Primary Dependencies**: OpenAI SDK, Express, Vitest  
**Storage**: SQLite app data + local git checkout workspace  
**Testing**: Vitest  
**Target Platform**: Local browser + Node API  
**Project Type**: web app  
**Constraints**: Do not claim sync success unless write+commit+push all complete; keep path handling repository-relative and safe  
**Scale/Scope**: Provider-agnostic note sync flow, repository path resolution, note filename normalization, and grounded note lifecycle operations

## Constitution Check

- **I. Spec-First Development**: PASS
- **II. Test-Driven Quality**: PASS - add coverage for OAuth sync and path remapping
- **III. Constitution Alignment**: PASS
- **IV. Iterative Refinement**: PASS
- **V. Documentation as Code**: PASS

## Project Structure

```text
specs/008-fix-note-sync/
├── spec.md
├── plan.md
├── checklists/
│   └── requirements.md
└── tasks.md

src/
├── services/
│   ├── github.js
│   ├── openai.js
│   └── __tests__/
│       ├── github.test.js
│       └── openai.test.js
```

## Design Notes

- Handle structured save-note requests before the OAuth streaming call so sync can still execute without provider-native tool calls.
- Add Scribe-managed OAuth tool routing so note lookup, file inspection, and grounded repository answers can reuse the shared tool registry instead of depending on provider-native function calling.
- Centralize publish-path remapping in the GitHub client service so both assistant save flows and future direct save flows share the same behavior.
- Keep alias remapping conservative: only swap top-level folders when the requested folder is missing and a known existing alias is present.
- Normalize note save paths through a shared utility so UI prompts, provider fallback logic, and repository publishing agree on markdown-only title-based filenames.
- Support note move/delete actions through the same repository mutation and publish path so note management remains grounded and verifiable.
- Add a browser-driven Playwright layer for the highest-value login/chat/publish workflows so real UI regressions are caught outside service-only coverage.
