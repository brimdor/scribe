# Quickstart: Secure SQLite-Centric Persistent Storage

## Prerequisites

- Node.js 20+
- npm
- GitHub Personal Access Token with `repo` capability

## Environment

Create `.env` (or export variables) before starting backend-enabled dev mode:

```bash
export SCRIBE_DB_PATH="./server/data/scribe.db"
export SCRIBE_DB_ENCRYPTION_KEY="replace-with-long-random-secret"
export SCRIBE_SESSION_TTL_HOURS="24"
```

## Run

```bash
npm install
npm run dev
```

Expected runtime:

- Frontend served by Vite.
- Backend API serves `/api/*` routes.
- Browser should not store Scribe app data in localStorage, sessionStorage, or IndexedDB.

## Verify Core Flows

1. Log in with GitHub username + PAT having repo read/write capability.
2. Create thread and messages, save settings, then refresh page.
3. Confirm data remains available after login.
4. Log in from another device/browser with same username and valid PAT; confirm data is shared.
5. Rotate PAT using a different token with required capability; confirm successful replacement.
6. Retry with token lacking capability; confirm clear failure message requiring read/write repo capability.

## Security Verification

1. Inspect SQLite rows directly and confirm encrypted blobs (not plaintext) for payload fields.
2. Send non-HTTPS request in non-localhost environment and confirm HTTPS-required response.
