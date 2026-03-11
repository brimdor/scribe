# Scribe

Scribe is a local-first AI note workspace with GitHub-backed authentication, encrypted SQLite persistence, synced repository context, and a reusable agent tool suite for repo-aware assistance.

## What Scribe Does

- Authenticate users with GitHub username + personal access token.
- Persist settings, threads, messages, and schemas in a backend SQLite database.
- Support two AI connection modes:
  - OpenAI sign-in (OAuth/device flow)
  - Manual OpenAI-compatible provider endpoint
- Sync one assigned GitHub repository into a user-scoped local checkout.
- Let the assistant inspect repository files, git state, and GitHub issue/PR context.
- Generate notes in structured Markdown with optional schema templates.

## Core Features

### Authentication and sessions

- GitHub identity is validated on login.
- Session cookies are managed by the backend API.
- Stored GitHub credentials are handled server-side and scoped to the authenticated user.

### Note workspace

- Conversation threads and messages are stored in SQLite.
- Built-in note schemas include meeting notes, daily journal, research, and project plan templates.
- Chat responses are designed for Obsidian-friendly Markdown output.
- Assistant note responses now include a `Publish note` chat action that directly saves the current note draft and publishes it to the selected repository.

### Repository sync

- The assigned repository is cloned or pulled into `server/repos/<github-login>/<repo>/`.
- Sync runs automatically on login.
- Sync also runs after repository settings change.
- Users can manually refresh the local checkout from Settings.
- Pull is skipped when local changes would create risk or conflicts.

Important distinction:

- `refresh/sync repository` means pull remote changes into the local checkout.
- `publish notes` means write markdown changes, create a git commit, push to `origin/main`, and verify the remote branch head matches the pushed commit.

### Agent tool suite

Scribe now exposes a reusable tool registry for tool-capable manual models.

Available tool categories:

- `Files`
  - `list_repository_tree`
  - `read_repository_file`
  - `search_repository_files`
  - `write_repository_file`
- `Notes`
  - `list_note_tags`
  - `list_notes`
  - `find_notes_by_tag`
  - `read_note_frontmatter`
  - `save_note_to_repository`
- `Git`
  - `sync_repository` (refresh/pull only)
  - `publish_repository_changes`
  - `get_git_status`
  - `get_git_diff`
  - `get_git_log`
- `GitHub`
  - `list_github_issues`
  - `list_github_pull_requests`

Tooling behavior:

- Tool definitions live in one shared registry: `src/services/agent-tools.js`.
- The manual OpenAI-compatible provider flow resolves tool calls before the final streamed answer.
- OAuth mode keeps repo-aware assistance but does not force the native tool-calling path.
- Tool failures are non-fatal and fall back to the best available context.
- When native tool-calling is weak or unavailable, Scribe now does a best-effort selected-repo knowledge-base lookup for note/repo/file questions.
- The system prompt now explicitly tells the agent that it must use tools for current repo/note/git/GitHub questions when those tools are relevant.
- The system prompt also forbids the agent from claiming a save/commit/push succeeded unless tool results confirm it.

Safety boundaries:

- Repository file access is confined to the assigned local checkout.
- Path traversal is rejected.
- Binary file reads/writes are blocked.
- Destructive git mutations such as push/merge are not exposed through the tool suite.

## Architecture

### Frontend

- React + Vite application in `src/`
- Main workspace layout in `src/components/`
- App state in `src/context/`
- AI, GitHub, storage, and tool orchestration in `src/services/`

### Backend

- Express API in `server/src/`
- SQLite database bootstrap in `server/src/db/`
- Auth, storage, GitHub, and repo tooling routes in `server/src/routes/`
- GitHub auth, repo sync, repo file access, and encrypted persistence services in `server/src/services/`

### Data flow

1. User signs in with GitHub.
2. Backend validates the token and creates a session.
3. Scribe loads persisted settings and optional AI provider state.
4. If a repository is configured, Scribe syncs it locally.
5. Chat requests run through the configured AI provider.
6. Tool-capable manual providers can call the shared repository/GitHub tool suite before the final answer streams to the UI.

## Requirements

