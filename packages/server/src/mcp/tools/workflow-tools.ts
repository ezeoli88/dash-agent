import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskService } from "../../services/task.service.js";
import { getAgentService } from "../../services/agent.service.js";
import { getSSEEmitter } from "../../utils/sse-emitter.js";
import { executeSpec } from "../../services/dev-agent.service.js";
import { cancelSpecGeneration } from "../../services/pm-agent.service.js";
import { createLogger } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import { mcpError, mcpInternalError, McpErrorCode } from "../errors.js";
import { getDataEventEmitter } from "../../utils/data-events.js";

const logger = createLogger("mcp:workflow-tools");

/**
 * Registers workflow execution MCP tools on the server.
 * These tools control the task lifecycle: start, execute, feedback, extend, cancel.
 */
export function registerWorkflowTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // start_task
  // -------------------------------------------------------------------------
  server.tool(
    "start_task",
    "Start a task that is in 'draft' or 'failed' status. Creates a feature branch and launches the agent in planning mode. The agent runs asynchronously; poll the task status to track progress.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        // Validate status
        const validStatuses = ["draft", "failed"];
        if (!validStatuses.includes(task.status)) {
          return mcpError(McpErrorCode.INVALID_TASK_STATUS, `Cannot start task with status '${task.status}'. Expected: ${validStatuses.join(", ")}`, "Use get_task to check current status before calling start_task.");
        }

        // Generate branch name
        const titleSlug = task.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 40);
        const taskSuffix = args.task_id.substring(0, 8);
        const branchName = `feature/${titleSlug}-${taskSuffix}`;

        // Clear error on retry from failed
        const isRetry = task.status === "failed";

        // Update task with branch and set to planning
        taskService.update(args.task_id, {
          branch_name: branchName,
          status: "planning",
          error: isRetry ? null : undefined,
        });

        // Emit SSE status change
        const sseEmitter = getSSEEmitter();
        sseEmitter.emitStatus(args.task_id, "planning");

        // Start agent execution asynchronously
        const agentService = getAgentService();
        agentService.startAgent(args.task_id, false).catch((error) => {
          logger.error("Failed to start agent", {
            taskId: args.task_id,
            error: getErrorMessage(error),
          });
          const currentTask = taskService.getById(args.task_id);
          if (currentTask && currentTask.status !== "failed") {
            taskService.update(args.task_id, {
              status: "failed",
              error: getErrorMessage(error),
            });
            sseEmitter.emitStatus(args.task_id, "failed");
            sseEmitter.emitError(args.task_id, getErrorMessage(error));
          }
        });

        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
        logger.info("start_task", { id: args.task_id, branch: branchName });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "started",
                message: "Agent started",
                branch_name: branchName,
              }),
            },
          ],
        };
      } catch (error) {
        logger.error("start_task failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error starting task", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // execute_task
  // -------------------------------------------------------------------------
  server.tool(
    "execute_task",
    "Execute a task that is in 'backlog', 'approved', 'failed', or 'changes_requested' status. For 'approved' tasks, starts the Dev Agent on the spec. For others, starts the planning agent. The agent runs asynchronously.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        const validStatuses = ["backlog", "approved", "failed", "changes_requested"];
        if (!validStatuses.includes(task.status)) {
          return mcpError(McpErrorCode.INVALID_TASK_STATUS, `Cannot execute task with status '${task.status}'. Valid statuses: ${validStatuses.join(", ")}`, "Use get_task to check current status.");
        }

        const agentService = getAgentService();
        const isResume = task.status === "changes_requested";
        const isRetry = task.status === "failed";

        // Clear error on retry
        if (isRetry) {
          taskService.update(args.task_id, { error: null });
        }

        // For approved tasks, use Dev Agent directly
        if (task.status === "approved") {
          try {
            await executeSpec({ task_id: args.task_id });
            getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
            logger.info("execute_task (approved)", { id: args.task_id });
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    status: "started",
                    task_status: "coding",
                    message: "Dev Agent started working on the spec",
                  }),
                },
              ],
            };
          } catch (execError) {
            return mcpInternalError("Error executing spec", execError);
          }
        }

        // For other statuses: update to planning and start agent
        taskService.update(args.task_id, {
          status: "planning",
          error: isRetry ? null : undefined,
        });

        const sseEmitter = getSSEEmitter();
        sseEmitter.emitStatus(args.task_id, "planning");

        agentService.startAgent(args.task_id, isResume).catch((error) => {
          const errorMsg = getErrorMessage(error);
          logger.error("Agent execution failed", {
            taskId: args.task_id,
            error: errorMsg,
          });
          const currentTask = taskService.getById(args.task_id);
          if (currentTask && currentTask.status !== "failed") {
            taskService.update(args.task_id, {
              status: "failed",
              error: errorMsg,
            });
            sseEmitter.emitStatus(args.task_id, "failed");
            sseEmitter.emitError(args.task_id, errorMsg);
          }
        });

        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
        logger.info("execute_task", { id: args.task_id, isResume });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "started",
                task_status: "planning",
                message: isResume
                  ? "Agent resumed to address requested changes"
                  : "Agent execution started",
                resume_mode: isResume,
              }),
            },
          ],
        };
      } catch (error) {
        logger.error("execute_task failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error executing task", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // send_feedback
  // -------------------------------------------------------------------------
  server.tool(
    "send_feedback",
    "Send feedback or a message to the agent working on a task. If the agent is running, the message is delivered directly. If the task is in 'plan_review', this approves the plan. If the agent is idle in an active status, this resumes the agent with the message.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
      message: z.string().min(1).describe("Feedback message to send to the agent"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        const agentService = getAgentService();

        // If agent is running, send feedback directly
        if (agentService.isAgentRunning(args.task_id)) {
          agentService.sendFeedback(args.task_id, args.message);
          getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
          logger.info("send_feedback (direct)", { id: args.task_id });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ status: "feedback_sent" }),
              },
            ],
          };
        }

        // Agent is NOT running
        const terminalStatuses = ["done", "failed", "draft"];
        if (terminalStatuses.includes(task.status)) {
          return mcpError(McpErrorCode.TASK_IN_TERMINAL_STATE, `Task is in '${task.status}' status. Cannot send feedback to a terminal/draft task.`, `Task is in '${task.status}'. Use execute_task to retry from 'failed', or create a new task.`);
        }

        // plan_review: approve the plan via chat message
        if (task.status === "plan_review") {
          agentService.addUserMessageToHistory(args.task_id, args.message);

          agentService.approvePlan(args.task_id).catch((error) => {
            logger.error("Failed to approve plan from feedback", {
              taskId: args.task_id,
              error: getErrorMessage(error),
            });
            const currentTask = taskService.getById(args.task_id);
            if (currentTask && currentTask.status !== "failed") {
              taskService.update(args.task_id, {
                status: "failed",
                error: getErrorMessage(error),
              });
              const sseEmitter = getSSEEmitter();
              sseEmitter.emitStatus(args.task_id, "failed");
              sseEmitter.emitError(args.task_id, getErrorMessage(error));
            }
          });

          getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
          logger.info("send_feedback (plan_approved)", { id: args.task_id });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: "plan_approved",
                  message: "Plan approved. Agent is implementing...",
                }),
              },
            ],
          };
        }

        // Otherwise: store message and resume agent
        agentService.addUserMessageToHistory(args.task_id, args.message);
        agentService.storeFeedbackForResume(args.task_id, args.message);

        taskService.update(args.task_id, { status: "planning" });
        const sseEmitter = getSSEEmitter();
        sseEmitter.emitStatus(args.task_id, "planning");

        agentService.startAgent(args.task_id, true).catch((error) => {
          logger.error("Failed to resume agent from feedback", {
            taskId: args.task_id,
            error: getErrorMessage(error),
          });
          const currentTask = taskService.getById(args.task_id);
          if (currentTask && currentTask.status !== "failed") {
            taskService.update(args.task_id, {
              status: "failed",
              error: getErrorMessage(error),
            });
            sseEmitter.emitStatus(args.task_id, "failed");
            sseEmitter.emitError(args.task_id, getErrorMessage(error));
          }
        });

        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
        logger.info("send_feedback (agent_resumed)", { id: args.task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "agent_resumed",
                message: "Agent resumed with your message",
              }),
            },
          ],
        };
      } catch (error) {
        logger.error("send_feedback failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error sending feedback", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // extend_task_timeout
  // -------------------------------------------------------------------------
  server.tool(
    "extend_task_timeout",
    "Extend the running agent's timeout by 5 minutes. Only valid when an agent is actively running for the task. Returns the new timeout timestamp.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        const agentService = getAgentService();
        if (!agentService.isAgentRunning(args.task_id)) {
          return mcpError(McpErrorCode.AGENT_NOT_RUNNING, "No agent is currently running for this task", "Use get_task to check current task status.");
        }

        const newTimeout = agentService.extendTimeout(args.task_id);
        logger.info("extend_task_timeout", { id: args.task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "extended",
                new_timeout: newTimeout.toISOString(),
              }),
            },
          ],
        };
      } catch (error) {
        logger.error("extend_task_timeout failed", {
          error: getErrorMessage(error),
        });
        return mcpInternalError("Error extending timeout", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // cancel_task
  // -------------------------------------------------------------------------
  server.tool(
    "cancel_task",
    "Cancel the agent execution for a task. If the task is in 'refining' status, cancels spec generation and resets to 'draft'. If the agent is running, kills the process. If the agent already exited but the task is stuck in an active status, resets to 'canceled'.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        const agentService = getAgentService();

        // Handle PM Agent (refining status)
        if (task.status === "refining") {
          cancelSpecGeneration(args.task_id);
          taskService.update(args.task_id, {
            status: "draft",
            error: "Spec generation cancelled",
          });

          const sseEmitter = getSSEEmitter();
          sseEmitter.emitStatus(args.task_id, "draft");
          sseEmitter.emitError(args.task_id, "Spec generation cancelled by user");

          getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
          logger.info("cancel_task (refining)", { id: args.task_id });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ status: "canceled" }),
              },
            ],
          };
        }

        // For Dev Agent / legacy agent
        if (!agentService.isAgentRunning(args.task_id)) {
          // Agent process already exited but task is stuck in an active status
          const activeStatuses = [
            "planning",
            "in_progress",
            "coding",
            "plan_review",
            "approved",
            "awaiting_review",
            "merge_conflicts",
          ];
          if (activeStatuses.includes(task.status)) {
            taskService.update(args.task_id, {
              status: "canceled",
              error: "Task canceled by user (agent not running)",
            });
            const sseEmitter = getSSEEmitter();
            sseEmitter.emitStatus(args.task_id, "canceled");

            getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
            logger.info("cancel_task (stuck)", { id: args.task_id });
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ status: "canceled" }),
                },
              ],
            };
          }

          return mcpError(McpErrorCode.AGENT_NOT_RUNNING, "No agent is currently running for this task", "Use get_task to check current task status.");
        }

        agentService.cancelAgent(args.task_id);
        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: args.task_id });
        logger.info("cancel_task", { id: args.task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ status: "canceled" }),
            },
          ],
        };
      } catch (error) {
        logger.error("cancel_task failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error cancelling task", error);
      }
    }
  );
}
