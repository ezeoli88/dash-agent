import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { getGitHubClient, type PRCommentInfo } from '../github/client.js';
import { isGitLabUrl } from '../utils/gitlab-url.js';
import { getGitLabClient, hasGitLabToken } from '../gitlab/client.js';
import { getSSEEmitter, type PRCommentData } from '../utils/sse-emitter.js';
import { taskService, type Task, type TaskStatus } from './task.service.js';
import { getAgentService } from './agent.service.js';

const logger = createLogger('pr-comments-service');

/**
 * Polling interval in milliseconds (60 seconds)
 */
const POLLING_INTERVAL_MS = 60_000;

/**
 * Statuses that indicate a task has an active PR that should be monitored for comments
 */
const PR_ACTIVE_STATUSES: TaskStatus[] = ['pr_created', 'changes_requested'];

/**
 * Tracked PR information for polling
 */
interface TrackedPR {
  taskId: string;
  repoUrl: string;
  prNumber: number;
  /** Set of comment IDs we've already seen */
  seenCommentIds: Set<number>;
  /** ISO timestamp of the last poll */
  lastPollTime: string;
}

/**
 * Service for polling GitHub PR comments and notifying users of new comments.
 *
 * This service:
 * - Polls GitHub API every 60 seconds for comments on PRs with active tasks
 * - Tracks seen comments to detect new ones
 * - Emits SSE events when new comments are detected
 * - Automatically starts/stops polling based on task status changes
 */
export class PRCommentsService {
  /** Map of task ID to tracked PR info */
  private trackedPRs: Map<string, TrackedPR> = new Map();

  /** Polling interval handle */
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  /** Whether the service is currently running */
  private isRunning: boolean = false;

  /**
   * Starts the PR comments polling service.
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('PR comments service is already running');
      return;
    }

    logger.info('Starting PR comments polling service');
    this.isRunning = true;

    // Initialize tracking for existing tasks with PRs
    this.initializeTracking();

    // Start polling
    this.pollingInterval = setInterval(() => {
      this.pollAllPRs().catch((error) => {
        logger.error('Error during PR comments polling', { error: getErrorMessage(error) });
      });
    }, POLLING_INTERVAL_MS);

    logger.info('PR comments polling service started', {
      pollingIntervalMs: POLLING_INTERVAL_MS,
      trackedPRsCount: this.trackedPRs.size,
    });
  }

  /**
   * Stops the PR comments polling service.
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping PR comments polling service');

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.trackedPRs.clear();
    this.isRunning = false;

    logger.info('PR comments polling service stopped');
  }

  /**
   * Initialize tracking for all existing tasks with active PRs.
   */
  private initializeTracking(): void {
    for (const status of PR_ACTIVE_STATUSES) {
      const tasks = taskService.getByStatus(status);
      for (const task of tasks) {
        if (task.pr_url) {
          this.trackPR(task);
        }
      }
    }
  }

  /**
   * Start tracking a PR for a task.
   * Called when a task transitions to a PR-active status.
   */
  trackPR(task: Task): void {
    if (!task.pr_url) {
      logger.debug('Cannot track PR for task without pr_url', { taskId: task.id });
      return;
    }

    // Extract PR number from URL
    const prNumber = this.extractPRNumber(task.pr_url);
    if (prNumber === null) {
      logger.warn('Failed to extract PR number from URL', { prUrl: task.pr_url, taskId: task.id });
      return;
    }

    // Check if already tracking
    if (this.trackedPRs.has(task.id)) {
      logger.debug('Already tracking PR for task', { taskId: task.id });
      return;
    }

    const trackedPR: TrackedPR = {
      taskId: task.id,
      repoUrl: task.repo_url,
      prNumber,
      seenCommentIds: new Set(),
      lastPollTime: new Date().toISOString(),
    };

    this.trackedPRs.set(task.id, trackedPR);
    logger.info('Started tracking PR for comments', {
      taskId: task.id,
      prNumber,
      repoUrl: task.repo_url,
    });

    // Do an initial fetch to populate seen comments (without notifying)
    this.fetchAndProcessComments(trackedPR, true).catch((error) => {
      logger.error('Failed to fetch initial PR comments', {
        taskId: task.id,
        error: getErrorMessage(error),
      });
    });
  }

  /**
   * Stop tracking a PR for a task.
   * Called when a task transitions to a non-PR-active status.
   */
  untrackPR(taskId: string): void {
    if (this.trackedPRs.has(taskId)) {
      this.trackedPRs.delete(taskId);
      logger.info('Stopped tracking PR for comments', { taskId });
    }
  }

