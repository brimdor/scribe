# Quickstart: Reusable Agent Tool Suite

## Setup

1. Install dependencies with `npm install`.
2. Export the required environment variables described in `README.md`.
3. Start the app with `npm run dev`.
4. Sign in with GitHub and configure an assigned repository in Settings.
5. Use the manual agent provider mode with a tool-capable OpenAI-compatible model.

## Validation Scenarios

### Scenario 1: Repository inspection

1. Sync an assigned repository.
2. Ask the agent to inspect `README.md` or search for a symbol in the repository.
3. Confirm the response reflects live repo data gathered through tools.

### Scenario 2: Repository write

1. Ask the agent to create or update a small text file in the assigned repository.
2. Verify the file exists under `server/repos/<github-login>/<repo>/` with the expected content.

### Scenario 3: Git state

1. Create a local repository change.
2. Ask the agent for git status, diff, or recent history.
3. Confirm the response references structured git inspection output.

### Scenario 4: GitHub collaboration context

1. Ensure the assigned repository has open issues or pull requests.
2. Ask the agent to summarize open work.
3. Confirm the response reflects issue/PR metadata from GitHub-backed tools.
