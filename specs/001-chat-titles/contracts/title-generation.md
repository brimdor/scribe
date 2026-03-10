# Contract: Thread Title Updates

## Generate Title For New Thread

- **Trigger**: First user message in a thread
- **Input**: Initial user prompt text
- **Behavior**:
  - Attempt AI title generation using the prompt text
  - If no usable AI title is returned, derive a shortened fallback from the prompt
  - Persist the resolved title to the existing thread record
- **Guarantees**:
  - The thread leaves the placeholder state after the first message
  - Existing non-placeholder titles are not replaced on later messages

## Rename Existing Thread

- **Trigger**: User clicks the sidebar pencil action and submits a new title
- **Input**: Trimmed text value
- **Behavior**:
  - Accept and persist non-empty values
  - Reject blank values by keeping the prior title
  - Refresh the sidebar list after save
- **Guarantees**:
  - New title is visible immediately
  - Title persists across reloads
