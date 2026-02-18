import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_TASK_ID = "123e4567-e89b-12d3-a456-426614174000";

const mocks = vi.hoisted(() => {
  const taskService = {
    getById: vi.fn(),
    update: vi.fn(),
  };

  const agentService = {
    approveAndCreatePR: vi.fn(),
    requestChanges: vi.fn(),
    markPRMerged: vi.fn(),
    markPRClosed: vi.fn(),
  };

  const gitService = {
    getWorktreePath: vi.fn(),
    getChangedFiles: vi.fn(),
    getDiff: vi.fn(),
  };

  return { taskService, agentService, gitService };
});

vi.mock("../../services/task.service.js", () => ({
  taskService: mocks.taskService,
  default: mocks.taskService,
}));

vi.mock("../../services/agent.service.js", () => ({
  getAgentService: () => mocks.agentService,
}));

vi.mock("../../services/git.service.js", () => ({
  getGitService: () => mocks.gitService,
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

import { registerReviewTools } from "../tools/review-tools.js";

function buildTask(
  status: string,
  overrides: Partial<Record<string, unknown>> = {}
) {
  return {
    id: TEST_TASK_ID,
    title: "Test Task",
    description: "desc",
    repo_url: "file:///tmp/repo",
    target_branch: "main",
    context_files: [],
    build_command: null,
    repository_id: "f6b102a0-9c66-4a4a-8304-78b3f117cb1d",
    user_input: "Build a feature",
    status,
    branch_name: "feature/test",
    pr_url: null,
    error: null,
    changes_data: null,
    ...overrides,
  };
}

async function createTestClient() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerReviewTools(server);

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
// get_task_changes
// ---------------------------------------------------------------------------
describe("get_task_changes", () => {
  it("happy path: live worktree returns files + diff", async () => {
    const task = buildTask("review");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.gitService.getWorktreePath.mockReturnValue("/tmp/worktree");
    mocks.gitService.getChangedFiles.mockResolvedValue([
      {
        path: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 2,
        oldContent: "old",
        newContent: "new",
      },
    ]);
    mocks.gitService.getDiff.mockResolvedValue("diff --git a/src/index.ts");

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "get_task_changes",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ text: string }>)[0]!.text
    );
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]).toEqual({
      path: "src/index.ts",
      status: "modified",
      additions: 10,
      deletions: 2,
      oldContent: "old",
      newContent: "new",
    });
    expect(parsed.diff).toBe("diff --git a/src/index.ts");
    expect(mocks.gitService.getWorktreePath).toHaveBeenCalledWith(
      TEST_TASK_ID
    );
    expect(mocks.gitService.getChangedFiles).toHaveBeenCalledWith(
      "/tmp/worktree",
      "main"
    );
    expect(mocks.gitService.getDiff).toHaveBeenCalledWith(
      "/tmp/worktree",
      "main"
    );
  });

  it("persisted fallback: no worktree, returns parsed changes_data", async () => {
    const persistedData = {
      files: [{ path: "a.ts", status: "added", additions: 5, deletions: 0 }],
      diff: "persisted diff",
    };
    const task = buildTask("review", {
      changes_data: JSON.stringify(persistedData),
    });
    mocks.taskService.getById.mockReturnValue(task);
    mocks.gitService.getWorktreePath.mockReturnValue(null);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "get_task_changes",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ text: string }>)[0]!.text
    );
    expect(parsed).toEqual(persistedData);
    expect(mocks.gitService.getChangedFiles).not.toHaveBeenCalled();
    expect(mocks.gitService.getDiff).not.toHaveBeenCalled();
  });

  it("live error, persisted fallback: worktree throws, falls back to changes_data", async () => {
    const persistedData = {
      files: [{ path: "c.ts", status: "deleted", additions: 0, deletions: 10 }],
      diff: "error fallback diff",
    };
    const task = buildTask("review", {
      changes_data: JSON.stringify(persistedData),
    });
    mocks.taskService.getById.mockReturnValue(task);
    mocks.gitService.getWorktreePath.mockReturnValue("/tmp/worktree");
    mocks.gitService.getChangedFiles.mockRejectedValue(
      new Error("git command failed")
    );

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "get_task_changes",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ text: string }>)[0]!.text
    );
    expect(parsed).toEqual(persistedData);
  });

  it("no changes available: no worktree, no changes_data returns isError", async () => {
    const task = buildTask("review", { changes_data: null });
    mocks.taskService.getById.mockReturnValue(task);
    mocks.gitService.getWorktreePath.mockReturnValue(null);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "get_task_changes",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("NO_CHANGES_AVAILABLE");
  });

  it("task not found returns isError", async () => {
    mocks.taskService.getById.mockReturnValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "get_task_changes",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("TASK_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// approve_changes
// ---------------------------------------------------------------------------
describe("approve_changes", () => {
  it("happy path: approves task in awaiting_review and returns pr_url", async () => {
    const task = buildTask("awaiting_review");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.approveAndCreatePR.mockResolvedValue(
      "https://github.com/org/repo/pull/42"
    );

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "approve_changes",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ text: string }>)[0]!.text
    );
    expect(parsed.status).toBe("approved");
    expect(parsed.pr_url).toBe("https://github.com/org/repo/pull/42");
    expect(mocks.agentService.approveAndCreatePR).toHaveBeenCalledWith(
      TEST_TASK_ID
    );
  });

  it("invalid status (draft) returns isError", async () => {
    const task = buildTask("draft");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "approve_changes",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("INVALID_TASK_STATUS");
    expect(error.message).toContain("draft");
    expect(error.message).toContain("awaiting_review or review");
    expect(mocks.agentService.approveAndCreatePR).not.toHaveBeenCalled();
  });

  it("PR creation error with mapped message returns mapped error code", async () => {
    const task = buildTask("awaiting_review");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.approveAndCreatePR.mockRejectedValue(
      new Error('El repositorio no tiene un remote "origin" configurado')
    );

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "approve_changes",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("LOCAL_REPO_NO_ORIGIN");
    expect(error.hint).toContain("remote origin");
  });
});