  /**
   * Called when a task status changes to update PR tracking.
   */
  onTaskStatusChange(task: Task, newStatus: TaskStatus): void {
    const shouldTrack = PR_ACTIVE_STATUSES.includes(newStatus) && task.pr_url !== null;
    const isTracking = this.trackedPRs.has(task.id);

    if (shouldTrack && !isTracking) {
      this.trackPR(task);
    } else if (!shouldTrack && isTracking) {
      this.untrackPR(task.id);
    }
  }

  /**
   * Poll all tracked PRs for new comments.
   */
  private async pollAllPRs(): Promise<void> {
    if (this.trackedPRs.size === 0) {
      return;
    }

    logger.debug('Polling PRs for new comments', { count: this.trackedPRs.size });

    const pollPromises: Promise<void>[] = [];
    for (const trackedPR of this.trackedPRs.values()) {
      pollPromises.push(
        this.fetchAndProcessComments(trackedPR, false).catch((error) => {
          logger.error('Failed to poll PR for comments', {
            taskId: trackedPR.taskId,
            prNumber: trackedPR.prNumber,
            error: getErrorMessage(error),
          });
        })
      );
    }

    await Promise.all(pollPromises);
  }

  /**
   * Fetch comments for a PR/MR and process new ones.
   * Supports both GitHub PRs and GitLab MRs.
   */
  private async fetchAndProcessComments(trackedPR: TrackedPR, isInitialFetch: boolean): Promise<void> {
    const isGitLab = isGitLabUrl(trackedPR.repoUrl);

    // Check PR/MR state first (only on regular polling, not initial fetch)
    if (!isInitialFetch) {
      try {
        if (isGitLab) {
          if (!hasGitLabToken()) {
            logger.warn('GitLab token not available, skipping MR state check', {
              taskId: trackedPR.taskId,
              prNumber: trackedPR.prNumber,
            });
          } else {
            const gitlabClient = getGitLabClient();
            const mrInfo = await gitlabClient.getMergeRequest(trackedPR.repoUrl, trackedPR.prNumber);

            if (mrInfo.state === 'merged') {
              logger.info('MR was merged on GitLab, auto-updating task status', {
                taskId: trackedPR.taskId,
                prNumber: trackedPR.prNumber,
              });
              const agentService = getAgentService();
              await agentService.markPRMerged(trackedPR.taskId);
              this.untrackPR(trackedPR.taskId);
              return;
            }

            if (mrInfo.state === 'closed') {
              logger.info('MR was closed on GitLab, auto-updating task status', {
                taskId: trackedPR.taskId,
                prNumber: trackedPR.prNumber,
              });
              const agentService = getAgentService();
              await agentService.markPRClosed(trackedPR.taskId);
              this.untrackPR(trackedPR.taskId);
              return;
            }
          }
        } else {
          const githubClient = getGitHubClient();
          const prInfo = await githubClient.getPullRequest(trackedPR.repoUrl, trackedPR.prNumber);

          if (prInfo.state === 'merged') {
            logger.info('PR was merged on GitHub, auto-updating task status', {
              taskId: trackedPR.taskId,
              prNumber: trackedPR.prNumber,
            });
            const agentService = getAgentService();
            await agentService.markPRMerged(trackedPR.taskId);
            this.untrackPR(trackedPR.taskId);
            return;
          }

          if (prInfo.state === 'closed') {
            logger.info('PR was closed on GitHub, auto-updating task status', {
              taskId: trackedPR.taskId,
              prNumber: trackedPR.prNumber,
            });
            const agentService = getAgentService();
            await agentService.markPRClosed(trackedPR.taskId);
            this.untrackPR(trackedPR.taskId);
            return;
          }
        }
      } catch (error) {
        // Log the error but continue with comment fetching
        // The PR/MR might still be accessible for comments even if state check fails
        logger.warn('Failed to check PR/MR state, continuing with comment fetch', {
          taskId: trackedPR.taskId,
          prNumber: trackedPR.prNumber,
          error: getErrorMessage(error),
        });
      }
    }

    // Fetch comments (only new ones if we have a lastPollTime and not initial)
    const since = isInitialFetch ? undefined : trackedPR.lastPollTime;
    let comments: PRCommentInfo[];

    if (isGitLab) {
      if (!hasGitLabToken()) {
        logger.warn('GitLab token not available, skipping MR comment fetch', {
          taskId: trackedPR.taskId,
          prNumber: trackedPR.prNumber,
        });
        return;
      }
      const gitlabClient = getGitLabClient();
      comments = await gitlabClient.getMergeRequestNotes(
        trackedPR.repoUrl,
        trackedPR.prNumber,
        since
      );
    } else {
      const githubClient = getGitHubClient();
      comments = await githubClient.getPullRequestComments(
        trackedPR.repoUrl,
        trackedPR.prNumber,
        since
      );
    }

    // Update last poll time
    trackedPR.lastPollTime = new Date().toISOString();

    // Find new comments
    const newComments = comments.filter((comment) => !trackedPR.seenCommentIds.has(comment.id));

    if (newComments.length === 0) {
      return;
    }

    // Mark all as seen
    for (const comment of newComments) {
      trackedPR.seenCommentIds.add(comment.id);
    }

    // Only emit SSE events for non-initial fetches
    if (!isInitialFetch) {
      logger.info('New PR comments detected', {
        taskId: trackedPR.taskId,
        prNumber: trackedPR.prNumber,
        newCommentsCount: newComments.length,
      });

      const sseEmitter = getSSEEmitter();
      for (const comment of newComments) {
        const commentData: PRCommentData = {
          id: comment.id,
          body: comment.body,
          author: {
            login: comment.author.login,
          },
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          url: comment.url,
          isReviewComment: comment.isReviewComment,
        };
        if (comment.author.avatarUrl) {
          commentData.author.avatarUrl = comment.author.avatarUrl;
        }
        if (comment.path) {
          commentData.path = comment.path;
        }
        if (comment.line !== undefined) {
          commentData.line = comment.line;
        }
        sseEmitter.emitPRComment(trackedPR.taskId, commentData);
      }
    } else {
      logger.debug('Initial fetch - marking comments as seen', {
        taskId: trackedPR.taskId,
        commentCount: newComments.length,
      });
    }
  }

