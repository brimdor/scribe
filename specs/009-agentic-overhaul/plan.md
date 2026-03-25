# Implementation Plan: Agentic AI Overhaul

**Feature**: 009-agentic-overhaul
**Branch**: 009-agentic-overhaul
**Created**: 2026-03-11

---

## Technical Context

| Dimension | Value |
|-----------|-------|
| Language/Version | JavaScript (ESM), Node.js |
| Primary Dependencies | React 18.3.1, Vite 5.4.0, Express 4.21.2, better-sqlite3 11.8.1, openai 4.50.0 |
| Storage | SQLite with AES-256-GCM encryption (better-sqlite3) |
| Testing Framework | Vitest 2.0.0 (unit/integration), Playwright 1.58.2 (E2E) |
| Target Platform | Web browser (desktop + mobile touch) |
| Project Type | Web application (React SPA + Express API) |
| Performance Goals | Context assembly < 500ms, overlay animations < 300ms, heartbeat drift < 10% |
| Constraints | Client-side heartbeat (no server cron), existing auth mechanism unchanged, no new runtime deps unless essential |
| Scale/Scope | Single-user self-hosted application |

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-First Development | COMPLIANT | Feature spec 009 written before implementation |
| II. Test-Driven Quality | COMPLIANT | Exhaustive test suite is a core requirement (US6) |
| III. Security by Default | COMPLIANT | All new settings stored via existing encrypted storage; no new auth surfaces |
| IV. Iterative Refinement | COMPLIANT | Following SDD phase gates |
| V. Documentation as Code | COMPLIANT | Spec, plan, tasks, test reports alongside code |

---

## Architecture Overview

### Changes by Layer

**Frontend (src/):**
1. New `src/services/agent-context.js` — Builds complete agent context (purpose, tools, workspace state, preferences)
2. New `src/services/heartbeat.js` — Client-side heartbeat scheduler and checklist executor
3. Modified `src/services/openai.js` — Inject agent context into every provider call
4. Modified `src/services/openai-oauth.js` — Inject agent context into OAuth provider calls
5. Modified `src/utils/constants.js` — Enhanced system prompt with platform awareness
6. Modified `src/services/storage.js` — New settings keys for heartbeat and agent preferences
7. Modified `src/context/SettingsContext.jsx` — Heartbeat state management, agent preferences
8. New `src/components/Heartbeat/HeartbeatPanel.jsx` — Heartbeat history overlay
9. Modified `src/components/Settings/SettingsPanel.jsx` — Agent section with heartbeat config
10. Modified `src/components/TopBar/TopBar.jsx` — Heartbeat status indicator

**Backend (server/):**
1. Modified `server/src/db/database.js` — V2 migration for heartbeat_executions table
2. Modified `server/src/services/storage-store.js` — CRUD for heartbeat executions
3. Modified `server/src/routes/storage-routes.js` — Heartbeat execution endpoints
4. New `server/src/routes/agent-routes.js` — Workspace state endpoint for agent context

**Tests:**
1. New `src/services/__tests__/agent-context.test.js` — Agent context assembly tests
2. New `src/services/__tests__/heartbeat.test.js` — Heartbeat scheduler tests
3. New `tests/integration/agent-integration.test.js` — Agent integration tests
4. New `tests/integration/heartbeat-flow.test.js` — Heartbeat flow tests
5. Enhanced `tests/e2e/scribe-browser.spec.js` — E2E coverage for new features

---

## Implementation Phases

### Phase 1: Data Model & API (Backend Foundation)
- Add heartbeat_executions table (V2 migration)
- Add workspace state API endpoint
- Add heartbeat execution storage endpoints

### Phase 2: Agent Context System (Core Feature)
- Create agent context builder service
- Enhanced system prompt with platform awareness
- Inject context into both providers (manual + OAuth)

### Phase 3: Heartbeat System (Scheduling + Execution)
- Client-side scheduler with configurable interval
- Heartbeat checklist definition and execution
- Rating calculation and result storage

### Phase 4: Settings & UI (User Configuration)
- Agent section in settings panel with heartbeat config
- Heartbeat history overlay panel
- TopBar heartbeat status indicator
- Touch/mouse compatibility verification

### Phase 5: Testing Suite (Validation)
- Unit tests for agent context and heartbeat
- Integration tests for agent integration and heartbeat flow
- E2E tests for full user journeys
- Test report generation with 0-5 ratings

---

## Project Structure (Additions)

```
src/
├── services/
│   ├── agent-context.js          [NEW] Agent context builder
│   └── heartbeat.js              [NEW] Heartbeat scheduler
│   └── __tests__/
│       ├── agent-context.test.js [NEW] Agent context tests
│       └── heartbeat.test.js     [NEW] Heartbeat tests
├── components/
│   └── Heartbeat/
│       ├── HeartbeatPanel.jsx    [NEW] Heartbeat history overlay
│       └── HeartbeatPanel.css    [NEW] Heartbeat styles
server/
├── src/
│   ├── routes/
│   │   └── agent-routes.js       [NEW] Workspace state endpoint
│   ├── db/
│   │   └── database.js           [MODIFIED] V2 migration
│   └── services/
│       └── storage-store.js      [MODIFIED] Heartbeat CRUD
tests/
├── integration/
│   ├── agent-integration.test.js [NEW] Agent integration tests
│   └── heartbeat-flow.test.js    [NEW] Heartbeat flow tests
└── e2e/
    └── scribe-browser.spec.js    [MODIFIED] Enhanced E2E
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Context assembly too slow | Low | Medium | Cache workspace state, lazy-load heavy data |
| Heartbeat drift in background tabs | Medium | Low | Use `requestAnimationFrame` fallback, document browser throttling |
| Agent context too large for token limits | Medium | High | Implement context truncation, prioritize essential data |
| Settings panel overcrowded | Low | Medium | Use collapsible sections, tabbed layout within agent section |
