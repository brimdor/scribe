# Implementation Tasks: GitHub Integration Improvements

## Phase 1: Foundational
- [ ] T1.1 [US1] `src/services/github.js`: Add `getOrgs` utility function.
- [ ] T1.2 [US2] `src/services/github.js`: Add `getRepos(owner)` utility function.
- [ ] T1.3 [US1] `src/context/AuthContext.jsx`: Update `login` method to accept and process the `username` parameter or validate it against the fetched user data.

## Phase 2: User Stories (P1: GitHub Authentication)
- [ ] T2.1 [US1] `src/components/Auth/LoginPage.jsx`: Add input field for GitHub Username.
- [ ] T2.2 [US1] `src/components/Auth/LoginPage.jsx`: Add validation to require both Username and Personal Access Token before form submission.
- [ ] T2.3 [US1] `src/components/Auth/LoginPage.jsx`: Pass both credentials to the `login` function.

## Phase 3: User Stories (P1: Owner and Repository Selection & Persistence)
- [ ] T3.1 [US2] `src/components/Settings/SettingsPanel.jsx`: Replace "Default owner or org" text input with a `<select>` dropdown populated via `getOrgs` (and the user's own login).
- [ ] T3.2 [US2] `src/components/Settings/SettingsPanel.jsx`: Replace "Default repository" text input with a `<select>` dropdown populated via `getRepos(selectedOwner)`.
- [ ] T3.3 [US3] `src/components/Settings/SettingsPanel.jsx`: Implement `useEffect` to fetch and populate these dropdowns on mount and when `githubOwner` changes.
- [ ] T3.4 [US3] `src/components/Settings/SettingsPanel.jsx`: Ensure selected values correctly update the form state and are saved to context/storage upon submission.

## Phase 4: User Stories (P2: Clean UI for Settings)
- [ ] T4.1 [US4] `src/components/Settings/SettingsPanel.jsx`: Remove "Signed in as" and "Selected repository" text blocks from the GitHub settings section.
- [ ] T4.2 [US4] `src/components/Settings/SettingsPanel.jsx`: Add a "Connected" / "Disconnected" badge to the GitHub section, styled like the OpenAI badge.
- [ ] T4.3 [US5] `src/components/Settings/SettingsPanel.jsx`: Remove the redundant text-based connection status below the "Connect OpenAI" button.

## Final Phase: Polish
- [ ] T5.1 Run all tests (`npm run test`) to verify changes haven't broken existing behavior.
- [ ] T5.2 Perform manual browser testing of the authentication and settings flow.
