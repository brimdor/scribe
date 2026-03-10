# Research: OpenAI OAuth Sign-In

## OAuth flow shape for a browser SPA
**Decision**: Use a PKCE-based OAuth authorization code flow that redirects back into the existing Scribe app instead of relying on a separate helper server.
**Rationale**: Scribe already runs as a browser SPA, and the requested experience is best served by returning directly to the app and finishing connection automatically.
**Alternatives Considered**: Running a local callback server would fit desktop and CLI apps better, but it adds complexity Scribe does not need in-browser.

## OpenAI authorization and token endpoints
**Decision**: Use `https://auth.openai.com/oauth/authorize` and `https://auth.openai.com/oauth/token` with PKCE, following the same public-client pattern used in existing OpenAI Codex integrations.
**Rationale**: Multiple production OSS integrations use this issuer and client pattern, and a browser-origin probe confirms the token endpoint responds with permissive CORS headers for SPA token exchange.
**Alternatives Considered**: Requiring a custom backend token exchanger would add infrastructure and deployment complexity that the current app does not have.

## OpenAI request transport after OAuth
**Decision**: Route OAuth-backed OpenAI requests through the ChatGPT Codex responses endpoint rather than the existing manual OpenAI-compatible client path.
**Rationale**: Existing OSS implementations pair this OAuth flow with `https://chatgpt.com/backend-api/codex/responses`, including account-aware headers and refresh-token handling, while Scribe's current OpenAI-compatible path remains correct for manual API-key providers.
**Alternatives Considered**: Reusing the API-key-based OpenAI SDK path with OAuth access tokens is less well-supported by the available evidence and would risk a broken auth experience.

## Session persistence and refresh behavior
**Decision**: Persist the OpenAI OAuth session and temporary PKCE flow state in IndexedDB settings and refresh the access token ahead of expiration.
**Rationale**: The existing app already treats browser-local IndexedDB as the durable source of app configuration, and refresh support keeps the connection usable across reloads without repeated sign-in.
**Alternatives Considered**: Session-only storage would force frequent reconnects and fail the user's desired low-friction experience.

## User-facing connection management
**Decision**: Add OpenAI-specific connect, reconnect, and disconnect controls to the existing Settings panel while leaving manual base URL, API key, and model fields available for non-OpenAI providers.
**Rationale**: The feature is provider-specific, and Settings is already where AI connection state lives today.
**Alternatives Considered**: Putting the flow on the GitHub login page would mix unrelated auth concerns and confuse provider selection.
