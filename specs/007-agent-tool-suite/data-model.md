# Data Model: Reusable Agent Tool Suite

## Entities

### Agent Tool Definition

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Stable tool identifier exposed to the model |
| `description` | string | Human-readable description of tool behavior |
| `parameters` | object | JSON-schema-like argument contract |
| `executor` | function | Client-side function that validates and executes the tool |
| `exposure` | string | Availability mode such as `manual-provider` or `all` |

### Agent Tool Call

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Requested tool name |
| `arguments` | object | Parsed tool arguments |
| `provider` | string | Model adapter currently invoking the tool |
| `startedAt` | number | Execution start timestamp |

### Agent Tool Result

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Whether execution succeeded |
| `toolName` | string | Tool that produced the result |
| `data` | object | Structured output for successful calls |
| `error` | string | Safe error message for failed calls |

### Repository Mutation Request

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Repository-relative file path |
| `content` | string | UTF-8 text content to write |
| `createDirectories` | boolean | Whether missing parent directories may be created |

## Validation Rules

- Tool names must match a registered definition.
- Tool arguments must default safely when optional values are omitted.
- File paths must normalize to repository-relative paths with no `..` segments and no absolute paths.
- Write operations are limited to text content and repository-local targets.
- Git/GitHub inspection tools must resolve the authenticated user's assigned repository before execution.
