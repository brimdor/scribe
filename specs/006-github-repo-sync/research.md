## Local Repository Root Strategy
**Decision**: Store synced repositories under `server/repos/<github-login>/<repo-name>/` by default, configurable with `SCRIBE_REPO_SYNC_ROOT`.
**Rationale**: Keeps synced checkouts out of source paths and avoids accidental git tracking while preserving required user/repo folder hierarchy.
**Alternatives Considered**:
- Repository root (`<project>/<user>/<repo>`): simple but risks polluting tracked workspace.
- Database blob storage: does not support native git pull/clone workflow.

## Git Authentication for Clone/Pull
**Decision**: Use git command execution with per-command HTTPS authorization header derived from stored PAT; do not persist PAT in origin URL.
**Rationale**: Supports private repository access while minimizing credential leakage in `.git/config`.
**Alternatives Considered**:
- Embedding PAT in clone URL: works but persists sensitive token in remote URL.
- SSH key workflow: requires key distribution outside current PAT-based auth model.

## Assistant Sync Tool Triggering
**Decision**: Add a dedicated client-side sync tool function and call it automatically before assistant response generation when prompt intent indicates repository freshness requirements.
**Rationale**: Delivers tool-driven refresh behavior immediately without requiring full model-side function-calling protocol changes.
**Alternatives Considered**:
- Full Responses API function-calling loop: higher complexity and uncertain compatibility with current codex streaming wrapper.
- Manual-only sync requirement: does not satisfy assistant tool requirement.
