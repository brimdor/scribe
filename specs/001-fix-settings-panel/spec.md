# Feature Specification: Settings Panel and Integrations

**Feature Branch**: `001-fix-settings-panel`
**Created**: 2026-03-10
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - Open and use settings from the app (P1)

As an authenticated user, I want the Settings entry points to open a usable settings panel so I can configure Scribe without leaving the app.

**Why this priority**: The current Settings affordance appears interactive but does nothing, blocking all configuration work.

**Independent Test**: From both the sidebar and user menu, open Settings, close it, and confirm the panel is usable on desktop and mobile.

**Acceptance Scenarios**:

1. Given I am in the app, when I click Settings in the sidebar, then a settings panel opens.
2. Given I am in the app, when I click Settings in the user menu, then the same settings panel opens.
3. Given the settings panel is open, when I close it with the close control or overlay, then I return to the current app state.

### User Story 2 - Configure environment and AI agent access (P1)

As a user, I want to configure the environment and an OpenAI API compatible agent so note generation can run against hosted or local providers.

**Why this priority**: AI note generation depends on configurable endpoint details, especially for non-default providers.

**Independent Test**: Save settings with a required base URL, optional API key, and optional model, reload the app, and confirm the agent initializes correctly.

**Acceptance Scenarios**:

1. Given the settings panel is open, when I enter an agent base URL and save, then the setting persists.
2. Given I leave the agent API key blank, when I save, then the app stores and uses the default key `1234`.
3. Given the agent base URL is blank, when I try to save, then I am blocked with a clear validation error.
4. Given valid agent settings were saved earlier, when I reopen the app, then the agent is ready without re-entering values.

### User Story 3 - Configure GitHub integration defaults (P2)

As a user, I want a dedicated GitHub section in Settings so I can review and update repository-related configuration without using the login screen only.

**Why this priority**: GitHub is a core integration and should be manageable from the main application settings.

**Independent Test**: Open Settings, review GitHub values, update supported fields, save them, and confirm they persist.

**Acceptance Scenarios**:

1. Given I have connected GitHub, when I open Settings, then I can see GitHub configuration fields and current values.
2. Given I update a supported GitHub configuration field and save, when I reopen Settings, then the saved value is shown.

## Requirements

### Functional Requirements

- FR-001: The application MUST open a settings panel from every visible Settings trigger in the authenticated experience.
- FR-002: The settings panel MUST provide sections for environment, GitHub integration, and OpenAI API compatible agent configuration.
- FR-003: The settings panel MUST require an agent base URL before allowing settings to be saved.
- FR-004: The settings panel MUST allow the agent API key field to be empty in the UI.
- FR-005: When the user leaves the agent API key empty, the application MUST use `1234` as the effective API key for agent initialization and requests.
- FR-006: The application MUST persist settings locally so they remain available after reload.
- FR-007: The application MUST initialize the OpenAI-compatible client from saved settings during normal app use.
- FR-008: The settings panel MUST allow the user to review and update GitHub-related configuration items needed by the environment.
- FR-009: The settings panel MUST show clear success or validation feedback when saving settings.
- FR-010: The settings panel MUST remain usable on both desktop and mobile layouts.

### Key Entities

- App settings
- GitHub settings
- Agent settings

## Success Criteria

- Users can open Settings from all existing Settings entry points with no dead clicks.
- Users can save a valid OpenAI-compatible configuration in under 1 minute.
- Blank agent base URLs are rejected every time with visible feedback.
- Blank agent API keys still allow successful local configuration by using fallback key `1234`.
- Saved settings remain available after page reload.
