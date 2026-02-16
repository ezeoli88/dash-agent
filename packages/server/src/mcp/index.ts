import { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createMcpServer } from "./server.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("mcp");

/**
 * Mounts MCP protocol routes on the Express application.
 *
 * Operates in **stateless mode**: each POST request creates a fresh
 * McpServer + transport pair, processes the JSON-RPC message, and tears down.
 * This avoids session management complexity while still being fully MCP-compliant.
 */
export function mountMcpRoutes(app: import("express").Application): void {
  // POST /api/mcp - Handle MCP JSON-RPC requests (stateless)
  app.post("/api/mcp", async (req: Request, res: Response) => {
    try {
      const server = createMcpServer();
      // Omit sessionIdGenerator entirely for stateless mode.
      // With exactOptionalPropertyTypes, passing `undefined` explicitly is not allowed.
      const transport = new StreamableHTTPServerTransport({});

      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      // Cast needed: the MCP SDK's StreamableHTTPServerTransport has optional
      // callback properties that conflict with exactOptionalPropertyTypes.
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("MCP request failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "MCP request failed" });
      }
    }
  });

  // GET /api/mcp - Not supported in stateless mode
  app.get("/api/mcp", async (_req: Request, res: Response) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed. Use POST for stateless mode.",
        },
        id: null,
      })
    );
  });

  // DELETE /api/mcp - Session termination not supported in stateless mode
  app.delete("/api/mcp", async (_req: Request, res: Response) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Session termination not supported in stateless mode.",
        },
        id: null,
      })
    );
  });

  logger.info("MCP routes mounted at /api/mcp");
}
