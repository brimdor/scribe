# API Contracts: Agentic AI Overhaul

**Feature**: 009-agentic-overhaul
**Created**: 2026-03-11

---

## New Endpoints

### GET /api/agent/workspace-state

Returns current workspace state for agent context assembly.

**Auth**: Required (session cookie)

**Response 200:**
```json
{
  "noteCount": 42,
  "repoStatus": "synced",
  "recentActivity": [
    { "path": "notes/meeting-2026-03-11.md", "action": "modified", "timestamp": 1741680000 }
  ],
  "tagDistribution": { "meeting": 5, "project": 3, "daily": 12 },
  "directoryBreakdown": { "notes": 20, "daily": 12, "projects": 10 },
  "lastSyncAt": 1741680000,
  "assignedRepo": "brimdor/notes"
}
```

**Response 401:**
```json
{ "error": "Not authenticated" }
```

**Response 404:**
```json
{ "error": "No repository assigned" }
```

---

### GET /api/storage/heartbeats

List heartbeat execution history for the authenticated user.

**Auth**: Required (session cookie)

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 20 | Max results (1-100) |
| offset | number | 0 | Pagination offset |

**Response 200:**
```json
{
  "heartbeats": [
    {
      "id": "uuid",
      "startedAt": 1741680000,
      "completedAt": 1741680045,
      "checklist": [
        { "name": "repo_sync", "label": "Repository Sync", "result": "pass", "detail": "Up to date", "durationMs": 1200 },
        { "name": "workspace_health", "label": "Workspace Health", "result": "pass", "detail": "42 notes, 0 issues", "durationMs": 800 },
        { "name": "issue_check", "label": "Issue Check", "result": "pass", "detail": "No unresolved issues", "durationMs": 500 },
        { "name": "activity_summary", "label": "Activity Summary", "result": "pass", "detail": "3 notes modified today", "durationMs": 600 }
      ],
      "rating": 5,
      "status": "passed"
    }
  ],
  "total": 15
}
```

---

### POST /api/storage/heartbeats

Save a heartbeat execution result.

**Auth**: Required (session cookie)

**Request Body:**
```json
{
  "startedAt": 1741680000,
  "completedAt": 1741680045,
  "checklist": [
    { "name": "repo_sync", "label": "Repository Sync", "result": "pass", "detail": "Up to date", "durationMs": 1200 }
  ],
  "rating": 5,
  "status": "passed"
}
```

**Response 201:**
```json
{
  "heartbeat": {
    "id": "uuid",
    "startedAt": 1741680000,
    "completedAt": 1741680045,
    "checklist": [...],
    "rating": 5,
    "status": "passed"
  }
}
```

---

## Modified Endpoints

### Existing storage endpoints remain unchanged.

New setting keys (`heartbeatEnabled`, `heartbeatIntervalMinutes`, `agentVerbosity`, `agentAutoPublish`) are stored via the existing `PUT /api/storage/settings/:key` and `GET /api/storage/settings/:key` endpoints. No endpoint changes required.
