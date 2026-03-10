# Implementation Plan: Settings Panel and Integrations

**Feature**: `001-fix-settings-panel`
**Branch**: `001-fix-settings-panel`
**Date**: 2026-03-10

## Technical Context

- Language/Version: JavaScript (ES modules)
- Framework: React 18 with Vite 5
- Primary Dependencies: `react`, `openai`, `@octokit/rest`, `idb`
- Storage: IndexedDB for persistent app settings, sessionStorage for auth session
- Testing: Vitest, ESLint, Vite production build
- Target Platform: Responsive browser SPA
- Project Type: Single-page web application
- Performance Goals: Settings panel opens instantly and saves without blocking core chat flow
- Constraints: Browser-only execution, preserve existing authenticated flow, do not require an API key for local OpenAI-compatible providers
- Scale/Scope: Single-user local settings management for one app session and persisted local environment config

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | Pass | Spec created before implementation |
| Test-Driven Quality | Pass | Add focused tests for settings persistence and agent config behavior |
| Constitution Alignment | Pass | Artifacts will stay aligned through implementation |
| Iterative Refinement | Pass | Work proceeds through spec, plan, tasks, implementation, validation |
| Documentation as Code | Pass | Feature artifacts stored under `specs/001-fix-settings-panel/` |

## Research Summary

- Persist settings in IndexedDB using the existing `settings` object store.
- Add an application-level settings context so multiple components can open the panel and consume saved configuration.
- Rework OpenAI initialization to accept base URL, model, and an API-key fallback of `1234` when the user leaves the field blank.

## Data Model

- `environmentName`: optional display label for the current environment
- `githubOwner`: optional default GitHub owner/org
- `githubRepo`: optional default repository
- `agentBaseUrl`: required OpenAI-compatible base URL
- `agentApiKey`: optional stored API key value
- `agentModel`: optional model override

## UX Notes

- Use a slide-over settings panel with overlay dismissal.
- Keep sections grouped and labeled: Environment, GitHub, Agent.
- Show inline validation for missing base URL and a save confirmation state.

## Project Structure

- `src/context/SettingsContext.jsx` for settings state and panel controls
- `src/components/Settings/` for panel UI and styles
- `src/services/openai.js` and `src/services/storage.js` for persistence and initialization updates
- `src/components/Layout/Layout.jsx`, `src/components/Sidebar/Sidebar.jsx`, and `src/components/TopBar/TopBar.jsx` for wiring entry points
