import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_TASK_ID = "123e4567-e89b-12d3-a456-426614174000";
const TEST_REPO_ID = "f6b102a0-9c66-4a4a-8304-78b3f117cb1d";

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
  };

  return { taskService, agentService };
});

vi.mock("../../services/task.service.js", () => ({
  taskService: mocks.taskService,
  default: mocks.taskService,
}));

vi.mock("../../services/agent.service.js", () => ({
  getAgentService: () => mocks.agentService,
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

import { registerTaskTools } from "../tools/task-tools.js";

function buildTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TEST_TASK_ID,
    title: "Test Task",
    description: "Test description",
    repo_url: "file:///tmp/repo",
    target_branch: "main",
    context_files: [],
    build_command: null,
    repository_id: TEST_REPO_ID,
    user_input: "Build a feature",
    generated_spec: null,
    generated_spec_at: null,
    final_spec: null,
    spec_approved_at: null,
    was_spec_edited: false,
    branch_name: null,
    pr_number: null,
    agent_type: null,
    agent_model: null,
    changes_data: null,
    conflict_files: null,
    status: "draft",
    pr_url: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function createTestClient() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerTaskTools(server);

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
// create_task
// ---------------------------------------------------------------------------
describe("create_task", () => {
  it("creates task with valid input and returns task object", async () => {
    const task = buildTask();
    mocks.taskService.create.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "create_task",
      arguments: {
        repository_id: TEST_REPO_ID,
        user_input: "Build a feature",
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.id).toBe(TEST_TASK_ID);
    expect(mocks.taskService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        repository_id: TEST_REPO_ID,
        user_input: "Build a feature",
      })
    );
  });

  it("returns isError when missing required fields", async () => {
    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "create_task",
      arguments: {
        user_input: "Build a feature",
      },
    });

    // Note: missing required tool params are caught by the MCP SDK's own
    // Zod validation before our handler runs, so the error is SDK-generated.
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain("repository_id");
    expect(mocks.taskService.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// list_tasks
// ---------------------------------------------------------------------------
describe("list_tasks", () => {
  it("returns array of tasks", async () => {
    const tasks = [buildTask(), buildTask({ id: "223e4567-e89b-12d3-a456-426614174001", title: "Task 2" })];
    mocks.taskService.getAll.mockReturnValue(tasks);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "list_tasks",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed).toHaveLength(2);
  });

  it("passes repository_id to getAll", async () => {
    mocks.taskService.getAll.mockReturnValue([]);

    const { client } = await createTestClient();
    await client.callTool({
      name: "list_tasks",
      arguments: { repository_id: TEST_REPO_ID },
    });

    expect(mocks.taskService.getAll).toHaveBeenCalledWith(TEST_REPO_ID);
  });

  it("filters tasks by status set", async () => {
    const tasks = [
      buildTask({ status: "draft" }),
      buildTask({ id: "223e4567-e89b-12d3-a456-426614174001", status: "coding" }),
      buildTask({ id: "323e4567-e89b-12d3-a456-426614174002", status: "done" }),
    ];
    mocks.taskService.getAll.mockReturnValue(tasks);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "list_tasks",
      arguments: { status: ["draft", "done"] },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((t: { status: string }) => t.status)).toEqual(["draft", "done"]);
  });
});

// ---------------------------------------------------------------------------
// get_task
// ---------------------------------------------------------------------------
describe("get_task", () => {
  it("returns task object when found", async () => {
    const task = buildTask();
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "get_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.id).toBe(TEST_TASK_ID);
  });

  it("returns isError when task not found", async () => {
    mocks.taskService.getById.mockReturnValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "get_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("TASK_NOT_FOUND");
    expect(error.hint).toContain("list_tasks");
  });
});

// ---------------------------------------------------------------------------
// update_task
// ---------------------------------------------------------------------------
describe("update_task", () => {
  it("updates and returns task", async () => {
    const updated = buildTask({ title: "Updated Title" });
    mocks.taskService.update.mockReturnValue(updated);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "update_task",
      arguments: {
        task_id: TEST_TASK_ID,
        title: "Updated Title",
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.title).toBe("Updated Title");
    expect(mocks.taskService.update).toHaveBeenCalledWith(
      TEST_TASK_ID,
      expect.objectContaining({ title: "Updated Title" })
    );
  });

  it("returns isError when task not found", async () => {
    mocks.taskService.update.mockReturnValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "update_task",
      arguments: {
        task_id: TEST_TASK_ID,
        title: "Updated Title",
      },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("TASK_NOT_FOUND");
    expect(error.hint).toContain("list_tasks");
  });

  it("returns isError for invalid fields", async () => {
    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "update_task",
      arguments: {
        task_id: TEST_TASK_ID,
        title: "", // min(1) violation
      },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(mocks.taskService.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// delete_task
// ---------------------------------------------------------------------------
describe("delete_task", () => {
  it("deletes task and triggers worktree cleanup", async () => {
    const task = buildTask();
    mocks.taskService.getById.mockReturnValue(task);
    mocks.taskService.delete.mockReturnValue(true);
    mocks.agentService.isAgentRunning.mockReturnValue(false);
    mocks.agentService.cleanupTaskWorktree.mockResolvedValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "delete_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.status).toBe("deleted");
    expect(mocks.taskService.delete).toHaveBeenCalledWith(TEST_TASK_ID);
    expect(mocks.agentService.cancelAgent).not.toHaveBeenCalled();
    expect(mocks.agentService.cleanupTaskWorktree).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "task deleted"
    );
  });

  it("cancels agent before deleting when agent is running", async () => {
    const task = buildTask({ status: "coding" });
    mocks.taskService.getById.mockReturnValue(task);
    mocks.taskService.delete.mockReturnValue(true);
    mocks.agentService.isAgentRunning.mockReturnValue(true);
    mocks.agentService.cleanupTaskWorktree.mockResolvedValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "delete_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    expect(mocks.agentService.cancelAgent).toHaveBeenCalledWith(TEST_TASK_ID);
    expect(mocks.taskService.delete).toHaveBeenCalledWith(TEST_TASK_ID);
  });
});
