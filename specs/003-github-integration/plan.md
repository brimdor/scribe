# Implementation Plan: GitHub Integration Improvements

## 1. Goal Description
The objective is to improve the GitHub integration in Scribe by adding username validation to the login page, dynamically loading organizations and repositories in the settings panel via dropdowns (rather than plain text inputs), persisting these selections, and cleaning up redundant UI elements in both the GitHub and OpenAI settings sections.

## 2. Technical Context
- **Language/Version**: React (JavaScript), Vite
- **Primary Dependencies**: `@octokit/rest` for GitHub API
- **Storage**: IndexedDB (via `idb`) / LocalStorage via existing `services/storage.js` and `services/auth.js`
- **Testing framework**: Vitest
- **Target Platform**: Web
- **Project Type**: Web Application
- **Project Structure**: Single Project (src/components, src/context, src/services)

## 3. Proposed Changes

### `src/components/Auth/LoginPage.jsx`
- **[MODIFY]**: Add a new input field for the GitHub Username.
- **[MODIFY]**: Require both username and the Personal Access Token (PAT) to be filled before submission.
- **[MODIFY]**: Update the `login` function call to accept the username if needed for context (though the PAT inherently returns the user).

### `src/context/AuthContext.jsx` & `src/services/auth.js`
- **[MODIFY]**: Update `login` signature to process the provided username (e.g., storing it or validating it against the fetched user data).

### `src/services/github.js`
- **[MODIFY]**: Expose new utility functions to fetch the authenticated user's repositories and the repositories of organizations they belong to (`getOrgs`, `getRepos`).

### `src/components/Settings/SettingsPanel.jsx`
- **[MODIFY]**: In the GitHub section, replace the text inputs for "Default owner or org" and "Default repository" with dynamic `<select>` dropdowns.
- **[MODIFY]**: Implement `useEffect` hooks to fetch owners/orgs on mount, and appropriate repositories when an owner is selected.
- **[MODIFY]**: Remove the "Signed in as" and "Selected repository" read-only text displays.
- **[MODIFY]**: Add a "Connected" / "Disconnected" badge for the GitHub section, similar to the existing OpenAI badge.
- **[MODIFY]**: In the OpenAI section, remove the redundant text status below the "Connect OpenAI" button, retaining only the color-coded badge to the right of the button.

## 4. Verification Plan

### Automated Tests
- Identify existing Vitest tests. Update any login or settings component tests that mock the form submission to include the `username` field.
- Run `npm run test` to ensure no existing tests break.

### Manual Verification
1. Run `npm run dev` and open the app in the browser.
2. Go to the initial login screen. Verify that both Username and Token inputs are present and required.
3. Upon logging in, open the Settings panel.
4. Verify the GitHub section shows a "Connected" badge.
5. Verify the "Signed in as" and "Selected repository" info blocks are removed.
6. Check the "Default owner or org" dropdown. It should contain the user's own handle and any orgs they belong to.
7. Select an owner and observe the "Default repository" dropdown populating with the corresponding repos.
8. Save settings, reload the page, and open settings again to verify the selected dropdown values persisted.
9. Check the OpenAI section and verify the secondary text status under the sign-in button is removed.
