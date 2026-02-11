const AUTH_TOKEN_KEY = 'agent-board-auth-token';

/**
 * Extracts auth token from URL query param, stores in sessionStorage,
 * and removes from URL bar for security.
 * Call once on app startup before rendering.
 */
export function initializeAuth(): void {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (token) {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    // Remove token from URL bar to avoid leaking in screenshots/bookmarks
    params.delete('token');
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }
}

/**
 * Returns the stored auth token, or null if not set.
 */
export function getAuthToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}
