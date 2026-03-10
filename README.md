# Scribe

Scribe is an AI-assisted note-taking app with GitHub-backed authentication and centralized SQLite persistence.

## Development

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

```bash
export SCRIBE_DB_PATH="./server/data/scribe.db"
export SCRIBE_DB_ENCRYPTION_KEY="replace-with-long-random-secret"
export SCRIBE_SESSION_TTL_HOURS="24"
export SCRIBE_REPO_SYNC_ROOT="./server/repos"
```

3. Start app + API:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:8787`

## Security Notes

- SQLite payload data is encrypted at rest with AES-256-GCM.
- Non-localhost requests to `/api` require HTTPS.
- Browser persistence for Scribe application data is not used; data is served from the backend API.

## GitHub Repository Sync

- When `githubOwner` + `githubRepo` are configured, Scribe syncs the repository into `server/repos/<github-login>/<repo>/`.
- Sync runs automatically on login and when repository settings change.
- A manual `Sync repository` button is available in Settings > GitHub.
- Sync skips `git pull` when local checkout changes are detected to avoid creating merge conflicts.
- Repo-aware assistant prompts can read local synced files through backend-safe repository browsing endpoints.
