/**
 * GitHub module exports.
 * Provides GitHub API client functionality.
 */

export {
  GitHubClient,
  getGitHubClient,
  resetGitHubClient,
  type PullRequestInfo,
  type CreatePullRequestParams,
  type CreatePullRequestResult,
} from './client.js';
