# Data Model: Chat Titles

## Thread

Represents a saved conversation in IndexedDB.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique thread identifier |
| `title` | string | Current visible thread title |
| `createdAt` | number | Creation timestamp |
| `updatedAt` | number | Last update timestamp |
| `isPinned` | boolean | Sidebar pin state |

## Title Lifecycle

| State | Trigger | Result |
|-------|---------|--------|
| Placeholder | New thread created | `title` starts as a temporary default |
| Generated | First user message processed | `title` becomes AI-generated or fallback prompt text |
| Manually Edited | User saves sidebar rename | `title` becomes user-defined and persists |

## Validation Rules

- Generated titles should resolve to a non-empty string.
- Manual rename submissions should trim surrounding whitespace.
- Blank rename submissions must not replace the existing title.
