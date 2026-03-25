# Project Constitution

**Version**: 1.5.0
**Ratified**: 2026-03-10
**Last Amended**: 2026-03-11

## Core Principles

### I. Spec-First Development
All features must be specified before implementation begins.

**Compliance**: Every implementation change maps to an approved feature spec.

### II. Test-Driven Quality
Critical behavior must be covered by repeatable automated tests.

**Compliance**: Minimum 80% coverage target for core code and passing CI test suite before merge.

### III. Security by Default
Sensitive data must be encrypted at rest, transported securely, and protected by explicit auth boundaries.

**Compliance**: Auth/session checks, encryption helpers, and transport enforcement are required for persistent data paths.

### IV. Iterative Refinement
Work proceeds through specification, planning, tasking, implementation, and validation phases.

**Compliance**: No feature bypasses phase gates.

### V. Documentation as Code
Feature docs and architecture artifacts are first-class deliverables.

**Compliance**: Each feature updates specs, plans, tasks, and test reports alongside code.

## Project Capabilities

### Services
- `server/src/services/user-store.js`: User/session persistence and PAT rotation handling (Added: 2026-03-10, Feature: 004)
- `server/src/services/storage-store.js`: User-scoped settings/thread/message/schema storage via SQLite (Added: 2026-03-10, Feature: 004)
- `server/src/services/github-auth.js`: GitHub PAT validation and repo-scope enforcement (Added: 2026-03-10, Feature: 004)
- `server/src/services/github-repo-sync.js`: User-scoped clone/pull orchestration for configured GitHub repositories (Added: 2026-03-10, Feature: 006)
- `server/src/services/github-repo-files.js`: Safe local repository tree/read/search/write and git inspection helpers for the assigned checkout (Added: 2026-03-10, Feature: 007)
- `src/services/agent-tools.js`: Shared agent tool registry and provider-agnostic tool metadata for repository-aware assistance, including grounded note save/move/delete workflows (Added: 2026-03-10, Updated: 2026-03-11, Feature: 007/008)
- `src/services/openai.js`: Manual-provider orchestration plus OAuth tool routing and direct note-publish fallback for grounded note workflows; injects agent context into system prompt (Added: 2026-03-10, Updated: 2026-03-11, Feature: 008/009)
- `src/utils/note-publish.js`: Shared note-save contract for markdown-only prompts, canonical note paths, and title-based filename normalization (Added: 2026-03-11, Feature: 008)
- `src/services/agent-context.js`: Agent context builder assembling platform purpose, workspace state, tool inventory, and user preferences for prompt injection (Added: 2026-03-11, Feature: 009)
- `src/services/heartbeat.js`: Client-side heartbeat scheduler with configurable intervals, 4-item health checklist (repo_sync, workspace_health, issue_check, activity_summary), 0-5 rating calculation, and result persistence (Added: 2026-03-11, Feature: 009)
- `src/services/openai-oauth.js`: OAuth provider orchestration with Codex Responses API, agent context injection into instructions, model fallback, and streaming tool resolution (Updated: 2026-03-11, Feature: 009)

### API Endpoints
- `POST /api/auth/login`: Authenticate username + PAT and start session (Added: 2026-03-10)
- `GET /api/auth/session`: Resolve active user session (Added: 2026-03-10)
- `POST /api/auth/logout`: End active session (Added: 2026-03-10)
- `GET /api/storage/*`: Read user-scoped persisted data (Added: 2026-03-10)
- `POST|PUT|PATCH|DELETE /api/storage/*`: Mutate user-scoped persisted data (Added: 2026-03-10)
- `GET /api/github/orgs|repos|user`: Backend-proxied GitHub access using stored PAT (Added: 2026-03-10)
- `POST /api/github/sync`: Clone/pull assigned repository into user-scoped local workspace (Added: 2026-03-10)
- `GET /api/github/repo/tree|file|search|git/*`: Inspect the synced local repository for agent tools and UI flows (Added: 2026-03-10)
- `PUT /api/github/repo/file`: Write UTF-8 text files inside the synced local repository (Added: 2026-03-10)
- `POST /api/github/publish`: Stage, commit, push, and verify repository publishes for note sync and repository edits (Added: 2026-03-10)
- `GET /api/github/issues|pulls`: Load open GitHub collaboration items for the assigned repository (Added: 2026-03-10)
- `GET /api/agent/workspace-state`: Return workspace summary (note count, repo status, tags, directories, recent activity) for agent context injection (Added: 2026-03-11, Feature: 009)
- `GET /api/storage/heartbeats`: List heartbeat execution history with limit/offset pagination (Added: 2026-03-11, Feature: 009)
- `POST /api/storage/heartbeats`: Persist a heartbeat execution result with checklist, rating, and timestamps (Added: 2026-03-11, Feature: 009)

