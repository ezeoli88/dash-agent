import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRepoTools } from "./tools/repo-tools.js";
import { registerTaskTools } from "./tools/task-tools.js";
import { registerWorkflowTools } from "./tools/workflow-tools.js";
import { registerReviewTools } from "./tools/review-tools.js";
import { registerStatusTools } from "./tools/status-tools.js";
import { registerTaskResources } from "./resources/task-resources.js";
import { registerRepoResources } from "./resources/repo-resources.js";

/**
 * Creates and configures an MCP server instance with all tools and resources registered.
 *
 * Each request in stateless mode creates a fresh server, so this function
 * is called per-request.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "agent-board",
    version: "0.2.0",
  });

  // Register all tools
  registerRepoTools(server);
  registerTaskTools(server);
  registerWorkflowTools(server);
  registerReviewTools(server);
  registerStatusTools(server);

  // Register all resources
  registerTaskResources(server);
  registerRepoResources(server);

  return server;
}
