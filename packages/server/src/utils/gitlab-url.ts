/**
 * Utility functions for parsing and handling GitLab repository URLs.
 */

/**
 * Parsed GitLab repository information.
 */
export interface GitLabRepoInfo {
  owner: string;
  repo: string;
}

/**
 * Checks if a URL is a GitLab URL.
 *
 * @param url - The repository URL to check
 * @returns True if the URL contains gitlab.com
 */
export function isGitLabUrl(url: string): boolean {
  return /gitlab\.com/i.test(url);
}

/**
 * Parses a GitLab repository URL and extracts owner and repo name.
 * Supports various URL formats:
 * - https://gitlab.com/user/repo
 * - https://gitlab.com/user/repo.git
 * - git@gitlab.com:user/repo.git
 * - gitlab.com/user/repo
 *
 * @param url - The GitLab repository URL
 * @returns The parsed owner and repo name
 * @throws Error if the URL cannot be parsed
 */
export function parseGitLabUrl(url: string): GitLabRepoInfo {
  // Remove trailing slashes and .git suffix
  const cleanUrl = url.replace(/\/+$/, '').replace(/\.git$/, '');

  // Try HTTPS format: https://gitlab.com/user/repo
  const httpsMatch = cleanUrl.match(/(?:https?:\/\/)?gitlab\.com\/([^/]+)\/([^/]+)/);
  if (httpsMatch !== null && httpsMatch[1] !== undefined && httpsMatch[2] !== undefined) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
    };
  }

  // Try SSH format: git@gitlab.com:user/repo
  const sshMatch = cleanUrl.match(/git@gitlab\.com:([^/]+)\/([^/]+)/);
  if (sshMatch !== null && sshMatch[1] !== undefined && sshMatch[2] !== undefined) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  throw new Error(`Invalid GitLab URL format: ${url}`);
}

/**
 * Converts a GitLab repository URL to HTTPS clone format.
 *
 * @param url - The GitLab repository URL
 * @returns The HTTPS clone URL (https://gitlab.com/owner/repo.git)
 */
export function toGitLabHttpsCloneUrl(url: string): string {
  const { owner, repo } = parseGitLabUrl(url);
  return `https://gitlab.com/${owner}/${repo}.git`;
}

/**
 * Creates a GitLab clone URL with embedded token for authentication.
 * GitLab uses oauth2 as the username for token-based authentication.
 *
 * @param url - The GitLab repository URL
 * @param token - The GitLab personal access token or OAuth2 token
 * @returns The authenticated HTTPS clone URL
 */
export function toGitLabAuthenticatedCloneUrl(url: string, token: string): string {
  const { owner, repo } = parseGitLabUrl(url);
  return `https://oauth2:${token}@gitlab.com/${owner}/${repo}.git`;
}
