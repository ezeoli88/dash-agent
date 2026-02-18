import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStatusTools } from "../tools/status-tools.js";

const mocks = vi.hoisted(() => ({
  getAllSecretsStatus: vi.fn(),
  detectInstalledAgents: vi.fn(),
  isOAuthConfigured: vi.fn(),
}));

vi.mock("../../services/secrets.service.js", () => ({
  getAllSecretsStatus: mocks.getAllSecretsStatus,
}));

vi.mock("../../services/agent-detection.service.js", () => ({
  detectInstalledAgents: mocks.detectInstalledAgents,
}));

vi.mock("../../services/github-oauth.service.js", () => ({
  isOAuthConfigured: mocks.isOAuthConfigured,
}));

vi.mock("../../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../utils/errors.js", () => ({
  getErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

async function createTestClient() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerStatusTools(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return { client, server };
}

describe("get_setup_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns secrets, agents, and oauth_configured", async () => {
    const secretsPayload = {
      ai: { provider: "anthropic", connected: true },
      github: { connected: false, username: null, avatarUrl: null },
      gitlab: { connected: false, username: null, avatarUrl: null },
    };
    const agentsPayload = [
      { name: "claude-code", version: "1.0.0", available: true },
    ];

    mocks.getAllSecretsStatus.mockReturnValue(secretsPayload);
    mocks.detectInstalledAgents.mockResolvedValue(agentsPayload);
    mocks.isOAuthConfigured.mockReturnValue(true);

    const { client } = await createTestClient();
    const result = await client.callTool({ name: "get_setup_status" });

    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0]!.text
    );
    expect(parsed).toEqual({
      secrets: secretsPayload,
      agents: agentsPayload,
      oauth_configured: true,
    });
  });

  it("returns isError when a service throws", async () => {
    mocks.getAllSecretsStatus.mockImplementation(() => {
      throw new Error("secrets db unavailable");
    });
    mocks.detectInstalledAgents.mockResolvedValue([]);
    mocks.isOAuthConfigured.mockReturnValue(false);

    const { client } = await createTestClient();
    const result = await client.callTool({ name: "get_setup_status" });

    expect(result.isError).toBe(true);

    const error = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0]!.text
    );
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).toContain("secrets db unavailable");
  });
});
