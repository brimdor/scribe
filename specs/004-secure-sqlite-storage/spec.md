# Feature Specification: Secure SQLite-Centric Persistent Storage

**Feature Branch**: `004-secure-sqlite-storage`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: User description: "Adjust the storage to be 100% in a sqlite database..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistent user workspace on any device (Priority: P1)

As an authenticated GitHub user, I can log in from any device and access the same Scribe workspace data tied to my username.

**Why this priority**: Cross-device persistence is the core business requirement and must work before any refinements.

**Independent Test**: Log in as the same GitHub username on two separate browsers/devices and verify the same threads, settings, and saved metadata are visible.

**Acceptance Scenarios**:

1. **Given** user A has existing Scribe data, **When** user A logs in from a second device, **Then** user A sees the same previously stored data.
2. **Given** user A and user B both use Scribe, **When** each user logs in, **Then** each user only sees their own data.

---

### User Story 2 - PAT rotation without matching old token (Priority: P1)

As an authenticated GitHub user, I can replace my existing PAT with a different PAT, and the system validates capabilities before accepting it.

**Why this priority**: Credential rotation is a security and operability requirement that must be safe and frictionless.

**Independent Test**: For an existing user, submit a different PAT; verify success when repo read/write access is present and failure with explicit scope guidance when missing.

**Acceptance Scenarios**:

1. **Given** an existing account with stored PAT, **When** user submits a different PAT with repo read/write capability, **Then** the system replaces the old token and login succeeds.
2. **Given** an existing account with stored PAT, **When** user submits a different PAT without repo read/write capability, **Then** login fails with a clear message requiring read/write repo capability.

---

### User Story 3 - Zero browser-resident application storage (Priority: P2)

As a user, I can use Scribe without relying on browser local persistence, so all app state persists centrally in the backend data store.

**Why this priority**: The platform must avoid browser-local storage and rely solely on centralized persisted storage.

**Independent Test**: Inspect runtime behavior and storage APIs in browser dev tools and confirm no application data is written to localStorage, sessionStorage, or IndexedDB.

**Acceptance Scenarios**:

1. **Given** a normal usage session, **When** user creates threads/messages/settings, **Then** no Scribe data is persisted in browser localStorage, sessionStorage, or IndexedDB.
2. **Given** browser cache and site data are cleared, **When** user logs in again, **Then** previously saved Scribe data is still available from centralized storage.

---

### User Story 4 - Encrypted storage and secure transport (Priority: P2)

As a security-conscious user, I need data encrypted at rest and protected in transit.

**Why this priority**: Security constraints are mandatory and apply to all stored application data.

**Independent Test**: Verify persisted records are encrypted in SQLite and network policy enforces HTTPS outside local development.

**Acceptance Scenarios**:

1. **Given** data is written to the database, **When** inspecting raw SQLite rows, **Then** persisted payload values are encrypted and not readable plaintext.
2. **Given** deployment traffic outside localhost development, **When** an insecure request is attempted, **Then** the request is rejected with a clear HTTPS requirement response.

### Edge Cases

- PAT belongs to a different GitHub username than the submitted username.
- PAT is valid for authentication but lacks `repo` read/write capability.
- Existing user record is present but encrypted token cannot be decrypted due to key mismatch.
- Deleting a thread with many messages must remove dependent records consistently.
- Concurrent updates from two devices should not corrupt user-scoped data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist Scribe application data in a centralized SQLite database and MUST NOT use browser localStorage, sessionStorage, or IndexedDB for application data persistence.
- **FR-002**: System MUST maintain a single authoritative user table for user-specific identity and credential metadata, and all user-scoped records MUST reference that user table.
- **FR-003**: System MUST store threads, messages, settings, schemas, auth sessions, and related feature data in separate relational tables designed for future field expansion.
- **FR-004**: System MUST scope all reads and writes by authenticated GitHub username identity so users can access their own persisted data from any device after login.
- **FR-005**: System MUST allow PAT rotation by accepting a different token than the currently stored token, validating required repo read/write capability, and replacing the old token when validation passes.
- **FR-006**: System MUST reject PATs that do not satisfy repo read/write capability validation and MUST return a clear failure message stating that read/write repo capability is required.
- **FR-007**: System MUST verify that the provided GitHub username matches the username associated with the presented PAT.
- **FR-008**: System MUST encrypt persisted database payloads at rest before writing to SQLite.
- **FR-009**: System MUST enforce encrypted transport for non-localhost requests and reject insecure in-transit access attempts with clear guidance.
- **FR-010**: System MUST support backward-compatible database schema evolution so additional fields can be added with migrations rather than destructive rebuilds.

### Key Entities *(include if feature involves data)*

- **User**: Authoritative user identity row keyed by normalized GitHub username and containing encrypted credential/profile metadata.
- **Session**: Authenticated backend session mapped to a user for request-level authorization.
- **Thread**: User-owned conversation metadata, including title and pin status.
- **Message**: User-owned thread message entries linked to a thread.
- **User Setting**: User-owned key/value settings entries for app preferences and integration config.
- **User Schema**: User-owned custom note schema definitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create or update data on one device and observe the same data after logging in with the same GitHub username on a second device.
- **SC-002**: Browser storage inspection during normal usage shows zero Scribe persistence entries in localStorage, sessionStorage, and IndexedDB.
- **SC-003**: PAT rotation succeeds for valid replacement tokens and returns a deterministic error message for insufficient scope tokens.
- **SC-004**: Raw database inspection confirms persisted payload fields are encrypted ciphertext rather than human-readable plaintext.
- **SC-005**: Non-localhost HTTP requests are rejected with an HTTPS-required response, while localhost development remains functional.
