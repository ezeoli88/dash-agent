import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { parseGitLabUrl } from '../utils/gitlab-url.js';
import { getGitLabCredentials } from '../services/secrets.service.js';
import type { PRCommentInfo } from '../github/client.js';

const logger = createLogger('gitlab-client');

/**
 * Parameters for creating a merge request.
 */
export interface CreateMergeRequestParams {
  repoUrl: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}

/**
 * Result of creating a merge request.
 */
export interface CreateMergeRequestResult {
  url: string;
  number: number;
}

/**
 * Information about a GitLab merge request state.
 */
export interface MergeRequestInfo {
  state: 'opened' | 'closed' | 'merged';
  iid: number;
  web_url: string;
}

/**
 * Strips embedded credentials from a git URL.
 * e.g. https://oauth2:token@gitlab.com/user/repo.git -> https://gitlab.com/user/repo.git
 */
export function stripCredentialsFromUrl(url: string): string {
  return url.replace(/\/\/[^@]+@/, '//');
}

/**
 * Extracts an embedded token from a git URL with credentials.
 * e.g. https://oauth2:TOKEN@gitlab.com/user/repo.git -> TOKEN
 * Returns null if no embedded credentials are found.
 */
export function extractTokenFromUrl(url: string): string | null {
  const match = url.match(/\/\/[^:]+:([^@]+)@/);
  return match?.[1] ?? null;
}

/**
 * Minimal GitLab API client for creating Merge Requests.
 */
export class GitLabClient {
  private readonly token: string;

  constructor(token?: string) {
    const authToken = token ?? getGitLabToken();

    if (!authToken) {
      throw new Error('GitLab token is required. Configure via Settings > Conexiones.');
    }

    this.token = authToken;
  }

