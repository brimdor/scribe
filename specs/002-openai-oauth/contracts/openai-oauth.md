# Contract: OpenAI OAuth Connection Flow

## Start OpenAI OAuth

- **Trigger**: User clicks the OpenAI connect action in Settings
- **Input**: Current app origin, current path, generated PKCE verifier, generated state
- **Behavior**:
  - Persist a pending OAuth flow record locally
  - Redirect the browser to the OpenAI authorization URL
- **Guarantees**:
  - Manual provider settings remain unchanged
  - The app can validate the returned callback against the stored flow state

## Complete OpenAI OAuth Callback

- **Trigger**: The browser returns to Scribe with authorization query parameters
- **Input**: Authorization code, returned state, stored PKCE verifier, stored pending flow state
- **Behavior**:
  - Validate the callback state
  - Exchange the authorization code for tokens
  - Extract account metadata when available
  - Persist the resulting OAuth session and clear pending flow state
- **Guarantees**:
  - Invalid, missing, or expired callback data does not overwrite an existing valid session
  - Successful completion restores the app to a connected OpenAI state

## Refresh OpenAI OAuth Session

- **Trigger**: An OAuth-backed request is about to use an expired or near-expired access token
- **Input**: Stored refresh token and session metadata
- **Behavior**:
  - Exchange the refresh token for a new access token
  - Persist any rotated refresh token and new expiration time
- **Guarantees**:
  - Connected sessions remain usable across reloads when refresh succeeds
  - Refresh failures surface a reconnect path instead of silent request failure

## Send Chat Request With OAuth

- **Trigger**: User sends a chat message while OpenAI OAuth mode is active
- **Input**: Conversation history, optional schema context, active OAuth session, selected model
- **Behavior**:
  - Ensure a valid access token is available
  - Send the request through the OAuth-backed OpenAI endpoint
  - Stream or assemble assistant output for the existing chat UI
- **Guarantees**:
  - OAuth mode does not require a manual OpenAI API key
  - Manual OpenAI-compatible mode continues to work independently

## Disconnect OpenAI OAuth

- **Trigger**: User clicks the disconnect action in Settings
- **Input**: Existing OpenAI OAuth session
- **Behavior**:
  - Remove persisted OAuth session and pending flow state
  - Update visible provider status to disconnected
- **Guarantees**:
  - Manual provider settings remain intact
  - Future OpenAI usage requires reconnecting or switching to manual mode
