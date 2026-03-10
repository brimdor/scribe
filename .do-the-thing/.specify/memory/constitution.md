# Project Constitution

**Version**: 1.1.0
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

### API Endpoints
- `POST /api/auth/login`: Authenticate username + PAT and start session (Added: 2026-03-10)
- `GET /api/auth/session`: Resolve active user session (Added: 2026-03-10)
- `POST /api/auth/logout`: End active session (Added: 2026-03-10)
- `GET /api/storage/*`: Read user-scoped persisted data (Added: 2026-03-10)
- `POST|PUT|PATCH|DELETE /api/storage/*`: Mutate user-scoped persisted data (Added: 2026-03-10)
- `GET /api/github/orgs|repos|user`: Backend-proxied GitHub access using stored PAT (Added: 2026-03-10)

### Data Models
- `users`: Authoritative user identity and encrypted credential/profile storage (Added: 2026-03-10)
- `sessions`: Authenticated browser session tracking (Added: 2026-03-10)
- `settings`, `threads`, `messages`, `schemas`: User-owned relational content tables (Added: 2026-03-10)

## Testing Standards

- Unit/service tests required for storage normalization and middleware behavior.
- Integration coverage required for security-critical middleware and auth/storage workflows.
- Build and test commands must pass before completion.

## Governance

### Amendment Process
Constitution changes require explicit discussion and semantic version updates.

### Compliance Review
Specs, plans, tasks, and implementation changes must be reviewed for constitution alignment.
