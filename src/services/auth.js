import { apiRequest } from './api';

export async function loginWithGitHub(username, token) {
  const response = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username, token },
  });

  return response.user;
}

export async function getCurrentSession() {
  const response = await apiRequest('/api/auth/session');
  return response.user;
}

export async function logoutSession() {
  await apiRequest('/api/auth/logout', { method: 'POST' });
}