  /**
   * Extract PR/MR number from a GitHub PR URL or GitLab MR URL.
   * Examples:
   *   https://github.com/owner/repo/pull/123 -> 123
   *   https://gitlab.com/owner/repo/-/merge_requests/456 -> 456
   */
  private extractPRNumber(prUrl: string): number | null {
    // Try GitHub format: /pull/123
    const ghMatch = prUrl.match(/\/pull\/(\d+)/);
    if (ghMatch && ghMatch[1]) {
      return parseInt(ghMatch[1], 10);
    }

    // Try GitLab format: /merge_requests/456
    const glMatch = prUrl.match(/\/merge_requests\/(\d+)/);
    if (glMatch && glMatch[1]) {
      return parseInt(glMatch[1], 10);
    }

    return null;
  }

  /**
   * Get the list of currently tracked PRs (for debugging/monitoring).
   */
  getTrackedPRs(): Array<{ taskId: string; prNumber: number; seenCommentsCount: number }> {
    return Array.from(this.trackedPRs.values()).map((pr) => ({
      taskId: pr.taskId,
      prNumber: pr.prNumber,
      seenCommentsCount: pr.seenCommentIds.size,
    }));
  }

  /**
   * Check if the service is currently running.
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Force an immediate poll for a specific task's PR/MR.
   * Useful when the user wants to refresh comments.
   */
  async pollPRNow(taskId: string): Promise<PRCommentInfo[]> {
    const trackedPR = this.trackedPRs.get(taskId);
    if (!trackedPR) {
      throw new Error(`Task ${taskId} is not being tracked for PR comments`);
    }

    if (isGitLabUrl(trackedPR.repoUrl)) {
      if (!hasGitLabToken()) {
        logger.warn('GitLab token not available, cannot poll MR comments', { taskId });
        return [];
      }
      const gitlabClient = getGitLabClient();
      return gitlabClient.getMergeRequestNotes(
        trackedPR.repoUrl,
        trackedPR.prNumber
      );
    }

    const githubClient = getGitHubClient();
    return githubClient.getPullRequestComments(
      trackedPR.repoUrl,
      trackedPR.prNumber
    );
  }
}

/** Singleton instance */
let prCommentsServiceInstance: PRCommentsService | null = null;

/**
 * Gets the PR comments service instance.
 */
export function getPRCommentsService(): PRCommentsService {
  if (prCommentsServiceInstance === null) {
    prCommentsServiceInstance = new PRCommentsService();
  }
  return prCommentsServiceInstance;
}

export default getPRCommentsService;
