/**
 * GitHub OAuth service using personal access token approach
 * (GitHub Device Flow requires CORS which doesn't work from SPAs directly,
 *  so we use a PAT-based auth for simplicity — user enters their token)
 */

const TOKEN_KEY = 'scribe_github_token';
const USER_KEY = 'scribe_github_user';

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function getStoredUser() {
  const data = sessionStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

export function storeUser(user) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function isAuthenticated() {
  return !!getStoredToken();
}
