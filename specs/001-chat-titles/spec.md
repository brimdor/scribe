# Feature Specification: Chat Titles

**Feature Branch**: `001-chat-titles`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: User description: "Chat Titles; new chats should autogenerate titles from the AI after the first message sent. Base the chat title on the initial user prompt. After that, the user can also edit the chat title anytime using an edit button (pencil) when hovering over the chat title on the left side panel."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-title new chats (Priority: P1)

As a user, I want a new conversation to receive a descriptive title after I send the first message so I can identify it later without seeing a generic placeholder.

**Why this priority**: This is the primary value of the request and improves every new conversation immediately.

**Independent Test**: Can be fully tested by starting a new chat, sending the first prompt, and verifying the sidebar title changes from a placeholder to a prompt-based title.

**Acceptance Scenarios**:

1. **Given** a new unsaved chat with no previous messages, **When** the user sends the first message and the assistant response completes, **Then** the chat title is updated to an AI-generated short title based on that first prompt.
2. **Given** a new chat where AI title generation fails or is unavailable, **When** the first message is sent, **Then** the chat title falls back to a readable shortened version of the first prompt instead of staying as a generic placeholder.
3. **Given** an existing chat that already has a title, **When** the user sends more messages, **Then** the system does not replace the existing title automatically.

---

### User Story 2 - Rename chat from the sidebar (Priority: P2)

As a user, I want to rename a chat directly from the left sidebar so I can make titles clearer after the conversation evolves.

**Why this priority**: Manual control is the secondary requirement and lets users override or improve the generated title.

**Independent Test**: Can be fully tested by hovering a sidebar item, clicking the pencil button, changing the title, and verifying the new title persists in the list.

**Acceptance Scenarios**:

1. **Given** a thread shown in the sidebar, **When** the user hovers the row, **Then** an edit button is available alongside the other thread actions.
2. **Given** a thread in rename mode, **When** the user saves a non-empty title, **Then** the sidebar updates immediately and the new title persists for future sessions.
3. **Given** a thread in rename mode, **When** the user cancels or submits only whitespace, **Then** the original title remains unchanged.

---

### Edge Cases

- What happens when the first prompt is very long? The system shortens the fallback title and accepts a concise AI-generated title.
- How does the system handle AI title generation failure? It keeps the thread usable and stores a prompt-based fallback title.
- What happens if the user renames a chat before or after later messages arrive? Manual titles are preserved and are not overwritten by later automatic updates.
- What happens if the user tries to save an empty title? The rename action is rejected and the previous title remains intact.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST create new threads with a temporary placeholder title until the first user message is processed.
- **FR-002**: The system MUST generate a descriptive title for a new thread after the first user message is sent, using the initial user prompt as the source.
- **FR-003**: The system MUST fall back to a shortened version of the initial user prompt if AI-based title generation fails or returns no usable value.
- **FR-004**: The system MUST only auto-generate a title once per thread and MUST NOT replace an existing title on later messages.
- **FR-005**: The system MUST show an edit control for each thread in the sidebar when the user hovers that thread row.
- **FR-006**: Users MUST be able to rename a thread from the sidebar and save the updated title without leaving the current view.
- **FR-007**: The system MUST reject blank renamed titles and preserve the last valid title.
- **FR-008**: The system MUST persist both generated and manually edited titles in thread storage so they survive reloads.

### Key Entities *(include if feature involves data)*

- **Thread**: A saved conversation with an id, title, timestamps, pinned state, and chat messages.
- **Generated Title State**: The rule that a thread title starts as a placeholder, may be replaced once from the first prompt, and may later be manually edited by the user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In manual verification, 100% of newly created chats display a non-placeholder title after the first user message is processed.
- **SC-002**: In manual verification, 100% of rename attempts with valid text update the sidebar title immediately and remain visible after reload.
- **SC-003**: In automated tests, title generation fallback and title preservation behavior are covered for new and existing threads.
- **SC-004**: Users can complete a sidebar rename in one interaction path without navigating away from the active chat.
