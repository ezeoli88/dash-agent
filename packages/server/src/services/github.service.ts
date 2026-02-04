import { Octokit } from 'octokit';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * A repository from the user's GitHub account
 */
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  language: string | null;
  updated_at: string;
  stargazers_count: number;
}

/**
 * Response from listing GitHub repositories
 */
export interface GitHubReposResponse {
  repos: GitHubRepository[];
  total: number;
}

const logger = createLogger('github-service');

/**
 * Service for interacting with GitHub API
 */
export class GitHubService {
  private octokit: Octokit;
  private username: string | null = null;

  constructor(githubToken: string) {
    this.octokit = new Octokit({ auth: githubToken });
  }

  /**
   * Get the authenticated user's username
   */
  async getUsername(): Promise<string> {
    if (this.username) {
      return this.username;
    }

    const response = await this.octokit.rest.users.getAuthenticated();
    this.username = response.data.login;
    return this.username;
  }

  /**
   * List repositories for the authenticated user
   */
  async listUserRepos(options: {
    page?: number;
    perPage?: number;
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    direction?: 'asc' | 'desc';
    type?: 'all' | 'owner' | 'public' | 'private' | 'member';
  } = {}): Promise<GitHubReposResponse> {
    const {
      page = 1,
      perPage = 30,
      sort = 'updated',
      direction = 'desc',
      type = 'owner',
    } = options;

    logger.info('Listing user repositories', { page, perPage, sort, type });

    try {
      const response = await this.octokit.rest.repos.listForAuthenticatedUser({
        page,
        per_page: perPage,
        sort,
        direction,
        type,
      });

      const repos: GitHubRepository[] = response.data.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description,
        default_branch: repo.default_branch,
        private: repo.private,
        language: repo.language,
        updated_at: repo.updated_at ?? new Date().toISOString(),
        stargazers_count: repo.stargazers_count,
      }));

      logger.info('User repositories listed successfully', {
        count: repos.length,
        page,
      });

      return {
        repos,
        total: repos.length, // GitHub doesn't return total count easily
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to list user repositories', { error: errorMessage });
      throw new Error(`Failed to list repositories: ${errorMessage}`);
    }
  }

  /**
   * Search repositories accessible to the user
   */
  async searchRepos(query: string, options: {
    page?: number;
    perPage?: number;
  } = {}): Promise<GitHubReposResponse> {
    const { page = 1, perPage = 30 } = options;

    logger.info('Searching repositories', { query, page, perPage });

    try {
      const username = await this.getUsername();

      // Search for repos owned by the user that match the query
      const searchQuery = `${query} user:${username}`;

      const response = await this.octokit.rest.search.repos({
        q: searchQuery,
        page,
        per_page: perPage,
        sort: 'updated',
        order: 'desc',
      });

      const repos: GitHubRepository[] = response.data.items.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description,
        default_branch: repo.default_branch,
        private: repo.private,
        language: repo.language,
        updated_at: repo.updated_at ?? new Date().toISOString(),
        stargazers_count: repo.stargazers_count,
      }));

      logger.info('Repository search completed', {
        query,
        count: repos.length,
        total: response.data.total_count,
      });

      return {
        repos,
        total: response.data.total_count,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to search repositories', { error: errorMessage, query });
      throw new Error(`Failed to search repositories: ${errorMessage}`);
    }
  }

  /**
   * Get information about a specific repository
   */
  async getRepo(owner: string, repo: string): Promise<GitHubRepository> {
    logger.info('Getting repository info', { owner, repo });

    try {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      const repoInfo: GitHubRepository = {
        id: response.data.id,
        name: response.data.name,
        full_name: response.data.full_name,
        html_url: response.data.html_url,
        description: response.data.description,
        default_branch: response.data.default_branch,
        private: response.data.private,
        language: response.data.language,
        updated_at: response.data.updated_at ?? new Date().toISOString(),
        stargazers_count: response.data.stargazers_count,
      };

      logger.info('Repository info retrieved', { full_name: repoInfo.full_name });

      return repoInfo;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to get repository info', { owner, repo, error: errorMessage });
      throw new Error(`Failed to get repository: ${errorMessage}`);
    }
  }

  /**
   * Get repository branches
   */
  async getBranches(owner: string, repo: string): Promise<string[]> {
    logger.info('Getting repository branches', { owner, repo });

    try {
      const response = await this.octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      });

      const branches = response.data.map((branch) => branch.name);

      logger.info('Repository branches retrieved', {
        owner,
        repo,
        count: branches.length,
      });

      return branches;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to get repository branches', { owner, repo, error: errorMessage });
      throw new Error(`Failed to get branches: ${errorMessage}`);
    }
  }

  /**
   * Validate that a repository URL is accessible
   */
  async validateRepoUrl(url: string): Promise<{ valid: boolean; error?: string; repo?: GitHubRepository }> {
    logger.info('Validating repository URL', { url });

    try {
      // Parse the URL to extract owner and repo
      const match = url.match(/github\.com[/:]([^/]+)\/([^/\s.]+)/);
      if (!match || !match[1] || !match[2]) {
        return { valid: false, error: 'Invalid GitHub repository URL' };
      }

      const owner = match[1];
      const repo = match[2].replace(/\.git$/, '');

      const repoInfo = await this.getRepo(owner, repo);

      return { valid: true, repo: repoInfo };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return { valid: false, error: errorMessage };
    }
  }
}

/**
 * Create a GitHub service with the given token
 */
export function createGitHubService(githubToken: string): GitHubService {
  return new GitHubService(githubToken);
}
