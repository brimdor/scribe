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
