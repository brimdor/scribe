# Data Model: Agentic AI Overhaul

**Feature**: 009-agentic-overhaul
**Created**: 2026-03-11

---

## New Entities

### HeartbeatExecution

Stored in `heartbeat_executions` table (new, V2 migration).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| user_id | TEXT | FK→users, NOT NULL | Owner of this execution |
| started_at | INTEGER | NOT NULL | Unix timestamp when heartbeat started |
| completed_at | INTEGER | NOT NULL | Unix timestamp when heartbeat finished |
| checklist_blob | TEXT | NOT NULL | Encrypted JSON: array of checklist items with results |
| rating | INTEGER | NOT NULL | Overall rating 0-5 |
| status | TEXT | NOT NULL | 'passed' or 'failed' (passed = rating >= 4) |

**Indexes**: `idx_heartbeat_user_started (user_id, started_at DESC)`

### HeartbeatChecklistItem (within checklist_blob JSON)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Checklist item identifier (e.g., "repo_sync") |
| label | string | Human-readable label |
| result | string | "pass" or "fail" |
| detail | string | Optional detail message |
| durationMs | number | Time taken in milliseconds |

### AgentContext (runtime object, not persisted)

| Field | Type | Description |
|-------|------|-------------|
| purpose | string | Agent mission statement |
| tools | array | Complete tool inventory with descriptions |
| workspace | object | Current workspace state |
| workspace.noteCount | number | Total notes in repository |
| workspace.repoStatus | string | "synced", "dirty", "not-configured" |
| workspace.recentActivity | array | Last 5 file changes |
| workspace.tagDistribution | object | Map of tag → count |
| workspace.directoryBreakdown | object | Map of directory → file count |
| preferences | object | User agent preferences |
| preferences.verbosity | string | "concise" or "detailed" |
| preferences.autoPublish | string | "ask", "auto", or "never" |

---

## Modified Entities

### Settings (existing, new keys)

New setting keys stored in existing `settings` table:

| Setting Key | Type | Default | Description |
|-------------|------|---------|-------------|
| heartbeatEnabled | boolean | false | Whether heartbeat is active |
| heartbeatIntervalMinutes | number | 60 | Interval in minutes (15-1440) |
| agentVerbosity | string | "detailed" | "concise" or "detailed" |
| agentAutoPublish | string | "ask" | "ask", "auto", or "never" |

---

## State Transitions

### Heartbeat Lifecycle

```
IDLE → SCHEDULED → EXECUTING → COMPLETED (rating >= 4) → IDLE
                              → FAILED (rating < 4) → IDLE (notify user)
```

### Heartbeat Enable/Disable

```
DISABLED → (user enables) → ENABLED/IDLE → (interval elapses) → EXECUTING → COMPLETED → IDLE
ENABLED → (user disables) → DISABLED (clear scheduled timer)
ENABLED → (tab closes) → SUSPENDED (no state change, timer stops)
ENABLED → (tab reopens) → IDLE (restart from current time)
```
