# Data Model: Settings Panel and Integrations

## SettingsProfile

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| environmentName | string | No | Friendly label for the current environment |
| githubOwner | string | No | Default GitHub owner or organization |
| githubRepo | string | No | Default repository name |
| agentBaseUrl | string | Yes | Base URL for an OpenAI API compatible agent |
| agentApiKey | string | No | User-provided API key; blank means fallback applies |
| agentModel | string | No | Preferred model identifier |

### Validation Rules

- `agentBaseUrl` must be a non-empty string after trimming.
- `agentBaseUrl` should be normalized without a trailing slash when saved.
- Empty `agentApiKey` is valid and maps to effective key `1234` during client setup.
