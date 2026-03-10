# Research: Chat Titles

## Existing title generation helper
**Decision**: Reuse the existing `generateTitle(userMessage)` helper in the OpenAI service.
**Rationale**: The project already contains a concise non-streaming helper intended for short operations like title generation.
**Alternatives Considered**: Adding a second title-generation service would duplicate logic and configuration handling.

## Fallback title behavior
**Decision**: Use a sanitized, shortened version of the first user prompt whenever AI title generation is unavailable or fails.
**Rationale**: New chats still need a meaningful label when the assistant backend is missing or errors.
**Alternatives Considered**: Leaving `New Chat` in place would not satisfy the feature goal.

## Rename interaction pattern
**Decision**: Support inline rename from the sidebar row with a hover-revealed pencil action.
**Rationale**: This matches the requested UX and keeps renaming close to the title being edited.
**Alternatives Considered**: Modal or prompt-based renaming would add friction and break flow.
