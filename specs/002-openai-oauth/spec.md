# Feature Specification: OpenAI OAuth Sign-In

**Feature Branch**: `002-openai-oauth`
**Created**: 2026-03-10
**Status**: Draft
**Input**: User description: "Add OpenAI OAuth capability. To be able to login and not have to use an API Key for OpenAI specifically. This feature exists in many other applications I've experienced. It provides a link, you access the link, signin and approve the oauth, then the resulting url is provided back to the application (Scribe) and it uses this data to get the token. Not sure all the technical details in between, but this is the user experience. If we can clean up the experience to be simpler, that is preferred."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect OpenAI without manually copying an API key (Priority: P1)

As a user who wants to use OpenAI directly, I want Scribe to guide me through an OpenAI sign-in flow so I can connect my account without manually creating and pasting an API key.

**Why this priority**: This is the primary request and removes the main setup friction for OpenAI users.

**Independent Test**: Can be fully tested by starting from an unconfigured OpenAI connection, launching the OpenAI sign-in flow, completing approval, and confirming Scribe returns authenticated and ready to use OpenAI.

**Acceptance Scenarios**:

1. **Given** Scribe is not connected to OpenAI, **When** I choose the OpenAI sign-in action, **Then** Scribe gives me a clear authorization path that starts the OAuth flow.
2. **Given** I complete OpenAI approval successfully, **When** Scribe receives the completion data, **Then** Scribe stores the resulting session details and marks OpenAI as connected.
3. **Given** OpenAI is connected through OAuth, **When** I send a chat request, **Then** Scribe uses the OAuth-backed OpenAI access instead of requiring a manually entered OpenAI API key.

---

### User Story 2 - Complete the connection with a simple callback experience (Priority: P1)

As a user in the middle of authentication, I want the return step to be obvious and low-effort so I can finish setup without guessing what to paste or where to go next.

**Why this priority**: The request explicitly calls out link-based approval and returning the resulting URL, with a preference for an even simpler experience.

**Independent Test**: Can be fully tested by launching the flow, returning from OpenAI, and confirming the completion step succeeds from the app UI with clear instructions and feedback.

**Acceptance Scenarios**:

1. **Given** Scribe launches the OpenAI approval flow, **When** I return from the browser approval step, **Then** Scribe either completes the connection automatically or shows a single clear place to finish it.
2. **Given** the callback data is invalid, expired, or incomplete, **When** I try to finish setup, **Then** Scribe rejects it with actionable guidance and keeps the previous configuration unchanged.
3. **Given** I cancel the OpenAI approval step, **When** I return to Scribe, **Then** Scribe leaves OpenAI disconnected and explains how to retry.

---

### User Story 3 - Manage OpenAI OAuth alongside existing provider settings (Priority: P2)

As a user who may switch between OpenAI and other OpenAI-compatible providers, I want Scribe to clearly separate OpenAI OAuth from manual provider configuration so I can understand which connection method is active.

**Why this priority**: Scribe already supports custom OpenAI-compatible endpoints, so the new flow must not make non-OpenAI providers confusing or unusable.

**Independent Test**: Can be fully tested by viewing Settings, connecting OpenAI with OAuth, disconnecting it, and confirming manual provider settings remain available for non-OpenAI use.

**Acceptance Scenarios**:

1. **Given** I open Settings, **When** OpenAI OAuth is available, **Then** I can see whether OpenAI is connected, disconnected, or mid-setup.
2. **Given** I previously connected OpenAI with OAuth, **When** I disconnect it, **Then** Scribe removes the stored OpenAI OAuth session and shows that manual configuration is required again.
3. **Given** I want to use a non-OpenAI compatible provider, **When** I view the agent settings, **Then** the manual base URL and API key workflow is still available.

---

### Edge Cases

- What happens if the OAuth approval is completed in a different tab or window? Scribe recognizes the completion when the user returns and does not require re-entering unrelated settings.
- What happens if the returned callback data is pasted twice or reused after completion? Scribe rejects the duplicate or expired completion safely and keeps the existing valid connection state.
- What happens if the user is already connected through OAuth and starts the flow again? Scribe makes it clear whether the new flow will replace the existing OpenAI session.
- What happens if OpenAI OAuth is unavailable or fails during token exchange? Scribe shows a clear failure state and leaves manual provider configuration intact.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST provide a dedicated OpenAI OAuth connection path for users who want to use OpenAI directly without manually entering an OpenAI API key.
- **FR-002**: The application MUST present clear step-by-step guidance for starting and completing the OpenAI OAuth flow.
- **FR-003**: The application MUST support completing the OpenAI OAuth flow from returned authorization data, whether the handoff is automatic or requires a single explicit user action.
- **FR-004**: The application MUST persist the resulting OpenAI OAuth session data locally so the user does not need to reconnect on every reload until the session is no longer valid.
- **FR-005**: When an OpenAI OAuth session is active, the application MUST use it for OpenAI requests instead of requiring a manually entered OpenAI API key.
- **FR-006**: The application MUST clearly indicate the current OpenAI connection state, including disconnected, connecting, connected, and failed states.
- **FR-007**: The application MUST allow the user to disconnect the stored OpenAI OAuth session from the settings experience.
- **FR-008**: The application MUST preserve the existing manual configuration workflow for non-OpenAI OpenAI-compatible providers.
- **FR-009**: The application MUST not overwrite or discard existing manual provider settings when OpenAI OAuth succeeds, fails, or is disconnected.
- **FR-010**: The application MUST provide actionable error feedback for canceled approvals, expired or invalid callback data, and failed token exchange attempts.
- **FR-011**: The application MUST prevent chat requests from silently failing when OpenAI OAuth is required but unavailable, and MUST direct the user to reconnect or switch configuration.
- **FR-012**: The application MUST keep the OpenAI OAuth setup and management experience usable on desktop and mobile layouts.
- **FR-013**: The application MUST hide the Base URL and API key fields in the settings when the "OpenAI sign-in" connection mode is selected.
- **FR-014**: The application MUST provide a dropdown or datalist of common OpenAI models instead of requiring the user to type the model name manually.

### Key Entities *(include if feature involves data)*

- **OpenAI OAuth Session**: The locally stored connection state for OpenAI access, including status, completion metadata, and the data needed to continue using or refresh the authorized OpenAI session.
- **OpenAI Connection Method**: The active way Scribe talks to an AI provider, distinguishing between OpenAI OAuth and manual OpenAI-compatible configuration.
- **OAuth Completion State**: The temporary state that tracks a started-but-not-finished OpenAI authorization flow so Scribe can validate and finish the return step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In manual verification, a new user can connect Scribe to OpenAI from the settings flow without manually copying an OpenAI API key.
- **SC-002**: In manual verification, the OpenAI OAuth connection can be completed with no more than one manual copy/paste step after approval, and preferably zero when automatic return succeeds.
- **SC-003**: In automated and manual verification, canceled, invalid, and expired OAuth completion attempts always produce visible recovery guidance without corrupting existing settings.
- **SC-004**: In manual verification, users can disconnect OpenAI OAuth and still access the existing manual OpenAI-compatible provider configuration flow.
