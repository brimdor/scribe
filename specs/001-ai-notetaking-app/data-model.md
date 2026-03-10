# Data Model: Scribe AI Notetaking App

**Feature**: 001-ai-notetaking-app
**Date**: 2026-03-10

---

## Entities

### User
Stored in-memory (session). GitHub profile data retrieved via OAuth.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| login | string | GitHub API | GitHub username |
| avatarUrl | string | GitHub API | Profile picture URL |
| name | string | GitHub API | Display name |
| accessToken | string | OAuth flow | GitHub access token (stored in sessionStorage) |
| selectedRepo | string | User choice | Repository full name (e.g., `user/notes`) |

### Thread
Stored in IndexedDB (`threads` object store).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | Primary key | Unique thread identifier |
| title | string | Not empty | Auto-generated or user-set title |
| createdAt | number | Indexed | Unix timestamp |
| updatedAt | number | Indexed | Unix timestamp |
| isPinned | boolean | Default: false | Pin status |

### Message
Stored in IndexedDB (`messages` object store).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | Primary key | Unique message identifier |
| threadId | string | Indexed, FK→Thread | Parent thread |
| role | enum | "user" \| "assistant" | Message sender |
| content | string | Not empty | Markdown content |
| timestamp | number | Indexed | Unix timestamp |
| attachments | string[] | Optional | File references |

### Schema (Note Template)
Stored as static JSON in the application bundle. Custom schemas stored in IndexedDB (`schemas` object store).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string | Primary key | Schema identifier |
| name | string | Unique | Display name (e.g., "Meeting Notes") |
| description | string | Not empty | Brief description |
| icon | string | Emoji | Visual identifier |
| template | string | Markdown | Template body with placeholders |
| frontmatterFields | object[] | Required | YAML frontmatter field definitions |
| isBuiltIn | boolean | Default: true | Whether it's a built-in or custom schema |

### Note (GitHub File)
Not stored locally — exists as files in the GitHub repository.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| path | string | GitHub API | File path in repository |
| content | string | GitHub API | Markdown content with YAML frontmatter |
| sha | string | GitHub API | Git blob SHA for updates |
| schema | string | Frontmatter | Schema ID used to create the note |

---

## Relationships

```
User 1──∞ Thread
Thread 1──∞ Message
Schema 1──∞ Note (via frontmatter reference)
User 1──1 Vault (GitHub Repository)
```

---

## IndexedDB Schema

**Database name**: `scribe-db`
**Version**: 1

| Object Store | Key Path | Indexes |
|-------------|----------|---------|
| threads | id | createdAt, updatedAt, isPinned |
| messages | id | threadId, timestamp |
| schemas | id | name, isBuiltIn |
| settings | key | — |
