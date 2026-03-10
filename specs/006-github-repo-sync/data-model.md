# Data Model: GitHub Repository Sync Automation

## Entity: RepositoryAssignment
- **Source**: Existing settings keys (`githubOwner`, `githubRepo`) in per-user settings storage.
- **Fields**:
  - `userId` (string, required)
  - `githubOwner` (string, required for sync)
  - `githubRepo` (string, required for sync)
- **Validation**:
  - Owner/repo must be non-empty for sync execution.
  - Owner/repo path segments must be sanitized for filesystem safety.

## Entity: SyncTargetPath
- **Purpose**: Local filesystem destination for assigned repository.
- **Fields**:
  - `syncRoot` (absolute path)
  - `username` (GitHub login, sanitized)
  - `repoName` (repository name, sanitized)
  - `absoluteRepoPath` (absolute path `<syncRoot>/<username>/<repoName>`)
- **Validation**:
  - Path must stay within configured sync root.
  - Existing target must either be missing or valid git checkout.

## Entity: RepoSyncResult
- **Purpose**: Structured response for login/settings/manual/assistant sync operations.
- **Fields**:
  - `status` (`cloned` | `pulled` | `skipped`)
  - `reason` (e.g., `login`, `settings-change`, `manual-sync`, `assistant-tool`)
  - `owner` (string)
  - `repo` (string)
  - `username` (string)
  - `localPath` (workspace-relative path)
  - `message` (optional human-readable status)
- **State Transitions**:
  - `skipped` when no repo is configured.
  - `cloned` on first successful checkout creation.
  - `pulled` on successful update of existing checkout.
