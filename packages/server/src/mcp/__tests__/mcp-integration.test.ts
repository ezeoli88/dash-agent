import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const taskService = {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const agentService = {
    isAgentRunning: vi.fn(),
    cancelAgent: vi.fn(),
    cleanupTaskWorktree: vi.fn(),
    startAgent: vi.fn(),
    sendFeedback: vi.fn(),
    addUserMessageToHistory: vi.fn(),
    storeFeedbackForResume: vi.fn(),
    approvePlan: vi.fn(),
    approveAndCreatePR: vi.fn(),
    requestChanges: vi.fn(),
    markPRMerged: vi.fn(),
    markPRClosed: vi.fn(),
    extendTimeout: vi.fn(),
  };

  const repoService = {
    getRepositories: vi.fn(),
    getRepositoryById: vi.fn(),
    getRepositoryByUrl: vi.fn(),
    createRepositoryWithStack: vi.fn(),
  };

  const gitService = {
    getWorktreePath: vi.fn(),
    getChangedFiles: vi.fn(),
    getDiff: vi.fn(),
  };

  const sseEmitter = {
    emitStatus: vi.fn(),
    emitError: vi.fn(),
  };

  return {
    taskService,
    agentService,
    repoService,
    gitService,
    sseEmitter,
    getAllSecretsStatus: vi.fn(),
    detectInstalledAgents: vi.fn(),
    isOAuthConfigured: vi.fn(),
    executeSpec: vi.fn(),
    cancelSpecGeneration: vi.fn(),
    localStackDetector: { detectStack: vi.fn() },
  };
});

vi.mock("../../services/task.service.js", () => ({
  taskService: mocks.taskService,
  default: mocks.taskService,
}));

vi.mock("../../services/agent.service.js", () => ({
  getAgentService: () => mocks.agentService,
}));

vi.mock("../../services/repo.service.js", () => ({
  getRepoService: () => mocks.repoService,
}));

vi.mock("../../services/git.service.js", () => ({
  getGitService: () => mocks.gitService,
}));

vi.mock("../../utils/sse-emitter.js", () => ({
  getSSEEmitter: () => mocks.sseEmitter,
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

vi.mock("../../services/dev-agent.service.js", () => ({
  executeSpec: mocks.executeSpec,
}));

vi.mock("../../services/pm-agent.service.js", () => ({
  cancelSpecGeneration: mocks.cancelSpecGeneration,
}));

vi.mock("../../services/stack-detector.service.js", () => ({
  createLocalStackDetector: () => mocks.localStackDetector,
  createStackDetector: vi.fn(),
  DEFAULT_DETECTED_STACK: {
    languages: [],
    frameworks: [],
    buildTools: [],
    testFrameworks: [],
    packageManager: null,
  },
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

vi.mock("../../schemas/task.schema.js", async () => {
  const actual = await vi.importActual("../../schemas/task.schema.js");
  return actual;
});

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function createTestClient() {
  const server = createMcpServer();

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return { client, server };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Server creation
// ---------------------------------------------------------------------------
describe("Server creation", () => {
  it("creates server", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tool discovery
// ---------------------------------------------------------------------------
describe("Tool discovery", () => {
  const EXPECTED_TOOL_NAMES = [
    "list_repositories",
    "add_repository",
    "get_repository",
    "create_task",
    "list_tasks",
    "get_task",
    "update_task",
    "delete_task",
    "start_task",
    "execute_task",
    "send_feedback",
    "extend_task_timeout",
    "cancel_task",
    "get_task_changes",
    "approve_changes",
    "request_changes",
    "mark_pr_merged",
    "mark_pr_closed",
    "get_setup_status",
  ];

  it("lists all 19 tools with expected names", async () => {
    const { client } = await createTestClient();
    const result = await client.listTools();

    expect(result.tools).toHaveLength(19);

    const toolNames = result.tools.map((t) => t.name).sort();
    const expectedSorted = [...EXPECTED_TOOL_NAMES].sort();
    expect(toolNames).toEqual(expectedSorted);
  });
});

// ---------------------------------------------------------------------------
// Resource discovery
// ---------------------------------------------------------------------------
describe("Resource discovery", () => {
  it("lists resource templates", async () => {
    const { client } = await createTestClient();
    const result = await client.listResourceTemplates();

    const templateUris = result.resourceTemplates.map((t) => t.uriTemplate);

    // Dynamic templates registered by task-resources and repo-resources
    expect(templateUris).toContain("agentboard://tasks/{taskId}");
    expect(templateUris).toContain("agentboard://tasks/{taskId}/changes");
    expect(templateUris).toContain("agentboard://repos/{repoId}");
  });
});

// ---------------------------------------------------------------------------
// End-to-end resource read
// ---------------------------------------------------------------------------
describe("End-to-end resource read", () => {
  it("read status resource", async () => {
    const secretsPayload = {
      ai: { provider: "openai", connected: true },
      github: { connected: true, username: "octocat", avatarUrl: null },
      gitlab: { connected: false, username: null, avatarUrl: null },
    };
    const agentsPayload = [
      { name: "codex", version: "2.0.0", available: true },
      { name: "claude-code", version: "1.0.0", available: true },
    ];

    mocks.getAllSecretsStatus.mockReturnValue(secretsPayload);
    mocks.detectInstalledAgents.mockResolvedValue(agentsPayload);
    mocks.isOAuthConfigured.mockReturnValue(false);

    const { client } = await createTestClient();
    const result = await client.readResource({
      uri: "agentboard://status",
    });

    expect(result.contents).toHaveLength(1);

    const content = result.contents[0]!;
    expect(content.uri).toBe("agentboard://status");
    expect(content.mimeType).toBe("application/json");

    const parsed = JSON.parse((content as { text: string }).text);
    expect(parsed.secrets).toEqual(secretsPayload);
    expect(parsed.agents).toEqual(agentsPayload);
    expect(parsed.oauth_configured).toBe(false);
    expect(parsed.server_connected).toBe(true);
  });
});
