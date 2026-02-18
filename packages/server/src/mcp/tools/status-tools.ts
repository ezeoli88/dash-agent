import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAllSecretsStatus } from "../../services/secrets.service.js";
import { detectInstalledAgents } from "../../services/agent-detection.service.js";
import { isOAuthConfigured } from "../../services/github-oauth.service.js";
import { createLogger } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import { mcpInternalError } from "../errors.js";

const logger = createLogger("mcp:status-tools");

/**
 * Registers setup/status MCP tools on the server.
 */
export function registerStatusTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // get_setup_status
  // -------------------------------------------------------------------------
  server.tool(
    "get_setup_status",
    "Get the current Agent Board setup status including AI provider configuration, detected CLI agents, and GitHub/GitLab OAuth status. Useful for checking if the board is ready to run tasks.",
    async () => {
      try {
        const [secrets, agents] = await Promise.all([
          Promise.resolve(getAllSecretsStatus()),
          detectInstalledAgents(),
        ]);

        const oauthConfigured = isOAuthConfigured();

        const result = {
          secrets,
          agents,
          oauth_configured: oauthConfigured,
        };

        logger.info("get_setup_status");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("get_setup_status failed", {
          error: getErrorMessage(error),
        });
        return mcpInternalError("Error getting setup status", error);
      }
    }
  );
}
