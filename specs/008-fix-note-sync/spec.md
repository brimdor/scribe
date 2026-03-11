# Feature Specification: Reliable Note Sync and Tool Routing

**Feature Branch**: `008-fix-note-sync`  
**Created**: 2026-03-11  
**Status**: Draft  
**Input**: User description: "There are several issues now with the chat environment and how the Model uses all the tools available. ... make certain the Agent is able to do anything it needs within Scribe to achieve all note related tasks, including the ability to save the notes in their proper folder in the repo, named with a specific title format, in markdowns only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sync notes from OpenAI sign-in sessions (Priority: P1)

As a user connected through OpenAI sign-in, I can ask Scribe to sync the current note and have Scribe save, commit, and push the note instead of only generating a text response.

**Why this priority**: Sync is broken for a primary connection path, so core product value is lost.

**Independent Test**: Use a structured save-note prompt while the app is in OAuth mode and verify the note save tool runs and returns a published result.

**Acceptance Scenarios**:

1. **Given** an active OpenAI OAuth session and a structured save-note prompt, **When** the user asks Scribe to sync the note, **Then** Scribe saves the note, creates a commit, pushes to `origin/main`, and reports the published commit.
2. **Given** an active OpenAI OAuth session and the repository save tool fails, **When** the user asks Scribe to sync the note, **Then** Scribe clearly reports that sync failed and does not claim the note was published.

---

### User Story 2 - Save notes into the repository's expected top-level folders (Priority: P2)

As a user with an Obsidian-style vault, I want synced notes to land in the vault's existing top-level directories so Scribe uses the expected organization.

**Why this priority**: A successful commit is still incorrect if the note lands in the wrong folder.

**Independent Test**: Save a note whose requested path starts with a generic folder like `Notes/` and verify Scribe remaps it to an existing vault folder such as `Inbox/` before publishing.

**Acceptance Scenarios**:

1. **Given** a repository with `Inbox/` and no `Notes/` folder, **When** Scribe syncs a note targeted at `Notes/example.md`, **Then** Scribe saves and publishes the note at `Inbox/example.md`.
2. **Given** a repository with `Resources/` and no `Research/` folder, **When** Scribe syncs a note targeted at `Research/example.md`, **Then** Scribe saves and publishes the note at `Resources/example.md`.

---

### User Story 3 - Normalize saved note filenames and formats (Priority: P2)

As a user, I want synced notes to be saved as markdown files with deterministic title-based filenames so the vault stays organized and predictable.

**Why this priority**: A sync flow is still unreliable if it creates the wrong file type or inconsistent filenames.

**Independent Test**: Save a note with a loose or invalid filename hint and verify Scribe publishes the note as a `.md` file using the canonical title format.

**Acceptance Scenarios**:

1. **Given** a note titled `Sprint Review Notes`, **When** Scribe syncs it with a weak filename hint, **Then** the final published file name is `sprint-review-notes.md` in the resolved note folder.
2. **Given** a non-markdown requested path such as `Projects/draft.txt`, **When** Scribe attempts to sync the note, **Then** the save flow either canonicalizes it to a markdown note path before publish or rejects it without claiming success.

---

### User Story 4 - Move and delete existing notes through grounded tools (Priority: P2)

As a user, I want Scribe to move, rename, and delete repository notes through grounded tools so existing notes can be managed without dropping to manual git/file work.

**Why this priority**: Note workflows are incomplete if Scribe can only create notes but cannot safely manage them afterward.

**Independent Test**: Move a markdown note to a new requested location and delete another markdown note, then verify both actions publish through the repository pipeline.

**Acceptance Scenarios**:

1. **Given** an existing markdown note, **When** Scribe renames or moves it, **Then** Scribe resolves the destination to the canonical markdown note path, commits the change, and pushes it to `origin/main`.
2. **Given** an existing markdown note, **When** Scribe deletes it, **Then** Scribe stages the deletion, commits it, pushes it, and reports success only after remote verification.

---

### Edge Cases

- What happens when the requested save path already points to an existing repository folder? The path should remain unchanged.
- How does the system handle a save request when no alias folder exists? It should keep the original requested path.
- How does the system handle a publish failure after writing the file? It should report sync failure and avoid claiming success.
- What happens when the model or UI provides a non-markdown note path? The note must not be published as a non-markdown file.
- What happens when the requested filename conflicts with the note title format? The saved filename should be normalized to the canonical title-based markdown filename.
- What happens when a note move request uses a loose destination hint such as `Notes/draft.txt`? The final moved path should still resolve to a canonical markdown note path.
- What happens when a note deletion is published with selected file paths only? The publish step must still stage the deletion correctly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST execute the note save-and-publish tool path for structured note sync requests in both manual-provider and OpenAI OAuth chat flows.
- **FR-002**: System MUST return a success response only when the note file is written, committed, and pushed successfully.
- **FR-003**: System MUST return a failure response when note save or publish fails and MUST NOT claim sync succeeded.
- **FR-004**: System MUST preserve explicitly requested repository paths when their top-level folder already exists in the linked repository.
- **FR-005**: System MUST remap generic note folders to matching existing top-level repository folders when a known alias is available.
- **FR-006**: System MUST save synced notes as markdown files only.
- **FR-007**: System MUST normalize synced note filenames to the project's canonical title-based markdown format, except for schemas that require date-based filenames.
- **FR-008**: System MUST route OAuth note and repository tasks through the shared Scribe tool suite when grounded tool results are needed for the answer.
- **FR-009**: System MUST support grounded move/rename and delete workflows for markdown notes in the assigned repository.
- **FR-010**: System MUST stage note deletions and note moves correctly during repository publish operations.

### Key Entities *(include if feature involves data)*

- **Structured Save Request**: The parsed sync instruction containing the repository path, commit message, and markdown note content.
- **Resolved Publish Path**: The final repository-relative path chosen for the file write after checking existing top-level folders.
- **Published Note Result**: The save and publish response containing the final file path, commit SHA, and remote verification state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Structured note sync requests complete the save/commit/push flow in both provider modes without requiring the model to improvise the workflow.
- **SC-002**: Repositories that use `Inbox` or `Resources` receive synced notes in those existing folders when generic aliases are requested.
- **SC-003**: Automated tests cover OAuth sync execution and repository folder remapping for note publishing.
- **SC-004**: Automated tests verify markdown-only note publishing and canonical title-based filename normalization.
- **SC-005**: Automated tests verify OAuth note/repository questions can execute shared Scribe tools and return grounded answers without falling back to freeform claims.
- **SC-006**: Automated tests verify markdown note move/rename and delete workflows publish through the shared repository pipeline.
- **SC-007**: Browser-driven E2E automation verifies login, note generation, publish-note interaction, and OAuth tool-routed note answers in the real UI.
