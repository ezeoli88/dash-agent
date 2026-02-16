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
    isAgentRunning: vi.fn(),
    startAgent: vi.fn(),
    cancelAgent: vi.fn(),
    sendFeedback: vi.fn(),
    addUserMessageToHistory: vi.fn(),
    storeFeedbackForResume: vi.fn(),
    approvePlan: vi.fn(),
    extendTimeout: vi.fn(),
  };

  const sseEmitter = {
    emitStatus: vi.fn(),
    emitError: vi.fn(),
  };

  return {
    taskService,
    agentService,
    sseEmitter,
    executeSpec: vi.fn(),
    cancelSpecGeneration: vi.fn(),
  };
});

vi.mock("../../services/task.service.js", () => ({
  taskService: mocks.taskService,
  default: mocks.taskService,
}));

vi.mock("../../services/agent.service.js", () => ({
  getAgentService: () => mocks.agentService,
}));

vi.mock("../../utils/sse-emitter.js", () => ({
  getSSEEmitter: () => mocks.sseEmitter,
}));

vi.mock("../../services/dev-agent.service.js", () => ({
  executeSpec: mocks.executeSpec,
}));

vi.mock("../../services/pm-agent.service.js", () => ({
  cancelSpecGeneration: mocks.cancelSpecGeneration,
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
import { registerWorkflowTools } from "../tools/workflow-tools.js";

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
    branch_name: null,
    pr_url: null,
    error: null,
    ...overrides,
  };
}

async function createTestClient() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerWorkflowTools(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return { client, server };
}

function parseResult(result: { content: Array<{ type: string; text?: string }> }) {
  return JSON.parse(result.content[0]!.text as string);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mocks.agentService.startAgent.mockResolvedValue(undefined);
  mocks.agentService.approvePlan.mockResolvedValue(undefined);
});

// ============================================================================
// start_task
// ============================================================================
describe("start_task", () => {
  it("happy path: draft task is started, branch generated", async () => {
    const task = buildTask("draft");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "start_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("started");
    expect(body.branch_name).toBe("feature/test-task-123e4567");

    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
      branch_name: "feature/test-task-123e4567",
      status: "planning",
      error: undefined,
    });
    expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "planning"
    );
    expect(mocks.agentService.startAgent).toHaveBeenCalledWith(
      TEST_TASK_ID,
      false
    );
  });

  it("happy path: failed task clears error and starts", async () => {
    const task = buildTask("failed", { error: "previous error" });
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "start_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("started");

    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
      branch_name: "feature/test-task-123e4567",
      status: "planning",
      error: null,
    });
    expect(mocks.agentService.startAgent).toHaveBeenCalledWith(
      TEST_TASK_ID,
      false
    );
  });

  it("invalid status: coding returns isError", async () => {
    const task = buildTask("coding");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "start_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("INVALID_TASK_STATUS");
    expect(error.message).toContain("coding");
    expect(error.message).toContain("draft, failed");
    expect(mocks.agentService.startAgent).not.toHaveBeenCalled();
  });

  it("not found: returns isError", async () => {
    mocks.taskService.getById.mockReturnValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "start_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("TASK_NOT_FOUND");
  });
});

// ============================================================================
// execute_task
// ============================================================================
describe("execute_task", () => {
  it("happy path: approved task calls executeSpec", async () => {
    const task = buildTask("approved");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.executeSpec.mockResolvedValue(undefined);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "execute_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("started");
    expect(body.task_status).toBe("coding");

    expect(mocks.executeSpec).toHaveBeenCalledWith({
      task_id: TEST_TASK_ID,
    });
    expect(mocks.agentService.startAgent).not.toHaveBeenCalled();
  });

  it("happy path: backlog task updates to planning and starts agent", async () => {
    const task = buildTask("backlog");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "execute_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("started");
    expect(body.task_status).toBe("planning");
    expect(body.resume_mode).toBe(false);

    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
      status: "planning",
      error: undefined,
    });
    expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "planning"
    );
    expect(mocks.agentService.startAgent).toHaveBeenCalledWith(
      TEST_TASK_ID,
      false
    );
  });

  it("happy path: changes_requested resumes agent", async () => {
    const task = buildTask("changes_requested");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "execute_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("started");
    expect(body.task_status).toBe("planning");
    expect(body.resume_mode).toBe(true);

    expect(mocks.agentService.startAgent).toHaveBeenCalledWith(
      TEST_TASK_ID,
      true
    );
  });

  it("invalid status: draft returns isError", async () => {
    const task = buildTask("draft");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "execute_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("INVALID_TASK_STATUS");
    expect(error.message).toContain("draft");
    expect(error.message).toContain("backlog");
  });
});

