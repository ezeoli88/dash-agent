# MCP Client Setup for Agent Board

This document describes how to configure MCP (Model Context Protocol) clients to connect to the Agent Board server.

---

## 1. Prerequisites

- **Agent Board server running**: Either in binary mode (`npx ai-agent-board`) or dev mode (`npm run dev` from the monorepo root).
- **Auth token**: When auth is enabled (default in binary mode), the server prints the token to stdout on startup. Copy this token for client configuration.
- **Network access**: The server listens on `0.0.0.0`, so it is accessible from any machine on the local network. Use `localhost` for same-machine connections or the host's LAN IP for remote connections.

---

## 2. Connection Details

| Property | Value |
|---|---|
| **Endpoint URL** | `http://<host>:<port>/api/mcp` |
| **Protocol** | Streamable HTTP (JSON-RPC over POST) |
| **Default port (binary)** | `51767` |
| **Default port (dev)** | `3000` |
| **Auth header** | `Authorization: Bearer <token>` |
| **Content-Type** | `application/json` |

The MCP server operates in **stateless mode**. Each POST request creates a fresh server instance, processes the JSON-RPC message, and returns the response. There is no persistent session or SSE stream to maintain.

---

## 3. Claude Code Setup

Create a `.mcp.json` file in your project root directory:

```json
{
  "mcpServers": {
    "agent-board": {
      "type": "streamable-http",
      "url": "http://localhost:51767/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

Replace `<your-token>` with the auth token printed by the server on startup.

If running in dev mode with auth disabled, you can omit the `headers` field:

```json
{
  "mcpServers": {
    "agent-board": {
      "type": "streamable-http",
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

After creating the file, restart Claude Code or reload the MCP configuration for it to take effect.

---

## 4. Claude Desktop Setup

Edit your `claude_desktop_config.json` file. The file location depends on your operating system:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add the following entry under `mcpServers`:

```json
{
  "mcpServers": {
    "agent-board": {
      "type": "streamable-http",
      "url": "http://localhost:51767/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

Replace `<your-token>` with the auth token printed by the server on startup. Restart Claude Desktop after saving the file.

---

## 5. Generic MCP Clients

Any MCP client that supports the **Streamable HTTP transport** can connect to Agent Board. The requirements are:

- **HTTP method**: `POST`
- **URL**: `http://<host>:<port>/api/mcp`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <token>` (when auth is enabled)
- **Body**: A valid JSON-RPC 2.0 message conforming to the MCP protocol.

### Example: List Tools

```bash
curl -X POST http://localhost:51767/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

### Example: Call a Tool

```bash
curl -X POST http://localhost:51767/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_tasks",
      "arguments": {}
    }
  }'
```

### Example: List Resources

```bash
curl -X POST http://localhost:51767/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "resources/list",
    "params": {}
  }'
```

### Stateless Behavior

The server does not maintain session state between requests. Each POST is handled independently. Clients do not need to implement session management, reconnection logic, or SSE event listeners. Simply send a POST request and read the JSON-RPC response.

---

## 6. Dev Mode vs Binary Mode

| Aspect | Binary Mode | Dev Mode |
|---|---|---|
| **Default port** | `51767` | `3000` |
| **Auth** | Enabled by default | Disabled by default |
| **Token** | Printed to stdout on startup | Not required (unless explicitly enabled) |
| **Start command** | `npx ai-agent-board` | `npm run dev` (from monorepo root) |
| **Endpoint** | `http://localhost:51767/api/mcp` | `http://localhost:3000/api/mcp` |

In dev mode, the Vite dev server runs on port 3003 and proxies `/api` requests to the Express server on port 3000. MCP clients should connect directly to the Express server on port 3000, not through the Vite proxy.

If you need to enable auth in dev mode, set the appropriate environment variable or configuration before starting the server.

---

## 7. Available Tools Quick Reference

### Task CRUD

| Tool | Description |
|---|---|
| `create_task` | Create a new task (requires `repository_id`, `user_input`) |
| `list_tasks` | List tasks, optionally filtered by `repository_id` and `status` |
| `get_task` | Get full task details by ID |
| `update_task` | Update editable fields of a task |
| `delete_task` | Delete a task and clean up resources |

### Workflow

| Tool | Description |
|---|---|
| `start_task` | Start a draft/failed task (creates branch, launches agent) |
| `execute_task` | Execute a task (approved -> dev agent, others -> planning agent) |
| `send_feedback` | Send feedback to a running agent or approve a plan |
| `extend_task_timeout` | Extend running agent timeout by 5 minutes |
| `cancel_task` | Cancel agent execution |

### Review and PR

| Tool | Description |
|---|---|
| `get_task_changes` | Get changed files and diff for a task |
| `approve_changes` | Approve changes and create a pull request |
| `request_changes` | Request changes on a pull request |
| `mark_pr_merged` | Mark PR as merged (status transitions to `done`) |
| `mark_pr_closed` | Mark PR as closed (status transitions to `canceled`) |

### Status

| Tool | Description |
|---|---|
| `get_setup_status` | Get AI provider config, detected agents, and OAuth status |

### Repository

| Tool | Description |
|---|---|
| `list_repositories` | List all registered repositories |
| `add_repository` | Add a local repository by path |
| `get_repository` | Get repository details by ID |

### Resources

| Resource URI | Description |
|---|---|
| `task://list` | List of all tasks |
| `task://{id}` | Single task details |
| `repo://list` | List of all repositories |
| `repo://{id}` | Single repository details |

---

## 8. Troubleshooting

### 401 Unauthorized

**Cause**: Missing or invalid auth token.

- Verify the `Authorization` header is set to `Bearer <token>` (note the space after "Bearer").
- Confirm the token matches the one printed by the server on startup. The token is regenerated each time the server restarts.
- In dev mode, auth may be disabled. If you receive a 401 in dev mode, check whether auth was explicitly enabled.

### Connection Refused (ECONNREFUSED)

**Cause**: The server is not running or is listening on a different port.

- Verify the server is running: check for the process or look for the startup message in the terminal.
- Confirm you are using the correct port (`51767` for binary mode, `3000` for dev mode).
- If connecting from another machine on the LAN, use the host machine's IP address instead of `localhost`.
- Check that no firewall rules are blocking the port.

### 405 Method Not Allowed

**Cause**: Using the wrong HTTP method.

- The MCP endpoint only accepts `POST` requests. Verify your client is sending a POST, not GET or PUT.
- Some MCP clients may attempt to use SSE or GET-based polling. Agent Board's MCP server is stateless and only supports POST with JSON-RPC bodies.

### 404 Not Found

**Cause**: Wrong endpoint URL.

- Verify the URL ends with `/api/mcp`. All API routes are prefixed with `/api/`.
- Double-check for typos in the URL path.

### Empty or Malformed Response

**Cause**: Invalid JSON-RPC request body.

- Ensure the request body is valid JSON with the required fields: `jsonrpc`, `id`, `method`.
- The `jsonrpc` field must be exactly `"2.0"`.
- The `method` field must be a valid MCP method (e.g., `tools/list`, `tools/call`, `resources/list`, `resources/read`).

### Tool Call Returns an Error

**Cause**: Missing or invalid tool arguments.

- Check that required arguments are provided. For example, `create_task` requires both `repository_id` and `user_input`.
- Verify argument types match expectations (e.g., IDs are strings or numbers as required by the specific tool).
- Use `tools/list` to inspect the expected input schema for each tool.
