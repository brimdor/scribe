# Specification: GitHub Integration Improvements

## 1. Overview
The current GitHub integration has usability issues regarding authentication inputs, repository selection, and redundant status displays. This feature will improve the GitHub authentication flow, repository selection persistence, and clean up the settings UI to remove redundant information.

## 2. Requirements

### Functional Requirements
- **FR-001**: The GitHub login interface MUST require both a GitHub username and a Personal Access Token (PAT) to authenticate.
- **FR-002**: The application MUST NOT have a hardcoded default owner/organization or default repository.
- **FR-003**: The GitHub settings interface MUST provide a dropdown menu for the user to select the owner/organization.
- **FR-004**: The GitHub settings interface MUST provide a dropdown menu for the user to select a repository, filtered by the selected owner/organization.
- **FR-005**: The selected owner/organization and repository MUST persist in the user's account settings across login sessions.
- **FR-006**: The application MUST NOT display the "Signed in as" and "Selected repository" text elements after initial login, as this information is implied.
- **FR-007**: The GitHub integration section MUST display a connection status ("Connected" or "Disconnected"), styled similarly to the OpenAI sign-in status.
- **FR-008**: The OpenAI settings section MUST remove the redundant text-based sign-in status located below the sign-in button.
- **FR-009**: The OpenAI settings section MUST retain the color-coded sign-in status located to the right of the sign-in button.

### Data Entities
- **GitHub Credentials**: Contains `username` (string) and `personalAccessToken` (string).
- **GitHub Context**: Contains `selectedOwner` (string) and `selectedRepository` (string).

## 3. User Scenarios & Testing

### P1: GitHub Authentication with Username and PAT
- **Given** the user is on the GitHub login/settings page
- **When** the user attempts to connect to GitHub
- **Then** the system must present input fields for both GitHub Username and Personal Access Token
- **And** the system must require both fields to be filled before attempting connection.

### P1: Owner and Repository Selection
- **Given** the user has successfully connected to GitHub
- **When** the user views the GitHub settings
- **Then** the user must see dropdowns to select an Owner/Organization and a Repository
- **And** the available repositories must correspond to the selected Owner/Organization.

### P1: Persistence of GitHub Settings
- **Given** the user has selected an Owner/Organization and Repository
- **When** the user logs out and logs back in (or refreshes the application)
- **Then** the previously selected Owner/Organization and Repository must remain selected without requiring re-entry.

### P2: Clean UI for GitHub Settings
- **Given** the user is viewing the GitHub settings section
- **When** the user is connected to GitHub
- **Then** the UI must display a "Connected" status indicator
- **And** the UI must NOT display redundant "Signed in as" or "Selected repository" text blocks.

### P2: Clean UI for OpenAI Settings
- **Given** the user is viewing the OpenAI settings section
- **When** the integration is either connected or disconnected
- **Then** the UI must display a color-coded status indicator to the right of the sign-in button
- **And** the UI must NOT display a secondary text status below the sign-in button.

## 4. Success Criteria
- Users cannot authenticate to GitHub without explicitly providing their username.
- Users can select their target repository from dynamic dropdowns rather than relying on hardcoded defaults.
- Repository selections survive application restarts and page reloads.
- The settings UI is less cluttered, with exactly one clear connection status indicator per integration (GitHub and OpenAI).
