import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerRepoTools } from "../tools/repo-tools.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const repoService = {
    getRepositories: vi.fn(),
    getRepositoryById: vi.fn(),
    getRepositoryByUrl: vi.fn(),
    createRepositoryWithStack: vi.fn(),
  };

  const localStackDetector = {
    detectStack: vi.fn(),
  };

  return { repoService, localStackDetector };
});

vi.mock("../../services/repo.service.js", () => ({
  getRepoService: () => mocks.repoService,
}));

vi.mock("../../services/stack-detector.service.js", () => ({
  createLocalStackDetector: () => mocks.localStackDetector,
  createStackDetector: vi.fn(),
  DEFAULT_DETECTED_STACK: {
    framework: null,
    state_management: null,
    styling: null,
    testing: null,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestClient() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerRepoTools(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return { client, server };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    name: "my-repo",
    url: "file:///home/user/my-repo",
    default_branch: "main",
    detected_stack: {
      framework: "react",
      state_management: null,
      styling: "tailwind",
      testing: "vitest",
    },
    conventions: "",
    learned_patterns: [],
    active_tasks_count: 0,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MCP repo-tools", () => {
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    const pair = await createTestClient();
    client = pair.client;
  });

  afterEach(async () => {
    await client.close();
  });

  // -----------------------------------------------------------------------
  // list_repositories
  // -----------------------------------------------------------------------

  describe("list_repositories", () => {
    it("returns an array of repositories", async () => {
      const repos = [makeRepo(), makeRepo({ id: "11111111-2222-3333-4444-555555555555", name: "other-repo" })];
      mocks.repoService.getRepositories.mockResolvedValue(repos);

      const result = await client.callTool({
        name: "list_repositories",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text);
      expect(parsed).toEqual(repos);
      expect(parsed).toHaveLength(2);
    });

    it("returns an empty array when there are no repositories", async () => {
      mocks.repoService.getRepositories.mockResolvedValue([]);

      const result = await client.callTool({
        name: "list_repositories",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text);
      expect(parsed).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // add_repository
  // -----------------------------------------------------------------------

  describe("add_repository", () => {
    const addArgs = {
      name: "my-repo",
      path: "/home/user/my-repo",
    };

    it("creates a repository with detected stack and returns it", async () => {
      const repo = makeRepo();
      mocks.repoService.getRepositoryByUrl.mockResolvedValue(null);
      mocks.localStackDetector.detectStack.mockResolvedValue({
        detected_stack: {
          framework: "react",
          state_management: null,
          styling: "tailwind",
          testing: "vitest",
        },
      });
      mocks.repoService.createRepositoryWithStack.mockResolvedValue(repo);

      const result = await client.callTool({
        name: "add_repository",
        arguments: addArgs,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text);
      expect(parsed).toEqual(repo);

      expect(mocks.repoService.getRepositoryByUrl).toHaveBeenCalledWith(
        "file:///home/user/my-repo"
      );
      expect(mocks.localStackDetector.detectStack).toHaveBeenCalledWith(
        "/home/user/my-repo"
      );
      expect(mocks.repoService.createRepositoryWithStack).toHaveBeenCalledWith(
        { name: "my-repo", url: "file:///home/user/my-repo", default_branch: "main" },
        expect.anything()
      );
    });

    it("returns isError when a repository with the same URL already exists", async () => {
      const existing = makeRepo({ id: "existing-id" });
      mocks.repoService.getRepositoryByUrl.mockResolvedValue(existing);

      const result = await client.callTool({
        name: "add_repository",
        arguments: addArgs,
      });

      expect(result.isError).toBe(true);
      const error = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text);
      expect(error.code).toBe("DUPLICATE_REPOSITORY");
      expect(error.hint).toContain("list_repositories");
      expect(mocks.repoService.createRepositoryWithStack).not.toHaveBeenCalled();
    });

    it("returns isError when stack detection fails", async () => {
      mocks.repoService.getRepositoryByUrl.mockResolvedValue(null);
      mocks.localStackDetector.detectStack.mockRejectedValue(
        new Error("Cannot read filesystem")
      );

      const result = await client.callTool({
        name: "add_repository",
        arguments: addArgs,
      });

      expect(result.isError).toBe(true);
      const error = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.message).toContain("Cannot read filesystem");
    });
  });

  // -----------------------------------------------------------------------
  // get_repository
  // -----------------------------------------------------------------------

  describe("get_repository", () => {
    const repoId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

    it("returns the repository when found", async () => {
      const repo = makeRepo();
      mocks.repoService.getRepositoryById.mockResolvedValue(repo);

      const result = await client.callTool({
        name: "get_repository",
        arguments: { repository_id: repoId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text);
      expect(parsed).toEqual(repo);
    });

    it("returns isError when the repository is not found", async () => {
      mocks.repoService.getRepositoryById.mockResolvedValue(null);

      const result = await client.callTool({
        name: "get_repository",
        arguments: { repository_id: repoId },
      });

      expect(result.isError).toBe(true);
      const error = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text);
      expect(error.code).toBe("REPOSITORY_NOT_FOUND");
      expect(error.hint).toContain("list_repositories");
    });
  });
});
