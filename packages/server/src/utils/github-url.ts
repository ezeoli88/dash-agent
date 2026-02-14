/**
 * Utility functions for parsing and handling GitHub, GitLab, and local repository URLs.
 */

import { isGitLabUrl, parseGitLabUrl, toGitLabHttpsCloneUrl, toGitLabAuthenticatedCloneUrl } from './gitlab-url.js';

/**
 * Parsed GitHub repository information.
 */
export interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

/**
 * Checks if a repository URL is a local file:// URL.
 *
 * @param url - The repository URL to check
 * @returns True if the URL starts with file://
 */
export function isLocalRepoUrl(url: string): boolean {
  return url.startsWith('file://');
}

/**
 * Extracts the local filesystem path from a file:// URL.
 * Handles both file://path and file:///path formats on Windows and Unix.
 * Example: file://C:\ezequiel\repo -> C:\ezequiel\repo
 * Example: file:///home/user/repo -> /home/user/repo
 *
 * @param url - The file:// URL
 * @returns The local filesystem path
 */
export function localRepoPath(url: string): string {
  const path = url.replace(/^file:\/\//, '');

  // Windows absolute paths: C:/... or C:\...
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    return path;
  }

  // Windows absolute paths with leading slash: /C:/... or /C:\...
  if (/^\/[a-zA-Z]:[\\/]/.test(path)) {
    return path.slice(1);
  }

  // Unix absolute paths should keep the leading slash after removing file://
  if (path.startsWith('/')) {
    return path;
  }

  // Fallback for malformed file:// URLs like file://home/user/repo
  return `/${path}`;
}

/**
 * Checks if a URL is a GitHub URL.
 *
 * @param url - The repository URL to check
 * @returns True if the URL contains github.com
 */
export function isGitHubUrl(url: string): boolean {
  return /github\.com/i.test(url);
}

/**
 * Parses a GitHub repository URL and extracts owner and repo name.
 * Supports various URL formats:
 * - https://github.com/user/repo
 * - https://github.com/user/repo.git
 * - git@github.com:user/repo.git
 * - github.com/user/repo
 *
 * @param url - The GitHub repository URL
 * @returns The parsed owner and repo name
 * @throws Error if the URL cannot be parsed
 */
export function parseGitHubUrl(url: string): GitHubRepoInfo {
  // Remove trailing slashes and .git suffix
  const cleanUrl = url.replace(/\/+$/, '').replace(/\.git$/, '');

  // Try HTTPS format: https://github.com/user/repo
  const httpsMatch = cleanUrl.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)/);
  if (httpsMatch !== null && httpsMatch[1] !== undefined && httpsMatch[2] !== undefined) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
    };
  }

  // Try SSH format: git@github.com:user/repo
  const sshMatch = cleanUrl.match(/git@github\.com:([^/]+)\/([^/]+)/);
  if (sshMatch !== null && sshMatch[1] !== undefined && sshMatch[2] !== undefined) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  throw new Error(`Invalid GitHub URL format: ${url}`);
}

/**
 * Converts a repository URL to a safe directory name.
 * For GitHub URLs: https://github.com/user/repo -> user-repo
 * For GitLab URLs: https://gitlab.com/user/repo -> user-repo
 * For local URLs: file://C:\path\to\repo -> local-repo
 *
 * @param url - The repository URL (GitHub, GitLab, or local file://)
 * @returns A safe directory name for the repository
 */
export function repoUrlToDir(url: string): string {
  if (isLocalRepoUrl(url)) {
    // Extract directory name from the file:// path
    const filePath = url.replace(/^file:\/\/\/?/, '');
    // Handle both forward and backslashes, remove trailing slashes
    const cleanPath = filePath.replace(/[/\\]+$/, '');
    const dirName = cleanPath.split(/[/\\]/).pop() ?? 'repo';
    const safeDirName = dirName.replace(/[^a-zA-Z0-9_-]/g, '-');
    return `local-${safeDirName}`;
  }

  // Detect provider and parse accordingly
  let owner: string;
  let repo: string;

  if (isGitLabUrl(url)) {
    const parsed = parseGitLabUrl(url);
    owner = parsed.owner;
    repo = parsed.repo;
  } else {
    const parsed = parseGitHubUrl(url);
    owner = parsed.owner;
    repo = parsed.repo;
  }

  // Sanitize to ensure safe directory names (remove special characters)
  const safeOwner = owner.replace(/[^a-zA-Z0-9_-]/g, '-');
  const safeRepo = repo.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safeOwner}-${safeRepo}`;
}

/**
 * Converts a repository URL to HTTPS format for cloning.
 * If it's already HTTPS, returns as-is with .git suffix.
 * If it's SSH, converts to HTTPS.
 * If it's a local file:// URL, returns it as-is.
 * Supports both GitHub and GitLab URLs.
 *
 * @param url - The repository URL (GitHub, GitLab, or local file://)
 * @returns The clone URL (HTTPS for GitHub/GitLab, file:// as-is for local)
 */
export function toHttpsCloneUrl(url: string): string {
  if (isLocalRepoUrl(url)) {
    return url;
  }
  if (isGitLabUrl(url)) {
    return toGitLabHttpsCloneUrl(url);
  }
  const { owner, repo } = parseGitHubUrl(url);
  return `https://github.com/${owner}/${repo}.git`;
}

/**
 * Creates a clone URL with embedded token for authentication.
 * This allows cloning private repositories.
 * For local file:// URLs, returns the URL as-is (no authentication needed).
 * Supports both GitHub and GitLab URLs (different auth username per provider).
 *
 * @param url - The repository URL (GitHub, GitLab, or local file://)
 * @param token - The access token (GitHub PAT or GitLab token)
 * @returns The authenticated HTTPS clone URL, or the original URL for local repos
 */
export function toAuthenticatedCloneUrl(url: string, token: string): string {
  if (isLocalRepoUrl(url)) {
    return url;
  }
  if (isGitLabUrl(url)) {
    return toGitLabAuthenticatedCloneUrl(url, token);
  }
  const { owner, repo } = parseGitHubUrl(url);
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}
