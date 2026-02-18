import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskService } from "../../services/task.service.js";
import { getAgentService } from "../../services/agent.service.js";
import { getRepoService } from "../../services/repo.service.js";
import { CreateTaskSchema, UpdateTaskSchema } from "../../schemas/task.schema.js";
import { detectInstalledAgents } from "../../services/agent-detection.service.js";
import { createLogger } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import { mcpError, mcpValidationError, mcpInternalError, McpErrorCode } from "../errors.js";
import { getDataEventEmitter } from "../../utils/data-events.js";

const logger = createLogger("mcp:task-tools");

/**
 * Registers task CRUD MCP tools on the server.
 */
export function registerTaskTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // create_task
  // -------------------------------------------------------------------------
  server.tool(
    "create_task",
    "Create a new task in Agent Board. Requires a repository_id and user_input describing what to build. Returns the created task object in 'draft' status.",
    {
      repository_id: z.string().uuid().describe("Repository UUID to associate the task with"),
      user_input: z.string().describe("Natural language description of what to build or fix"),
      title: z.string().optional().describe("Short task title (auto-generated from user_input if omitted)"),
      description: z.string().optional().describe("Detailed description (defaults to user_input)"),
      target_branch: z.string().optional().describe('Base branch for the task (defaults to "main")'),
      context_files: z.array(z.string()).optional().describe("File paths the agent should review first"),
      build_command: z.string().optional().describe("Build command to verify changes"),
      agent_type: z.string().optional().describe("CLI agent type override (e.g. claude-code, codex, gemini)"),
      agent_model: z.string().optional().describe("CLI agent model override"),
    },
    async (args) => {
      try {
        // Resolve repo_url from repository_id so the task has the full URL
        const repoService = getRepoService();
        const repo = await repoService.getRepositoryById(args.repository_id);
        if (!repo) {
          return mcpError(McpErrorCode.REPOSITORY_NOT_FOUND, `Repository not found (id: ${args.repository_id})`, "Use list_repositories to see registered repos, or add_repository to register one.");
        }

        // Auto-detect agent_type and agent_model if not provided
        let { agent_type, agent_model } = args;
        if (!agent_type) {
          const agents = await detectInstalledAgents();
          const available = agents.find((a) => a.installed && a.authenticated);
          if (available) {
            agent_type = available.id;
            agent_model = available.models[0]?.id;
            logger.info("Auto-selected agent", { agent_type, agent_model });
          }
        }

        const result = CreateTaskSchema.safeParse({
          ...args,
          repo_url: repo.url,
          agent_type,
          agent_model,
        });
        if (!result.success) {
          return mcpValidationError(result.error.issues);
        }

        const task = taskService.create(result.data);
        getDataEventEmitter().emitChange({ entity: 'task', action: 'created', id: task.id });
        logger.info("create_task", { id: task.id, title: task.title });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(task, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("create_task failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error creating task", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // list_tasks
  // -------------------------------------------------------------------------
  server.tool(
    "list_tasks",
    "List tasks, optionally filtered by repository_id and/or status. Returns an array of task objects ordered by creation date (newest first).",
    {
      repository_id: z.string().uuid().optional().describe("Filter by repository UUID"),
      status: z
        .array(z.string())
        .optional()
        .describe("Filter by one or more task statuses (e.g. ['draft', 'planning'])"),
    },
    async (args) => {
      try {
        let tasks = taskService.getAll(args.repository_id);

        // Apply status filter if provided
        if (args.status && args.status.length > 0) {
          const statusSet = new Set(args.status);
          tasks = tasks.filter((t) => statusSet.has(t.status));
        }

        logger.info("list_tasks", { count: tasks.length });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(tasks, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("list_tasks failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error listing tasks", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_task
  // -------------------------------------------------------------------------
  server.tool(
    "get_task",
    "Get the full details of a specific task by its ID, including status, branch_name, pr_url, error, and all metadata.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(task, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("get_task failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error getting task", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // update_task
  // -------------------------------------------------------------------------
  server.tool(
    "update_task",
    "Update editable fields of an existing task. Only fields provided will be changed. Returns the updated task object.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
      title: z.string().optional().describe("New task title"),
      description: z.string().optional().describe("New description"),
      target_branch: z.string().optional().describe("New target branch"),
      context_files: z.array(z.string()).optional().describe("Updated context files"),
      build_command: z.string().optional().describe("Updated build command"),
      agent_type: z.string().optional().describe("Agent type override"),
      agent_model: z.string().optional().describe("Agent model override"),
    },
    async (args) => {
      try {
        const { task_id, ...updateFields } = args;

        const parseResult = UpdateTaskSchema.safeParse(updateFields);
        if (!parseResult.success) {
          return mcpValidationError(parseResult.error.issues);
        }

        const task = taskService.update(task_id, parseResult.data);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${task_id})`, "Use list_tasks to see available tasks.");
        }

        getDataEventEmitter().emitChange({ entity: 'task', action: 'updated', id: task_id });
        logger.info("update_task", { id: task_id });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(task, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("update_task failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error updating task", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // delete_task
  // -------------------------------------------------------------------------
  server.tool(
    "delete_task",
    "Delete a task by ID. Cancels any running agent and cleans up the worktree in the background. Returns confirmation.",
    {
      task_id: z.string().uuid().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = taskService.getById(args.task_id);
        if (!task) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        // Cancel running agent if needed
        const agentService = getAgentService();
        if (agentService.isAgentRunning(args.task_id)) {
          logger.info("Cancelling running agent before deleting task", {
            id: args.task_id,
          });
          agentService.cancelAgent(args.task_id);
        }

        // Delete the task
        const deleted = taskService.delete(args.task_id);

        // Fire-and-forget worktree cleanup
        agentService
          .cleanupTaskWorktree(args.task_id, "task deleted")
          .catch((cleanupError) => {
            logger.warn("Failed to cleanup worktree during task deletion", {
              id: args.task_id,
              error: getErrorMessage(cleanupError),
            });
          });

        if (!deleted) {
          return mcpError(McpErrorCode.TASK_NOT_FOUND, `Task not found (id: ${args.task_id})`, "Use list_tasks to see available tasks.");
        }

        getDataEventEmitter().emitChange({ entity: 'task', action: 'deleted', id: args.task_id });
        logger.info("delete_task", { id: args.task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "deleted",
                task_id: args.task_id,
              }),
            },
          ],
        };
      } catch (error) {
        logger.error("delete_task failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error deleting task", error);
      }
    }
  );
}
