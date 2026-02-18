import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskService } from "../../services/task.service.js";
import { getAgentService } from "../../services/agent.service.js";
import { getGitService } from "../../services/git.service.js";
import { createLogger } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import { mcpError, mcpInternalError, mapPRCreationError, McpErrorCode, type McpErrorCode as McpErrorCodeType } from "../errors.js";
import { getDataEventEmitter } from "../../utils/data-events.js";

const logger = createLogger("mcp:review-tools");

/**
 * Helper: retrieves task changes from live worktree or persisted data.
 * Returns { files, diff } or throws an error string.
 */
async function getTaskChangesData(
  taskId: string
): Promise<{ data: unknown } | { error: { code: McpErrorCodeType; message: string; hint: string } }> {
  const task = taskService.getById(taskId);
  if (!task) {
    return { error: { code: McpErrorCode.TASK_NOT_FOUND, message: `Task not found (id: ${taskId})`, hint: "Use list_tasks to see available tasks." } };
  }

  const getPersistedChanges = (): unknown | null => {
    if (!task.changes_data) return null;
    try {
      return JSON.parse(task.changes_data);
    } catch {
      logger.warn("Failed to parse persisted changes_data", { taskId });
      return null;
    }
  };

  // Try live worktree first
  const gitService = getGitService();
  const workspacePath = gitService.getWorktreePath(taskId);

  if (workspacePath) {
    try {
      const [files, diff] = await Promise.all([
        gitService.getChangedFiles(workspacePath, task.target_branch),
        gitService.getDiff(workspacePath, task.target_branch),
      ]);

      const isLiveEmpty =
        files.length === 0 && (!diff || diff === "No changes detected");

      if (!isLiveEmpty) {
        return {
          data: {
            files: files.map((f) => ({
              path: f.path,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              oldContent: f.oldContent,
              newContent: f.newContent,
            })),
            diff,
          },
        };
      }

      // Live is empty, try persisted fallback
      const persisted = getPersistedChanges();
      if (persisted) {
        return { data: persisted };
      }
    } catch (liveError) {
      logger.warn("Failed to read live worktree changes, trying persisted", {
        taskId,
        error: getErrorMessage(liveError),
      });

      const persisted = getPersistedChanges();
      if (persisted) {
        return { data: persisted };
      }
    }
  }

  // Fallback to persisted changes data
  const persisted = getPersistedChanges();
  if (persisted) {
    return { data: persisted };
  }

  return { error: { code: McpErrorCode.NO_CHANGES_AVAILABLE, message: "No changes available. No worktree or persisted changes found for this task.", hint: "The agent may still be working. Use get_task to check status." } };
}

/**
 * Registers review and PR lifecycle MCP tools on the server.
 */
export function registerReviewTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // get_task_changes
  // -------------------------------------------------------------------------
  server.tool(
    "get_task_changes",
    "Get the files changed by the agent for a task. Returns a list of changed files with their diff content. Tries the live worktree first, then falls back to persisted changes data.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const result = await getTaskChangesData(args.task_id);

        if ("error" in result) {
          return mcpError(result.error.code, result.error.message, result.error.hint);
        }

        logger.info("get_task_changes", { id: args.task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("get_task_changes failed", {
          error: getErrorMessage(error),
        });
        return mcpInternalError("Error getting task changes", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // approve_changes
  // -------------------------------------------------------------------------
  server.tool(
    "approve_changes",
    "Approve the agent's code changes and create a Pull Request. Only valid when the task is in 'awaiting_review' or 'review' status. Returns the PR URL on success.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        if (task.status !== "awaiting_review" && task.status !== "review") {
          return mcpError(McpErrorCode.INVALID_TASK_STATUS, `Cannot approve task with status '${task.status}'. Expected: awaiting_review or review`, "Use get_task to check current status.");
        }

        const agentService = getAgentService();
        const prUrl = await agentService.approveAndCreatePR(args.task_id);

        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
        logger.info("approve_changes", { id: args.task_id, prUrl });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ status: "approved", pr_url: prUrl }),
            },
          ],
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        const mapped = mapPRCreationError(errorMsg);
        logger.error("approve_changes failed", { error: errorMsg });
        return mapped || mcpInternalError("Error approving changes", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // request_changes
  // -------------------------------------------------------------------------
  server.tool(
    "request_changes",
    "Request changes on a task's PR. Only valid when the task is in 'pr_created' or 'review' status. Sets the task to 'changes_requested' and stores the feedback for the agent.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
      feedback: z
        .string()
        .min(1)
        .describe("Detailed feedback describing what changes are needed"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        if (task.status !== "pr_created" && task.status !== "review") {
          return mcpError(McpErrorCode.INVALID_TASK_STATUS, `Cannot request changes for task with status '${task.status}'. Expected: pr_created or review`, "Use get_task to check current status.");
        }

        const agentService = getAgentService();
        await agentService.requestChanges(args.task_id, args.feedback);

        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
        logger.info("request_changes", { id: args.task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "changes_requested",
                message:
                  "Changes requested. Use execute_task to resume the agent.",
              }),
            },
          ],
        };
      } catch (error) {
        logger.error("request_changes failed", {
          error: getErrorMessage(error),
        });
        return mcpInternalError("Error requesting changes", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // mark_pr_merged
  // -------------------------------------------------------------------------
  server.tool(
    "mark_pr_merged",
    "Mark a task's PR as merged. Updates the task status to 'done' and cleans up the worktree. Only valid when the task is in 'pr_created' or 'review' status.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        if (task.status !== "pr_created" && task.status !== "review") {
          return mcpError(McpErrorCode.INVALID_TASK_STATUS, `Cannot mark PR as merged for task with status '${task.status}'. Expected: pr_created or review`, "Use get_task to check current status.");
        }

        const agentService = getAgentService();
        await agentService.markPRMerged(args.task_id);

        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
        logger.info("mark_pr_merged", { id: args.task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "done",
                message: "PR marked as merged. Worktree cleaned up.",
              }),
            },
          ],
        };
      } catch (error) {
        logger.error("mark_pr_merged failed", {
          error: getErrorMessage(error),
        });
        return mcpInternalError("Error marking PR as merged", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // mark_pr_closed
  // -------------------------------------------------------------------------
  server.tool(
    "mark_pr_closed",
    "Mark a task's PR as closed (not merged). Updates the task status to 'canceled' and cleans up the worktree. Valid statuses: pr_created, review, changes_requested.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        if (
          !["pr_created", "review", "changes_requested"].includes(task.status)
        ) {
          return mcpError(McpErrorCode.INVALID_TASK_STATUS, `Cannot mark PR as closed for task with status '${task.status}'. Expected: pr_created, review, or changes_requested`, "Use get_task to check current status.");
        }

        const agentService = getAgentService();
        await agentService.markPRClosed(args.task_id);

        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
        logger.info("mark_pr_closed", { id: args.task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "canceled",
                message: "PR marked as closed. Worktree cleaned up.",
              }),
            },
          ],
        };
      } catch (error) {
        logger.error("mark_pr_closed failed", {
          error: getErrorMessage(error),
        });
        return mcpInternalError("Error marking PR as closed", error);
      }
    }
  );
}
