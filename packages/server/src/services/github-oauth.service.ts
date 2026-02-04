import { randomBytes } from 'crypto';
import { createLogger } from '../utils/logger.js';
import type { GitHubAuthUrlResponse, GitHubCallbackResponse } from '@dash-agent/shared';
import { saveSecret } from './secrets.service.js';
import { resetGitHubClient } from '../github/client.js';

const logger = createLogger('services:github-oauth');

/**
 * GitHub OAuth configuration
 * These would typically come from environment variables
 */
const GITHUB_CLIENT_ID = process.env['GITHUB_CLIENT_ID'] || '';
const GITHUB_CLIENT_SECRET = process.env['GITHUB_CLIENT_SECRET'] || '';
const GITHUB_REDIRECT_URI = process.env['GITHUB_REDIRECT_URI'] || 'http://localhost:3003/setup/github/callback';

/**
 * In-memory store for OAuth state tokens
 * In production, this should use Redis or a database
 */
const stateTokens = new Map<string, { createdAt: Date; expiresAt: Date }>();

/**
 * Clean up expired state tokens periodically
 */
setInterval(() => {
  const now = new Date();
  for (const [token, data] of stateTokens.entries()) {
    if (data.expiresAt < now) {
      stateTokens.delete(token);
    }
  }
}, 60 * 1000); // Clean up every minute

/**
 * Generates a secure random state token for OAuth
 */
function generateStateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generates the GitHub OAuth authorization URL.
 *
 * @returns Object containing the auth URL and state token
 */
export function generateAuthUrl(): GitHubAuthUrlResponse {
  logger.debug('Generating GitHub OAuth URL');

  const state = generateStateToken();

  // Store state token with 10 minute expiration
  const now = new Date();
  stateTokens.set(state, {
    createdAt: now,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  });

  // Required scopes for dash-agent:
  // - repo: Full control of private repositories (needed for PR creation)
  // - read:user: Read user profile data
  const scopes = ['repo', 'read:user'];

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: scopes.join(' '),
    state,
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  logger.info('Generated GitHub OAuth URL', { state });

  return { authUrl, state };
}

/**
 * Validates a state token from the OAuth callback.
 *
 * @param state - The state token to validate
 * @returns True if the state is valid, false otherwise
 */
export function validateState(state: string): boolean {
  const tokenData = stateTokens.get(state);

  if (!tokenData) {
    logger.warn('OAuth state not found', { state });
    return false;
  }

  const now = new Date();
  if (tokenData.expiresAt < now) {
    logger.warn('OAuth state expired', { state });
    stateTokens.delete(state);
    return false;
  }

  // State is valid, remove it (single use)
  stateTokens.delete(state);
  return true;
}

/**
 * Exchanges an authorization code for an access token.
 *
 * @param code - The authorization code from GitHub
 * @returns The access token or null if exchange failed
 */
async function exchangeCodeForToken(code: string): Promise<string | null> {
  logger.debug('Exchanging code for access token');

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    if (!response.ok) {
      logger.error('Token exchange failed', { status: response.status });
      return null;
    }

    const data = await response.json() as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      logger.error('Token exchange error', {
        error: data.error,
        description: data.error_description
      });
      return null;
    }

    return data.access_token || null;
  } catch (error) {
    logger.error('Token exchange error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Fetches GitHub user information using an access token.
 *
 * @param token - The GitHub access token
 * @returns User information or null if fetch failed
 */
async function fetchUserInfo(token: string): Promise<{ login: string; avatar_url: string } | null> {
  logger.debug('Fetching GitHub user info');

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'dash-agent',
      },
    });

    if (!response.ok) {
      logger.error('User info fetch failed', { status: response.status });
      return null;
    }

    const data = await response.json() as { login: string; avatar_url: string };
    return { login: data.login, avatar_url: data.avatar_url };
  } catch (error) {
    logger.error('User info fetch error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Handles the OAuth callback by exchanging the code for a token,
 * storing it encrypted in the server, and fetching user information.
 *
 * @param code - The authorization code from GitHub
 * @param state - The state token to validate
 * @param storeToken - If true, stores the token server-side (default: true)
 * @returns Object containing success status and user info (token NOT returned)
 */
export async function handleCallback(
  code: string,
  state: string,
  storeToken: boolean = true
): Promise<GitHubCallbackResponse> {
  logger.info('Handling GitHub OAuth callback');

  // Validate state
  if (!validateState(state)) {
    return {
      success: false,
      error: 'Invalid or expired state token. Please try again.',
    };
  }

  // Check if GitHub OAuth is configured
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    logger.warn('GitHub OAuth not configured, simulating success');
    // For development without OAuth credentials, simulate success
    // In dev mode, we still save a simulated token for testing
    if (storeToken) {
      const metadata: Record<string, unknown> = {
        username: 'demo-user',
        avatarUrl: 'https://github.com/identicons/demo.png',
        connectionMethod: 'oauth',
      };
      saveSecret('github_token', 'github', 'simulated-token-for-development', metadata);
      resetGitHubClient();
    }
    return {
      success: true,
      username: 'demo-user',
      avatarUrl: 'https://github.com/identicons/demo.png',
    };
  }

  // Exchange code for token
  const token = await exchangeCodeForToken(code);
  if (!token) {
    return {
      success: false,
      error: 'Failed to exchange authorization code for access token.',
    };
  }

  // Fetch user info
  const userInfo = await fetchUserInfo(token);
  if (!userInfo) {
    return {
      success: false,
      error: 'Failed to fetch user information from GitHub.',
    };
  }

  // Store the token encrypted in the server
  if (storeToken) {
    const metadata: Record<string, unknown> = {
      username: userInfo.login,
      avatarUrl: userInfo.avatar_url,
      connectionMethod: 'oauth',
    };
    saveSecret('github_token', 'github', token, metadata);
    resetGitHubClient(); // Reset client so it picks up the new token
    logger.info('GitHub token stored successfully via OAuth', { username: userInfo.login });
  }

  logger.info('GitHub OAuth completed successfully', { username: userInfo.login });

  // Note: Token is NOT returned to frontend - it's stored server-side
  return {
    success: true,
    username: userInfo.login,
    avatarUrl: userInfo.avatar_url,
  };
}

/**
 * Validates a GitHub token by making a test API call.
 *
 * @param token - The GitHub token to validate
 * @returns True if the token is valid, false otherwise
 */
export async function validateToken(token: string): Promise<boolean> {
  logger.debug('Validating GitHub token');

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'dash-agent',
      },
    });

    return response.ok;
  } catch (error) {
    logger.error('Token validation error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Checks if GitHub OAuth is configured.
 *
 * @returns True if client ID and secret are set
 */
export function isOAuthConfigured(): boolean {
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}
