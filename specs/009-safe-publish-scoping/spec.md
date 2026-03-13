# Feature Specification: Safe Publish Scoping

**Feature Branch**: `fix/audit-finding-4-publish-scope`  
**Created**: 2026-03-12  
**Status**: Draft  
**Input**: User description: "@codebase-audit-report.html Resolve Finding #4 Only. Run a full end to end test to validate changes work and also validate that all other elements of the application are working as expected."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish only intended note changes (Priority: P1)

As a user publishing a note change, I want Scribe to commit only the file paths created or modified by the current action so unrelated local edits are never swept into the publish commit.

**Why this priority**: Finding #4 is a publish safety issue that can accidentally commit unrelated work.

**Independent Test**: Create unrelated dirty files in the repo checkout, publish a note with explicit target paths, and verify only the requested paths are staged and committed.

**Acceptance Scenarios**:

1. **Given** the local checkout contains unrelated dirty files, **When** Scribe publishes a note with an explicit file path list, **Then** only those explicit paths are staged and committed.
2. **Given** a publish request does not include explicit file paths, **When** Scribe attempts to publish, **Then** Scribe rejects the publish instead of staging the entire working tree.
3. **Given** a publish request includes explicit file paths and unrelated dirty files are present elsewhere, **When** Scribe publishes, **Then** the publish succeeds without staging or committing the unrelated files.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST require at least one explicit repository-relative path for publish operations.
- **FR-002**: System MUST stage only the explicit publish paths provided for the current action.
- **FR-003**: System MUST NOT fall back to staging the entire working tree when no explicit publish paths are supplied.
- **FR-004**: System MUST preserve support for staging deletions and renames when the affected paths are explicitly supplied.
- **FR-005**: System MUST surface a clear publish error when the caller omits explicit publish paths.
- **FR-006**: System MUST keep note save, move, and delete flows compatible by passing their explicit changed paths into publish.

### Key Entities *(include if feature involves data)*

- **Explicit Publish Path List**: The repository-relative paths the current action is allowed to stage.
- **Publish Scope Violation**: A publish attempt missing explicit paths and therefore rejected before staging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Backend publish logic never runs `git add -A` without explicit file paths.
- **SC-002**: Automated tests cover explicit-path publish, missing-path rejection, and deletion/rename compatibility.
- **SC-003**: End-to-end validation passes after the change, demonstrating the application still works as expected.
