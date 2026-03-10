# Quickstart: GitHub Repository Sync Automation

## Prerequisites
- Valid GitHub PAT with `repo` scope.
- Successful login to Scribe.
- Configured repository owner and repository in Settings > GitHub.

## Scenario 1: Login-triggered sync
1. Start Scribe (`npm run dev`).
2. Log in with GitHub username + PAT.
3. Verify server performs sync attempt automatically.
4. Confirm local repository exists under `server/repos/<username>/<repo>/`.

## Scenario 2: Settings-change sync
1. Open Settings > GitHub.
2. Change owner/repo assignment.
3. Save settings.
4. Verify sync runs and status message confirms success/failure.

## Scenario 3: Manual sync button
1. Open Settings > GitHub with configured owner/repo.
2. Click `Sync repository`.
3. Verify sync status message updates and local checkout reflects latest remote commit.

## Scenario 4: Assistant tool-driven sync
1. Ask the assistant a repo-freshness prompt (for example: "pull latest repo and summarize recent changes").
2. Verify the sync tool path executes before assistant response generation.