- Node.js 18+
- npm 9+
- `git` installed locally
- A GitHub personal access token with repository access for the repos you want to use

## Environment Variables

Set these before starting the API:

```bash
export SCRIBE_DB_PATH="./server/data/scribe.db"
export SCRIBE_DB_ENCRYPTION_KEY="replace-with-a-long-random-secret"
export SCRIBE_SESSION_TTL_HOURS="24"
export SCRIBE_REPO_SYNC_ROOT="./server/repos"
```

Notes:

- `SCRIBE_DB_PATH` controls the SQLite file location.
- `SCRIBE_DB_ENCRYPTION_KEY` is required for secure encrypted persistence outside local throwaway development.
- `SCRIBE_SESSION_TTL_HOURS` controls session lifetime.
- `SCRIBE_REPO_SYNC_ROOT` controls where synced GitHub repositories are stored.

## Local Development

Install dependencies:

```bash
npm install
```

Start the web app and API together:

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8787`

## Using Scribe

### 1. Sign in with GitHub

- Open the app.
- Enter your GitHub username and PAT.
- Scribe validates the token and starts a session.

### 2. Configure repository defaults

- Open Settings.
- Choose a GitHub owner/org and repository.
- Save settings to persist the assignment.
- Use `Sync repository` if you want an immediate refresh.

### 3. Configure the AI provider

#### Option A: OpenAI sign-in

- Choose `OpenAI sign-in` in Settings.
- Complete the device flow.
- Select a model after connection succeeds.

#### Option B: Manual provider

- Choose `OpenAI API manual connection`.
- Set a base URL such as `http://localhost:11434/v1`.
- Optionally set an API key.
- If the provider does not require an API key, Scribe uses `1234` as the fallback value.
- Select a tool-capable model if you want native agent tools.

### 4. Chat with repository context

Examples:

- "Read `README.md` and summarize the setup steps."
- "Search the repo for where OpenAI sign-in is handled."
- "Show me git status before you suggest changes."
- "List open pull requests for this repository."
- "Create `notes/todo.md` with a draft checklist."

## Repository and Tooling Endpoints

Important backend routes include:

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET|PUT|PATCH|DELETE /api/storage/*`
- `GET /api/github/user`
- `GET /api/github/orgs`
- `GET /api/github/repos`
- `POST /api/github/sync`
- `POST /api/github/publish`
- `GET /api/github/repo/tree`
- `GET /api/github/repo/file`
- `PUT /api/github/repo/file`
- `GET /api/github/repo/search`
- `GET /api/github/repo/notes`
- `GET /api/github/repo/notes/by-tag`
- `GET /api/github/repo/note/frontmatter`
- `GET /api/github/repo/note-tags`
- `GET /api/github/repo/git/status`
- `GET /api/github/repo/git/diff`
- `GET /api/github/repo/git/log`
- `GET /api/github/issues`
- `GET /api/github/pulls`

## Project Layout

```text
scribe/
|-- src/
|   |-- components/
|   |-- context/
|   |-- schemas/
|   `-- services/
|-- server/
|   |-- src/
|   |   |-- config/
|   |   |-- db/
|   |   |-- middleware/
|   |   |-- routes/
|   |   `-- services/
|   |-- data/
|   `-- repos/
|-- specs/
`-- tests/
```

## Security Notes

- SQLite payloads are encrypted at rest.
- Non-localhost requests to `/api` require HTTPS.
- Browser persistence is not used for Scribe application data; core app state is served from the backend API.
- Repository operations are user-scoped and path-validated.
- GitHub-backed repo sync never stores the PAT inside a checked-out remote URL.

## Validation Commands

Run these before shipping changes:

```bash
npm run lint
npm run test
npm run build
```

## Current Limitations

- Native tool orchestration is currently wired into the manual OpenAI-compatible provider flow.
- OAuth mode remains repo-aware but does not force native tool calls.
- The tool suite focuses on safe inspection and text-file mutation, not commit/push/merge automation.
- Browser E2E coverage is still limited compared with unit and service-level coverage.

## Related Docs

- Feature specs live in `specs/`
- Recent validation reports live in `tests/reports/`
- Current tool registry lives in `src/services/agent-tools.js`
