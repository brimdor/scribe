# Research: Reusable Agent Tool Suite

## Shared Tool Registry

**Decision**: Define the agent tools once in a dedicated frontend service module that contains shared metadata, parameter schemas, and executor bindings.

**Rationale**: A central registry avoids scattering tool schemas across provider adapters and makes later tool additions predictable.

**Alternatives Considered**:
- Keep tool logic embedded in `src/services/openai.js`: rejected because it duplicates concerns and couples tools to one provider path.
- Define tools on the backend only: rejected because the model adapter still needs client-side tool metadata and orchestration.

## Tool Execution Strategy

**Decision**: Use a non-stream tool-resolution loop for tool-capable manual providers, then perform the final user-visible answer as a streamed completion.

**Rationale**: This preserves the existing streamed chat UX while keeping tool execution logic simpler and easier to test.

**Alternatives Considered**:
- Fully streamed tool calling: rejected for now because partial tool-call assembly adds complexity and little user-facing value in this codebase.
- Prompt-only pseudo-tools: rejected because the request explicitly asks for reusable tools rather than more prompt heuristics.

## Safe Tool Scope

**Decision**: Ship a broad but safety-conscious tool suite covering repo sync, tree listing, file read/write/search, git status/diff/log, and GitHub issue/PR inspection.

**Rationale**: These tools satisfy repository interaction needs without introducing risky browser-driven commit, push, or merge actions.

**Alternatives Considered**:
- Expose commit/push/merge tools: rejected for this feature due to higher safety and audit concerns.
- Expose read-only tools only: rejected because the user explicitly requested write/file interaction support.
