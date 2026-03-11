import { apiRequest } from './api';

export async function logAgentEvent(category, event, details = {}) {
  try {
    await apiRequest('/api/debug/events', {
      method: 'POST',
      body: {
        category,
        event,
        details,
      },
    });
  } catch {
    // Logging must never break the user flow.
  }
}
