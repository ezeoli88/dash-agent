import { Octokit } from 'octokit';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { parseGitHubUrl } from '../utils/github-url.js';

const logger = createLogger('github-client');

/**
 * Information about a pull request.
 */
export interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  headBranch: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  user: {
    login: string;
    avatarUrl: string;
  };
  labels: string[];
  reviewers: string[];
  isDraft: boolean;
  mergeable: boolean | null;
  mergeableState: string;
  comments: number;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
}

/**
 * Parameters for creating a pull request.
 */
export interface CreatePullRequestParams {
  repoUrl: string;
  head: string; // Feature branch
  base: string; // Target branch (e.g., main)
  title: string;
  body: string;
  draft?: boolean;
}

/**
 * Result of creating a pull request.
 */
export interface CreatePullRequestResult {
  url: string;
  number: number;
}

/**
 * GitHub API client wrapper around Octokit.
 * Provides methods for common GitHub operations.
 */
export class GitHubClient {
  private readonly octokit: Octokit;

  constructor() {
    const config = getConfig();
    if (!config.githubToken) {
      throw new Error('GITHUB_TOKEN is required for GitHub operations');
    }

    this.octokit = new Octokit({
      auth: config.githubToken,
    });
  }

  /**
   * Creates a pull request on GitHub.
   *
   * @param params - The pull request parameters
   * @returns The created pull request URL and number
   */
  async createPullRequest(params: CreatePullRequestParams): Promise<CreatePullRequestResult> {
    const { owner, repo } = parseGitHubUrl(params.repoUrl);

    logger.info('Creating pull request', {
      owner,
      repo,
      head: params.head,
      base: params.base,
      title: params.title,
    });

    try {
      const response = await this.octokit.rest.pulls.create({
        owner,
        repo,
        head: params.head,
        base: params.base,
        title: params.title,
        body: params.body,
        draft: params.draft ?? false,
      });

      const result: CreatePullRequestResult = {
        url: response.data.html_url,
        number: response.data.number,
      };

      logger.info('Pull request created successfully', {
        url: result.url,
        number: result.number,
      });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to create pull request', {
        error: errorMessage,
        owner,
        repo,
        head: params.head,
        base: params.base,
      });
      throw new Error(`Failed to create pull request: ${errorMessage}`);
    }
  }

  /**
   * Gets information about a pull request.
   *
   * @param repoUrl - The GitHub repository URL
   * @param prNumber - The pull request number
   * @returns The pull request information
   */
  async getPullRequest(repoUrl: string, prNumber: number): Promise<PullRequestInfo> {
    const { owner, repo } = parseGitHubUrl(repoUrl);

    logger.debug('Fetching pull request', { owner, repo, prNumber });

    try {
      const response = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const pr = response.data;

      // Determine the state (including merged)
      let state: PullRequestInfo['state'];
      if (pr.merged) {
        state = 'merged';
      } else if (pr.state === 'closed') {
        state = 'closed';
      } else {
        state = 'open';
      }

      const result: PullRequestInfo = {
        number: pr.number,
        url: pr.html_url,
        title: pr.title,
        body: pr.body,
        state,
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at,
        user: {
          login: pr.user?.login ?? 'unknown',
          avatarUrl: pr.user?.avatar_url ?? '',
        },
        labels: pr.labels.map((label) => (typeof label === 'string' ? label : label.name ?? '')),
        reviewers: pr.requested_reviewers?.map((r) => ('login' in r ? r.login : '')) ?? [],
        isDraft: pr.draft ?? false,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state,
        comments: pr.comments,
        commits: pr.commits,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
      };

      logger.debug('Pull request fetched successfully', { prNumber, state });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to fetch pull request', {
        error: errorMessage,
        owner,
        repo,
        prNumber,
      });
      throw new Error(`Failed to fetch pull request #${prNumber}: ${errorMessage}`);
    }
  }

  /**
   * Lists open pull requests for a repository.
   *
   * @param repoUrl - The GitHub repository URL
   * @param options - Optional filters
   * @returns Array of pull request information
   */
  async listPullRequests(
    repoUrl: string,
    options: {
      state?: 'open' | 'closed' | 'all';
      head?: string;
      base?: string;
      sort?: 'created' | 'updated' | 'popularity' | 'long-running';
      direction?: 'asc' | 'desc';
      perPage?: number;
    } = {}
  ): Promise<PullRequestInfo[]> {
    const { owner, repo } = parseGitHubUrl(repoUrl);

    logger.debug('Listing pull requests', { owner, repo, options });

    try {
      // Build request parameters, only including defined optional values
      // to satisfy exactOptionalPropertyTypes
      const listParams: Parameters<typeof this.octokit.rest.pulls.list>[0] = {
        owner,
        repo,
        state: options.state ?? 'open',
        sort: options.sort ?? 'created',
        direction: options.direction ?? 'desc',
        per_page: options.perPage ?? 30,
      };
      if (options.head !== undefined) {
        listParams.head = options.head;
      }
      if (options.base !== undefined) {
        listParams.base = options.base;
      }
      const response = await this.octokit.rest.pulls.list(listParams);

      return response.data.map((pr) => ({
        number: pr.number,
        url: pr.html_url,
        title: pr.title,
        body: pr.body,
        state: pr.state as PullRequestInfo['state'],
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at,
        user: {
          login: pr.user?.login ?? 'unknown',
          avatarUrl: pr.user?.avatar_url ?? '',
        },
        labels: pr.labels.map((label) => (typeof label === 'string' ? label : label.name ?? '')),
        reviewers: pr.requested_reviewers?.map((r) => ('login' in r ? r.login : '')) ?? [],
        isDraft: pr.draft ?? false,
        mergeable: null, // Not available in list endpoint
        mergeableState: '',
        comments: 0, // Not available in list endpoint
        commits: 0,
        additions: 0,
        deletions: 0,
        changedFiles: 0,
      }));
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to list pull requests', {
        error: errorMessage,
        owner,
        repo,
      });
      throw new Error(`Failed to list pull requests: ${errorMessage}`);
    }
  }

  /**
   * Adds a comment to a pull request.
   *
   * @param repoUrl - The GitHub repository URL
   * @param prNumber - The pull request number
   * @param body - The comment body
   * @returns The comment URL
   */
  async addPullRequestComment(
    repoUrl: string,
    prNumber: number,
    body: string
  ): Promise<string> {
    const { owner, repo } = parseGitHubUrl(repoUrl);

    logger.debug('Adding comment to pull request', { owner, repo, prNumber });

    try {
      const response = await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });

      logger.info('Comment added successfully', { prNumber, commentId: response.data.id });

      return response.data.html_url;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to add comment', {
        error: errorMessage,
        owner,
        repo,
        prNumber,
      });
      throw new Error(`Failed to add comment to PR #${prNumber}: ${errorMessage}`);
    }
  }

  /**
   * Updates a pull request.
   *
   * @param repoUrl - The GitHub repository URL
   * @param prNumber - The pull request number
   * @param updates - The fields to update
   */
  async updatePullRequest(
    repoUrl: string,
    prNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      base?: string;
    }
  ): Promise<void> {
    const { owner, repo } = parseGitHubUrl(repoUrl);

    logger.debug('Updating pull request', { owner, repo, prNumber, updates });

    try {
      await this.octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        ...updates,
      });

      logger.info('Pull request updated successfully', { prNumber });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to update pull request', {
        error: errorMessage,
        owner,
        repo,
        prNumber,
      });
      throw new Error(`Failed to update PR #${prNumber}: ${errorMessage}`);
    }
  }

  /**
   * Verifies the GitHub token is valid and has required permissions.
   *
   * @returns Information about the authenticated user
   */
  async verifyAuthentication(): Promise<{ login: string; scopes: string[] }> {
    logger.debug('Verifying GitHub authentication');

    try {
      const response = await this.octokit.rest.users.getAuthenticated();

      // Get rate limit info which includes scopes
      const rateLimit = await this.octokit.rest.rateLimit.get();

      // Scopes are in the response headers, but Octokit doesn't expose them directly
      // We'll return an empty array for scopes as they're not easily accessible
      const result = {
        login: response.data.login,
        scopes: [], // Would need custom header inspection to get scopes
      };

      logger.info('GitHub authentication verified', {
        login: result.login,
        rateLimit: rateLimit.data.rate.remaining,
      });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('GitHub authentication failed', { error: errorMessage });
      throw new Error(`GitHub authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Gets repository information.
   *
   * @param repoUrl - The GitHub repository URL
   * @returns Repository information
   */
  async getRepository(repoUrl: string): Promise<{
    fullName: string;
    defaultBranch: string;
    isPrivate: boolean;
    description: string | null;
  }> {
    const { owner, repo } = parseGitHubUrl(repoUrl);

    logger.debug('Fetching repository info', { owner, repo });

    try {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      return {
        fullName: response.data.full_name,
        defaultBranch: response.data.default_branch,
        isPrivate: response.data.private,
        description: response.data.description,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to fetch repository info', {
        error: errorMessage,
        owner,
        repo,
      });
      throw new Error(`Failed to fetch repository: ${errorMessage}`);
    }
  }
}

/**
 * Singleton instance of the GitHub client.
 */
let githubClientInstance: GitHubClient | null = null;

/**
 * Gets the GitHub client instance.
 * Creates a new instance if one doesn't exist.
 *
 * @throws Error if GITHUB_TOKEN is not configured
 */
export function getGitHubClient(): GitHubClient {
  if (githubClientInstance === null) {
    githubClientInstance = new GitHubClient();
  }
  return githubClientInstance;
}

export default getGitHubClient;