// ---------------------------------------------------------------------------
// request_changes
// ---------------------------------------------------------------------------
describe("request_changes", () => {
  it("happy path: requests changes for task in pr_created status", async () => {
    const task = buildTask("pr_created");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.requestChanges.mockResolvedValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "request_changes",
      arguments: {
        task_id: TEST_TASK_ID,
        feedback: "Please fix the typo in line 42",
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ text: string }>)[0]!.text
    );
    expect(parsed.status).toBe("changes_requested");
    expect(parsed.message).toContain("Changes requested");
    expect(mocks.agentService.requestChanges).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "Please fix the typo in line 42"
    );
  });

  it("invalid status (draft) returns isError", async () => {
    const task = buildTask("draft");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "request_changes",
      arguments: {
        task_id: TEST_TASK_ID,
        feedback: "Some feedback",
      },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("INVALID_TASK_STATUS");
    expect(error.message).toContain("Cannot request changes for task with status 'draft'");
    expect(error.message).toContain("pr_created or review");
    expect(mocks.agentService.requestChanges).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mark_pr_merged
// ---------------------------------------------------------------------------
describe("mark_pr_merged", () => {
  it("happy path: marks PR as merged for task in pr_created status", async () => {
    const task = buildTask("pr_created");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.markPRMerged.mockResolvedValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "mark_pr_merged",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ text: string }>)[0]!.text
    );
    expect(parsed.status).toBe("done");
    expect(parsed.message).toContain("PR marked as merged");
    expect(mocks.agentService.markPRMerged).toHaveBeenCalledWith(TEST_TASK_ID);
  });

  it("invalid status (draft) returns isError", async () => {
    const task = buildTask("draft");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "mark_pr_merged",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("INVALID_TASK_STATUS");
    expect(error.message).toContain(
      "Cannot mark PR as merged for task with status 'draft'"
    );
    expect(error.message).toContain("pr_created or review");
    expect(mocks.agentService.markPRMerged).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mark_pr_closed
// ---------------------------------------------------------------------------
describe("mark_pr_closed", () => {
  it("happy path: marks PR as closed for task in pr_created status", async () => {
    const task = buildTask("pr_created");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.markPRClosed.mockResolvedValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "mark_pr_closed",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ text: string }>)[0]!.text
    );
    expect(parsed.status).toBe("canceled");
    expect(parsed.message).toContain("PR marked as closed");
    expect(mocks.agentService.markPRClosed).toHaveBeenCalledWith(TEST_TASK_ID);
  });

  it("invalid status (draft) returns isError", async () => {
    const task = buildTask("draft");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "mark_pr_closed",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("INVALID_TASK_STATUS");
    expect(error.message).toContain(
      "Cannot mark PR as closed for task with status 'draft'"
    );
    expect(error.message).toContain("pr_created, review, or changes_requested");
    expect(mocks.agentService.markPRClosed).not.toHaveBeenCalled();
  });
});
