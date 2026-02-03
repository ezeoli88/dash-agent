/**
 * Utility functions for parsing and handling GitHub URLs.
 */

/**
 * Parsed GitHub repository information.
 */
export interface GitHubRepoInfo {
  owner: string;
  repo: string;
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
 * Converts a GitHub repository URL to a safe directory name.
 * Example: https://github.com/user/repo -> user-repo
 *
 * @param url - The GitHub repository URL
 * @returns A safe directory name for the repository
 */
export function repoUrlToDir(url: string): string {
  const { owner, repo } = parseGitHubUrl(url);
  // Sanitize to ensure safe directory names (remove special characters)
  const safeOwner = owner.replace(/[^a-zA-Z0-9_-]/g, '-');
  const safeRepo = repo.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safeOwner}-${safeRepo}`;
}

/**
 * Converts a repository URL to HTTPS format for cloning.
 * If it's already HTTPS, returns as-is with .git suffix.
 * If it's SSH, converts to HTTPS.
 *
 * @param url - The GitHub repository URL
 * @returns The HTTPS clone URL
 */
export function toHttpsCloneUrl(url: string): string {
  const { owner, repo } = parseGitHubUrl(url);
  return `https://github.com/${owner}/${repo}.git`;
}

/**
 * Creates a clone URL with embedded token for authentication.
 * This allows cloning private repositories.
 *
 * @param url - The GitHub repository URL
 * @param token - The GitHub personal access token
 * @returns The authenticated HTTPS clone URL
 */
export function toAuthenticatedCloneUrl(url: string, token: string): string {
  const { owner, repo } = parseGitHubUrl(url);
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}
