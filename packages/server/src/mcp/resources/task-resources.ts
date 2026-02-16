import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { taskService } from "../../services/task.service.js";
import { getGitService } from "../../services/git.service.js";
import { createLogger } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";

const logger = createLogger("mcp:task-resources");

/**
 * Registers task-related MCP resources on the server.
 */
export function registerTaskResources(server: McpServer): void {
  // -------------------------------------------------------------------------
  // agentboard://tasks/{taskId} - Task details
  // -------------------------------------------------------------------------
  server.resource(
    "task",
    new ResourceTemplate("agentboard://tasks/{taskId}", {
      list: undefined,
    }),
    { description: "Full task details including status, branch, PR URL, and all metadata" },
    async (uri, variables) => {
      const taskId = variables.taskId as string;

      const task = taskService.getById(taskId);
      if (!task) {
        logger.warn("Task resource not found", { taskId });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: "Task not found", id: taskId }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // agentboard://tasks/{taskId}/changes - Task changes / diff
  // -------------------------------------------------------------------------
  server.resource(
    "task-changes",
    new ResourceTemplate("agentboard://tasks/{taskId}/changes", {
      list: undefined,
    }),
    { description: "Changed files and diff for a task from the live worktree or persisted data" },
    async (uri, variables) => {
      const taskId = variables.taskId as string;

      const task = taskService.getById(taskId);
      if (!task) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: "Task not found", id: taskId }),
            },
          ],
        };
      }

      // Helper for persisted fallback
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
              contents: [
                {
                  uri: uri.href,
                  mimeType: "application/json",
                  text: JSON.stringify(
                    {
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
                    null,
                    2
                  ),
                },
              ],
            };
          }

          // Live is empty, try persisted
          const persisted = getPersistedChanges();
          if (persisted) {
            return {
              contents: [
                {
                  uri: uri.href,
                  mimeType: "application/json",
                  text: JSON.stringify(persisted, null, 2),
                },
              ],
            };
          }
        } catch (liveError) {
          logger.warn("Failed to read live worktree changes", {
            taskId,
            error: getErrorMessage(liveError),
          });

          const persisted = getPersistedChanges();
          if (persisted) {
            return {
              contents: [
                {
                  uri: uri.href,
                  mimeType: "application/json",
                  text: JSON.stringify(persisted, null, 2),
                },
              ],
            };
          }
        }
      }

      // Fallback to persisted
      const persisted = getPersistedChanges();
      if (persisted) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(persisted, null, 2),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              error: "No changes available",
              message:
                "No worktree or persisted changes found for this task.",
            }),
          },
        ],
      };
    }
  );
}