### Data Models
- `users`: Authoritative user identity and encrypted credential/profile storage (Added: 2026-03-10)
- `sessions`: Authenticated browser session tracking (Added: 2026-03-10)
- `settings`, `threads`, `messages`, `schemas`: User-owned relational content tables (Added: 2026-03-10)
- `heartbeat_executions`: Heartbeat execution history with checklist JSON, rating, status, and timestamps (Added: 2026-03-11, Feature: 009)

## Testing Standards

- Unit/service tests required for storage normalization and middleware behavior.
- Integration coverage required for security-critical middleware and auth/storage workflows.
- Repository sync trigger behavior should be covered by service-level tests when assistant/tooling behavior changes.
- Agent tool registry changes should be covered by frontend service tests and backend repository safety tests.
- Note publishing changes should be covered across shared note utilities, provider adapters, and repository publish services.
- OAuth note/repository routing changes should include workflow-level tests that exercise prompt generation, tool execution, and grounded publish/reporting behavior together.
- Note lifecycle operations beyond creation, including move/delete, should be covered by repeatable service tests before release.
- Heartbeat scheduler and execution lifecycle should be covered by unit tests verifying start/stop, concurrent rejection, state notifications, and rating calculation.
- Agent context assembly should be covered by unit tests verifying workspace fetch fallbacks, preferences fetch resilience, tool inventory mapping, and prompt formatting.
- All test categories (unit, integration, E2E) must achieve a rating of 4/5 or higher (>= 90% pass rate) as measured by the test report generator.
- High-value UI flows should also add browser automation when the behavior depends on real user interaction, provider routing, or publish actions crossing multiple layers.
- Build and test commands must pass before completion.

## Code Patterns

### Established Patterns
- Shared agent tool definitions belong in `src/services/agent-tools.js` and should be consumed by provider adapters instead of duplicating schemas per provider.
- When provider-native tool calling is unavailable, provider adapters should emulate tool routing against the shared registry rather than dropping note/repository tasks to ungrounded freeform output.
- Repository tooling must flow through authenticated backend routes and `resolveAssignedRepoForUser` so all file and git access stays user-scoped.
- Note-save requests should resolve through shared markdown-only path normalization before repository writes so provider-specific chat flows cannot drift on filename or folder behavior.
- Note move/delete requests should publish through the same verified repository pipeline so Scribe never reports a note mutation as complete without git confirmation.
- Agent context injection should occur in both provider paths (manual and OAuth) to ensure the agent always receives full platform awareness regardless of connection method.
- Heartbeat scheduling runs client-side only while the app is open; there is no server-side cron.
- The heartbeat system uses a configurable interval with a minimum of 5 minutes and produces a quantifiable 0-5 rating from checklist results.
- All interactive UI elements must maintain a minimum 44px touch target and 8px spacing between adjacent targets for touchscreen compatibility.
- Overlay panels (settings, heartbeat) must support three dismissal methods: outside click, Escape key, and close button.

## Governance

### Amendment Process
Constitution changes require explicit discussion and semantic version updates.

### Compliance Review
Specs, plans, tasks, and implementation changes must be reviewed for constitution alignment.
