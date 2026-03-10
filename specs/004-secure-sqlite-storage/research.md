# Research: Secure SQLite-Centric Persistent Storage

## Centralized persistence model
**Decision**: Introduce a backend API that owns all data persistence, with frontend clients calling authenticated endpoints instead of writing browser storage.
**Rationale**: Cross-device persistence by GitHub username requires a shared backend data store, which browser-local persistence cannot provide.
**Alternatives Considered**: Keeping IndexedDB/sessionStorage and syncing to GitHub was rejected because it violates the requirement to have no browser-local app storage and increases sync conflict complexity.

## SQLite organization for future expansion
**Decision**: Use normalized tables (`users`, `sessions`, `settings`, `threads`, `messages`, `schemas`) with migration support and user foreign keys.
**Rationale**: This provides clear ownership boundaries, easy extensibility, and avoids monolithic serialized blobs that are hard to evolve.
**Alternatives Considered**: A single JSON blob per user was rejected because it is harder to query, version, and scale to new fields/features.

## Encryption at rest approach
**Decision**: Encrypt persisted payload columns using AES-256-GCM with a server-side encryption key sourced from environment configuration.
**Rationale**: Application-layer encryption guarantees encrypted-at-rest payloads even when raw SQLite files are inspected or copied.
**Alternatives Considered**: Relying solely on disk-level encryption was rejected as insufficiently portable and not explicit at the application layer.

## Encryption in transit enforcement
**Decision**: Require HTTPS for non-localhost requests, while allowing localhost HTTP for development workflows.
**Rationale**: Enforces secure transport in deployed environments without breaking local development ergonomics.
**Alternatives Considered**: Hard-requiring HTTPS for localhost was rejected because it creates unnecessary local setup friction.

## PAT capability validation and rotation
**Decision**: On login, validate PAT ownership and required repo read/write capability before issuing/updating a session; replace stored PAT when a new valid token is presented.
**Rationale**: Satisfies rotation requirements while preserving clear failure behavior for insufficient capability tokens.
**Alternatives Considered**: Requiring the old token during rotation was rejected because the requirement explicitly disallows old-token matching.
