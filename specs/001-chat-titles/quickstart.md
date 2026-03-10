# Quickstart: Chat Titles

1. Start the app with `npm run dev`.
2. Open the app and create a new chat.
3. Send the first user message and confirm the sidebar title changes from `New Chat` to a generated or fallback title.
4. Hover the thread row, click the pencil action, rename the thread, and save.
5. Reload the page and confirm the renamed title persists.

## Validation Notes

- Verify later messages do not overwrite the existing title.
- Verify blank rename attempts keep the previous title.
- Verify the feature still works when AI title generation is unavailable.