  /**
   * Creates a merge request on GitLab.
   */
  async createMergeRequest(params: CreateMergeRequestParams): Promise<CreateMergeRequestResult> {
    // Strip credentials from URL before parsing
    const cleanUrl = stripCredentialsFromUrl(params.repoUrl);
    const { owner, repo } = parseGitLabUrl(cleanUrl);
    const projectPath = encodeURIComponent(`${owner}/${repo}`);

    logger.info('Creating merge request', {
      project: `${owner}/${repo}`,
      sourceBranch: params.sourceBranch,
      targetBranch: params.targetBranch,
      title: params.title,
    });

    try {
      const response = await fetch(
        `https://gitlab.com/api/v4/projects/${projectPath}/merge_requests`,
        {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': this.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source_branch: params.sourceBranch,
            target_branch: params.targetBranch,
            title: params.title,
            description: params.description,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`GitLab API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json() as { web_url: string; iid: number };

      const result: CreateMergeRequestResult = {
        url: data.web_url,
        number: data.iid,
      };

      logger.info('Merge request created successfully', {
        url: result.url,
        number: result.number,
      });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to create merge request', {
        error: errorMessage,
        project: `${owner}/${repo}`,
        sourceBranch: params.sourceBranch,
        targetBranch: params.targetBranch,
      });
      throw new Error(`Failed to create merge request: ${errorMessage}`);
    }
  }

  /**
   * Gets information about a merge request (state, iid, web_url).
   *
   * @param repoUrl - The GitLab repository URL
   * @param mrNumber - The merge request IID
   * @returns The merge request info
   */
  async getMergeRequest(repoUrl: string, mrNumber: number): Promise<MergeRequestInfo> {
    const cleanUrl = stripCredentialsFromUrl(repoUrl);
    const { owner, repo } = parseGitLabUrl(cleanUrl);
    const projectPath = encodeURIComponent(`${owner}/${repo}`);

    logger.debug('Fetching merge request', { project: `${owner}/${repo}`, mrNumber });

    try {
      const response = await fetch(
        `https://gitlab.com/api/v4/projects/${projectPath}/merge_requests/${mrNumber}`,
        {
          method: 'GET',
          headers: {
            'PRIVATE-TOKEN': this.token,
          },
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`GitLab API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json() as { state: 'opened' | 'closed' | 'merged'; iid: number; web_url: string };

      const result: MergeRequestInfo = {
        state: data.state,
        iid: data.iid,
        web_url: data.web_url,
      };

      logger.debug('Merge request fetched successfully', { mrNumber, state: result.state });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to fetch merge request', {
        error: errorMessage,
        project: `${owner}/${repo}`,
        mrNumber,
      });
      throw new Error(`Failed to fetch merge request !${mrNumber}: ${errorMessage}`);
    }
  }

  /**
   * Gets notes (comments) on a merge request, mapped to PRCommentInfo interface.
   * Filters out system-generated notes (e.g., "merged", "changed title").
   *
   * @param repoUrl - The GitLab repository URL
   * @param mrNumber - The merge request IID
   * @param since - Optional ISO timestamp to filter notes updated after this time
   * @returns Array of PR comments
   */
  async getMergeRequestNotes(repoUrl: string, mrNumber: number, since?: string): Promise<PRCommentInfo[]> {
    const cleanUrl = stripCredentialsFromUrl(repoUrl);
    const { owner, repo } = parseGitLabUrl(cleanUrl);
    const projectPath = encodeURIComponent(`${owner}/${repo}`);

    logger.debug('Fetching merge request notes', { project: `${owner}/${repo}`, mrNumber, since });

    try {
      let apiUrl = `https://gitlab.com/api/v4/projects/${projectPath}/merge_requests/${mrNumber}/notes`;
      if (since) {
        const params = new URLSearchParams({
          order_by: 'updated_at',
          sort: 'asc',
          updated_after: since,
        });
        apiUrl += `?${params.toString()}`;
      }

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'PRIVATE-TOKEN': this.token,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`GitLab API error (${response.status}): ${errorBody}`);
      }

      interface GitLabNote {
        id: number;
        body: string;
        author: { username: string; avatar_url?: string };
        created_at: string;
        updated_at: string;
        system: boolean;
        noteable_iid?: number;
      }

      const notes = await response.json() as GitLabNote[];

      // Filter out system-generated notes (auto-generated by GitLab)
      const userNotes = notes.filter((note) => !note.system);

      // Build the MR web URL for constructing note URLs
      const mrWebUrl = `https://gitlab.com/${owner}/${repo}/-/merge_requests/${mrNumber}`;

      const comments: PRCommentInfo[] = userNotes.map((note) => {
        const result: PRCommentInfo = {
          id: note.id,
          body: note.body,
          author: {
            login: note.author.username,
          },
          createdAt: note.created_at,
          updatedAt: note.updated_at,
          url: `${mrWebUrl}#note_${note.id}`,
          isReviewComment: false,
        };
        if (note.author.avatar_url) {
          result.author.avatarUrl = note.author.avatar_url;
        }
        return result;
      });

      logger.debug('Fetched merge request notes', {
        mrNumber,
        totalNotes: notes.length,
        userNotes: userNotes.length,
      });

      return comments;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to fetch merge request notes', {
        error: errorMessage,
        project: `${owner}/${repo}`,
        mrNumber,
      });
      throw new Error(`Failed to fetch merge request notes for !${mrNumber}: ${errorMessage}`);
    }
  }
}

/**
 * Gets the GitLab token from secrets service.
 */
function getGitLabToken(): string | null {
  const credentials = getGitLabCredentials();
  if (credentials?.token) {
    return credentials.token;
  }
  return null;
}

/**
 * Singleton instance.
 */
let gitlabClientInstance: GitLabClient | null = null;

/**
 * Gets the GitLab client instance.
 */
export function getGitLabClient(forceNew: boolean = false): GitLabClient {
  if (gitlabClientInstance === null || forceNew) {
    gitlabClientInstance = new GitLabClient();
  }
  return gitlabClientInstance;
}

/**
 * Resets the GitLab client singleton.
 */
export function resetGitLabClient(): void {
  logger.info('Resetting GitLab client singleton');
  gitlabClientInstance = null;
}

/**
 * Checks if a GitLab token is available.
 */
export function hasGitLabToken(): boolean {
  return getGitLabToken() !== null;
}
