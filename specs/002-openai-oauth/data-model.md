# Data Model: OpenAI OAuth Sign-In

## App Settings

Represents the existing persisted Scribe configuration.

| Field | Type | Description |
|-------|------|-------------|
| `environmentName` | string | User-defined environment label |
| `githubOwner` | string | Default owner or organization |
| `githubRepo` | string | Default repository |
| `agentBaseUrl` | string | Manual OpenAI-compatible provider base URL |
| `agentApiKey` | string | Manual provider API key |
| `agentModel` | string | Default model for either provider mode |
| `openaiConnectionMethod` | string | Active OpenAI access mode (`manual` or `oauth`) |

## OpenAI OAuth Session

Represents the persisted authorization state for OpenAI-backed usage.

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Current state (`disconnected`, `connecting`, `connected`, `error`) |
| `accessToken` | string | Active bearer token used for OpenAI OAuth-backed requests |
| `refreshToken` | string | Long-lived token used to renew access |
| `expiresAt` | number | Access token expiration timestamp in milliseconds |
| `accountId` | string | Optional OpenAI account or organization identifier extracted from token claims |
| `email` | string | Optional user email returned by OAuth |
| `lastError` | string | Last visible failure message, if any |

## OpenAI OAuth Pending Flow

Represents the temporary state required to finish a redirect-based PKCE flow.

| Field | Type | Description |
|-------|------|-------------|
| `codeVerifier` | string | PKCE verifier used during token exchange |
| `state` | string | CSRF protection value |
| `startedAt` | number | Timestamp for timeout and retry logic |
| `returnPath` | string | App location to restore after callback completion |

## Connection Lifecycle

| State | Trigger | Result |
|-------|---------|--------|
| Disconnected | No saved OpenAI OAuth session | Manual provider settings remain available |
| Connecting | User starts OpenAI OAuth | PKCE state is stored and app redirects to approval |
| Connected | Callback token exchange succeeds | OAuth session is stored and OpenAI requests use OAuth mode |
| Error | Callback or refresh fails | Visible error is shown and the user can retry or disconnect |

## Validation Rules

- Pending flow completion must require a matching `state` value.
- Expired or failed token refresh must not delete manual provider settings.
- Disconnecting OpenAI OAuth must clear the OAuth session and pending flow state.
- OAuth mode should only be treated as usable when a non-expired access token or refreshable session exists.
