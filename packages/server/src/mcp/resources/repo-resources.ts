import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRepoService } from "../../services/repo.service.js";
import { getAllSecretsStatus } from "../../services/secrets.service.js";
import { detectInstalledAgents } from "../../services/agent-detection.service.js";
import { isOAuthConfigured } from "../../services/github-oauth.service.js";
import { createLogger } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";

const logger = createLogger("mcp:repo-resources");

/**
 * Registers repository-related MCP resources and the board status resource.
 */
export function registerRepoResources(server: McpServer): void {
  // -------------------------------------------------------------------------
  // agentboard://status - Board status (static resource)
  // -------------------------------------------------------------------------
  server.resource(
    "status",
    "agentboard://status",
    { description: "Agent Board setup status: AI provider, installed agents, and OAuth configuration" },
    async (uri) => {
      try {
        const [secrets, agents] = await Promise.all([
          Promise.resolve(getAllSecretsStatus()),
          detectInstalledAgents(),
        ]);

        const oauthConfigured = isOAuthConfigured();

        const statusData = {
          secrets,
          agents,
          oauth_configured: oauthConfigured,
          server_connected: true,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(statusData, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Failed to read status resource", {
          error: getErrorMessage(error),
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: "Failed to retrieve status",
                message: getErrorMessage(error),
                server_connected: true,
              }),
            },
          ],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // agentboard://repos/{repoId} - Repository details
  // -------------------------------------------------------------------------
  server.resource(
    "repository",
    new ResourceTemplate("agentboard://repos/{repoId}", {
      list: undefined,
    }),
    { description: "Full repository details including detected stack, conventions, and learned patterns" },
    async (uri, variables) => {
      const repoId = variables.repoId as string;

      try {
        const repoService = getRepoService();
        const repo = await repoService.getRepositoryById(repoId);

        if (!repo) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({
                  error: "Repository not found",
                  id: repoId,
                }),
              },
            ],
          };
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(repo, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Failed to read repository resource", {
          repoId,
          error: getErrorMessage(error),
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: "Failed to retrieve repository",
                message: getErrorMessage(error),
              }),
            },
          ],
        };
      }
    }
  );
}
