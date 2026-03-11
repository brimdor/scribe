# Project Constitution

**Version**: 1.3.0
**Ratified**: 2026-03-10
**Last Amended**: 2026-03-10

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
- `src/services/agent-tools.js`: Shared agent tool registry and manual-provider tool orchestration for repository-aware assistance (Added: 2026-03-10, Feature: 007)

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
- `GET /api/github/issues|pulls`: Load open GitHub collaboration items for the assigned repository (Added: 2026-03-10)

### Data Models
- `users`: Authoritative user identity and encrypted credential/profile storage (Added: 2026-03-10)
- `sessions`: Authenticated browser session tracking (Added: 2026-03-10)
- `settings`, `threads`, `messages`, `schemas`: User-owned relational content tables (Added: 2026-03-10)

## Testing Standards

- Unit/service tests required for storage normalization and middleware behavior.
- Integration coverage required for security-critical middleware and auth/storage workflows.
- Repository sync trigger behavior should be covered by service-level tests when assistant/tooling behavior changes.
- Agent tool registry changes should be covered by frontend service tests and backend repository safety tests.
- Build and test commands must pass before completion.

## Code Patterns

### Established Patterns
- Shared agent tool definitions belong in `src/services/agent-tools.js` and should be consumed by provider adapters instead of duplicating schemas per provider.
- Repository tooling must flow through authenticated backend routes and `resolveAssignedRepoForUser` so all file and git access stays user-scoped.

## Governance

### Amendment Process
Constitution changes require explicit discussion and semantic version updates.

### Compliance Review
Specs, plans, tasks, and implementation changes must be reviewed for constitution alignment.
