import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRepoService } from "../../services/repo.service.js";
import { createLocalStackDetector } from "../../services/stack-detector.service.js";
import { createLogger } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import { mcpError, mcpInternalError, McpErrorCode } from "../errors.js";
import { getDataEventEmitter } from "../../utils/data-events.js";

const logger = createLogger("mcp:repo-tools");

/**
 * Registers repository-related MCP tools on the server.
 */
export function registerRepoTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // list_repositories
  // -------------------------------------------------------------------------
  server.tool(
    "list_repositories",
    "List all repositories registered in Agent Board. Returns an array of repository objects with id, name, url, default_branch, detected_stack, and active_tasks_count.",
    async () => {
      try {
        const repoService = getRepoService();
        const repos = await repoService.getRepositories();
        logger.info("list_repositories", { count: repos.length });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(repos, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("list_repositories failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error listing repositories", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // add_repository
  // -------------------------------------------------------------------------
  server.tool(
    "add_repository",
    "Add a local repository to Agent Board. Detects the project stack automatically from the filesystem. Returns the created repository object.",
    {
      name: z.string().describe("Repository display name"),
      path: z
        .string()
        .describe("Absolute filesystem path to the local git repository"),
      default_branch: z
        .string()
        .optional()
        .describe('Default branch name (defaults to "main")'),
      remote_url: z
        .string()
        .optional()
        .describe("Optional remote URL override"),
    },
    async (args) => {
      try {
        const { name, path, default_branch, remote_url } = args;
        const url = `file://${path}`;

        const repoService = getRepoService();

        // Check for duplicate
        const existing = await repoService.getRepositoryByUrl(url);
        if (existing) {
          return mcpError(McpErrorCode.DUPLICATE_REPOSITORY, `Repository already exists at this path (id: ${existing.id})`, `Use list_repositories or get_repository with id: ${existing.id} to access it.`);
        }

        // Detect stack from local filesystem
        const localDetector = createLocalStackDetector();
        const stackResult = await localDetector.detectStack(path);

        const repository = await repoService.createRepositoryWithStack(
          {
            name,
            url,
            default_branch: default_branch || "main",
          },
          stackResult.detected_stack
        );

        getDataEventEmitter().emitChange({ entity: 'repo', action: 'created', id: repository.id });
        logger.info("add_repository", { id: repository.id, name, path });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(repository, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("add_repository failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error adding repository", error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_repository
  // -------------------------------------------------------------------------
  server.tool(
    "get_repository",
    "Get details for a specific repository by its ID. Returns the full repository object including detected_stack and learned_patterns.",
    {
      repository_id: z.string().uuid().describe("Repository UUID"),
    },
    async (args) => {
      try {
        const repoService = getRepoService();
        const repo = await repoService.getRepositoryById(args.repository_id);
        if (!repo) {
          return mcpError(McpErrorCode.REPOSITORY_NOT_FOUND, `Repository not found (id: ${args.repository_id})`, "Use list_repositories to see registered repos, or add_repository to register one.");
        }
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(repo, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("get_repository failed", { error: getErrorMessage(error) });
        return mcpInternalError("Error getting repository", error);
      }
    }
  );
}
