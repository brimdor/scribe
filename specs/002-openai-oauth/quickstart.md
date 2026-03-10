# Quickstart: OpenAI OAuth Sign-In

1. Start the app with `npm run dev`.
2. Open Settings and confirm the OpenAI section shows both manual provider fields and an OpenAI connect action.
3. Start the OpenAI connect flow and approve it in the browser.
4. Confirm Scribe returns to the app, marks OpenAI as connected, and no manual OpenAI API key is required.
5. Send a chat message and confirm the assistant responds while OAuth mode is active.
6. Reload the app and confirm the OpenAI connection persists.
7. Disconnect OpenAI and confirm the manual provider configuration remains available.

## Validation Notes

- Verify invalid or canceled callback attempts show retry guidance without breaking saved settings.
- Verify expired sessions refresh automatically before visible request failure.
- Verify non-OpenAI manual provider settings still work after connecting and disconnecting OpenAI OAuth.
