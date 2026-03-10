# Data Model: Secure SQLite-Centric Persistent Storage

## Table: `users`

Authoritative user identity table. All user-specific records reference `users.id`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | text (UUID) | Primary key |
| `username` | text | Normalized GitHub username (unique) |
| `profile_blob` | text | Encrypted JSON payload for profile metadata |
| `token_blob` | text | Encrypted PAT payload |
| `created_at` | integer | Epoch milliseconds |
| `updated_at` | integer | Epoch milliseconds |

## Table: `sessions`

Backend-authenticated session records for browser clients.

| Field | Type | Description |
|-------|------|-------------|
| `id` | text (UUID) | Session identifier |
| `user_id` | text | FK to `users.id` |
| `expires_at` | integer | Epoch milliseconds |
| `created_at` | integer | Epoch milliseconds |
| `last_seen_at` | integer | Epoch milliseconds |

## Table: `settings`

User-specific key/value settings.

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | text | FK to `users.id` |
| `setting_key` | text | Setting name |
| `value_blob` | text | Encrypted JSON payload |
| `updated_at` | integer | Epoch milliseconds |

**Primary Key**: (`user_id`, `setting_key`)

## Table: `threads`

Conversation metadata scoped to a user.

| Field | Type | Description |
|-------|------|-------------|
| `id` | text | Thread identifier |
| `user_id` | text | FK to `users.id` |
| `title_blob` | text | Encrypted title payload |
| `is_pinned` | integer | 0/1 |
| `created_at` | integer | Epoch milliseconds |
| `updated_at` | integer | Epoch milliseconds |

## Table: `messages`

Messages tied to a thread and user.

| Field | Type | Description |
|-------|------|-------------|
| `id` | text | Message identifier |
| `thread_id` | text | FK to `threads.id` |
| `user_id` | text | FK to `users.id` |
| `role` | text | `user` or `assistant` |
| `content_blob` | text | Encrypted message payload |
| `timestamp` | integer | Epoch milliseconds |

## Table: `schemas`

User-owned custom schema definitions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | text | Schema identifier |
| `user_id` | text | FK to `users.id` |
| `name` | text | Logical schema name |
| `payload_blob` | text | Encrypted schema payload |
| `updated_at` | integer | Epoch milliseconds |

## Indexes

- `idx_sessions_user_id` on `sessions(user_id)`
- `idx_threads_user_updated` on `threads(user_id, updated_at desc)`
- `idx_messages_thread_time` on `messages(thread_id, timestamp asc)`
- `idx_schemas_user_name` on `schemas(user_id, name)`

## Validation Rules

- `users.username` is required and unique by case-insensitive normalized form.
- PAT validation must pass GitHub username match and repo read/write capability before updating `token_blob`.
- Thread and message operations must enforce `user_id` ownership.
- Payload blobs must be encrypted before insert/update.
- Session lookups must reject expired sessions.

## Migration Notes

- Use explicit migration versioning (`PRAGMA user_version`) for additive schema updates.
- New fields should default safely and avoid destructive rewrites.
- Legacy browser-local persistence is intentionally not migrated automatically in this feature.
