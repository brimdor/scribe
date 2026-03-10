# Research: Settings Panel and Integrations

## Shared settings state
**Decision**: Introduce a dedicated React context for persisted settings and panel open/close state.
**Rationale**: Both the sidebar and top bar need to open the same settings experience, and chat components need access to saved agent configuration.
**Alternatives Considered**: Prop drilling from `Layout`; separate event-based state.

## OpenAI-compatible configuration
**Decision**: Support `baseURL`, optional `apiKey`, and optional `model` during client initialization.
**Rationale**: The feature requires compatibility with hosted and local OpenAI-style providers.
**Alternatives Considered**: Hardcoding OpenAI defaults; keeping only an API key.

## Fallback API key behavior
**Decision**: Treat a blank API key as `1234` at initialization time.
**Rationale**: Some local providers ignore keys but still expect a value shape.
**Alternatives Considered**: Null key handling; forcing a placeholder into the UI.