// ============================================================================
// send_feedback
// ============================================================================
describe("send_feedback", () => {
  it("agent running: sends feedback directly", async () => {
    const task = buildTask("coding");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.isAgentRunning.mockReturnValue(true);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "send_feedback",
      arguments: { task_id: TEST_TASK_ID, message: "Looks good" },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("feedback_sent");

    expect(mocks.agentService.sendFeedback).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "Looks good"
    );
    expect(mocks.agentService.startAgent).not.toHaveBeenCalled();
  });

  it("plan_review: approves plan", async () => {
    const task = buildTask("plan_review");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.isAgentRunning.mockReturnValue(false);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "send_feedback",
      arguments: { task_id: TEST_TASK_ID, message: "Approve the plan" },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("plan_approved");

    expect(mocks.agentService.addUserMessageToHistory).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "Approve the plan"
    );
    expect(mocks.agentService.approvePlan).toHaveBeenCalledWith(TEST_TASK_ID);
    expect(mocks.agentService.startAgent).not.toHaveBeenCalled();
  });

  it("agent not running, active status: stores feedback and resumes", async () => {
    const task = buildTask("coding");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.isAgentRunning.mockReturnValue(false);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "send_feedback",
      arguments: { task_id: TEST_TASK_ID, message: "Please fix the bug" },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("agent_resumed");

    expect(mocks.agentService.addUserMessageToHistory).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "Please fix the bug"
    );
    expect(mocks.agentService.storeFeedbackForResume).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "Please fix the bug"
    );
    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
      status: "planning",
    });
    expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "planning"
    );
    expect(mocks.agentService.startAgent).toHaveBeenCalledWith(
      TEST_TASK_ID,
      true
    );
  });
});

// ============================================================================
// extend_task_timeout
// ============================================================================
describe("extend_task_timeout", () => {
  it("happy path: extends timeout and returns new timestamp", async () => {
    const task = buildTask("coding");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.isAgentRunning.mockReturnValue(true);
    const futureDate = new Date("2026-02-16T12:05:00.000Z");
    mocks.agentService.extendTimeout.mockReturnValue(futureDate);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "extend_task_timeout",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("extended");
    expect(body.new_timeout).toBe("2026-02-16T12:05:00.000Z");

    expect(mocks.agentService.extendTimeout).toHaveBeenCalledWith(
      TEST_TASK_ID
    );
  });

  it("no agent running: returns isError", async () => {
    const task = buildTask("coding");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.isAgentRunning.mockReturnValue(false);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "extend_task_timeout",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("AGENT_NOT_RUNNING");
  });
});

// ============================================================================
// cancel_task
// ============================================================================
describe("cancel_task", () => {
  it("refining status: cancels spec generation and resets to draft", async () => {
    const task = buildTask("refining");
    mocks.taskService.getById.mockReturnValue(task);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "cancel_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("canceled");

    expect(mocks.cancelSpecGeneration).toHaveBeenCalledWith(TEST_TASK_ID);
    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
      status: "draft",
      error: "Spec generation cancelled",
    });
    expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "draft"
    );
    expect(mocks.sseEmitter.emitError).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "Spec generation cancelled by user"
    );
    expect(mocks.agentService.cancelAgent).not.toHaveBeenCalled();
  });

  it("agent running: calls cancelAgent", async () => {
    const task = buildTask("coding");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.isAgentRunning.mockReturnValue(true);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "cancel_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("canceled");

    expect(mocks.agentService.cancelAgent).toHaveBeenCalledWith(TEST_TASK_ID);
    expect(mocks.cancelSpecGeneration).not.toHaveBeenCalled();
  });

  it("stuck task (planning, no agent): updates to canceled", async () => {
    const task = buildTask("planning");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.isAgentRunning.mockReturnValue(false);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "cancel_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBeFalsy();
    const body = parseResult(result as any);
    expect(body.status).toBe("canceled");

    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
      status: "canceled",
      error: "Task canceled by user (agent not running)",
    });
    expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(
      TEST_TASK_ID,
      "canceled"
    );
  });

  it("no agent, non-active status (done): returns isError", async () => {
    const task = buildTask("done");
    mocks.taskService.getById.mockReturnValue(task);
    mocks.agentService.isAgentRunning.mockReturnValue(false);

    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "cancel_task",
      arguments: { task_id: TEST_TASK_ID },
    });

    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(error.code).toBe("AGENT_NOT_RUNNING");
  });
});
