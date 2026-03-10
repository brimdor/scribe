# Implementation Plan: OpenAI OAuth Sign-In

**Branch**: `002-openai-oauth` | **Date**: 2026-03-10 | **Spec**: `specs/002-openai-oauth/spec.md`
**Input**: Feature specification from `specs/002-openai-oauth/spec.md`

## Summary

Add a browser-native OpenAI OAuth connection flow to Scribe using PKCE, persist the resulting OpenAI session locally, and let the chat service use OAuth-backed OpenAI access while preserving the existing manual OpenAI-compatible provider settings.

## Technical Context

**Language/Version**: JavaScript (ES modules) with React 18
**Primary Dependencies**: React, Vite, `idb`, `openai`, `vitest`
**Storage**: IndexedDB via `idb`, session storage for existing GitHub auth
**Testing**: Vitest
**Target Platform**: Browser-based web application
**Project Type**: web
**Performance Goals**: OpenAI connection status updates should feel immediate; OAuth callback completion should finish in one app return without extra navigation; token refresh should happen before visible request failures
**Constraints**: Must stay compatible with the existing single-page app, preserve non-OpenAI manual provider settings, keep OpenAI session data local to the browser, and avoid introducing a separate backend service
**Scale/Scope**: One new OpenAI auth flow, one settings management surface, and one OpenAI request path for existing chat generation

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | PASS | Spec created before code changes |
| Test-Driven Quality | PASS | Storage, OAuth state, and provider selection behavior will be covered with Vitest |
| Constitution Alignment | PASS | Plan extends the current frontend architecture without bypassing the workflow |
| Iterative Refinement | PASS | Research, data model, contracts, and tasks are produced before implementation |
| Documentation as Code | PASS | Spec artifacts and test report will reflect the implemented OAuth flow |

## Project Structure

### Documentation (this feature)

```text
specs/002-openai-oauth/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── Auth/LoginPage.jsx
│   ├── Chat/InputConsole.jsx
│   └── Settings/SettingsPanel.{jsx,css}
├── context/
│   └── SettingsContext.jsx
├── services/
│   ├── openai.js
│   ├── openai-oauth.js
│   ├── storage.js
│   └── __tests__/
└── App.jsx

tests/
└── reports/
```

**Structure Decision**: Keep the current single-frontend structure and add a dedicated OpenAI OAuth service plus small updates in app boot, settings, and chat integration layers.
