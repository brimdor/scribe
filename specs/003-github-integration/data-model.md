# Data Model: GitHub Integration Improvements

## Entities
### 1. GitHub Credentials
Represents the user's authentication details for the GitHub API.

**Fields**:
- `username` (string): The user's GitHub username. Added via the login form. Required.
- `personalAccessToken` (string): The user's GitHub Personal Access Token (PAT). Must have `repo` scope. Required.

**Validation Rules**:
- `username` must not be empty or whitespace.
- `personalAccessToken` must not be empty or whitespace.
- Both must be successfully verified against the GitHub API.

### 2. GitHub Context
Represents the user's selected context (owner and repository) where notes will be stored.

**Fields**:
- `selectedOwner` (string): The GitHub login (username or organization name) where the target repository resides.
- `selectedRepository` (string): The name of the target repository within the namespace of the `selectedOwner`.

**Validation Rules**:
- `selectedOwner` must be chosen from the list of the user's accessible organizations/owners.
- `selectedRepository` must be an existing repository under the `selectedOwner` that the user has write access to.

## State Transitions
1. **Unauthenticated** -> **Authenticated**: User submits valid `username` and `personalAccessToken` through `LoginPage`. Upon successful validation via Octokit, the state transitions to Authenticated.
2. **Context Unselected** -> **Context Selected**: Within Settings, the user selects an owner from the populated dropdown. Based on the selected owner, a second dropdown populates with repositories. The user selects a repository, and upon saving, the context sets.
3. **Context Selected** -> **Context Re-selected**: The user changes the `selectedOwner`, which clears or resets the `selectedRepository` until a new valid repository is chosen from the new owner's scope.
