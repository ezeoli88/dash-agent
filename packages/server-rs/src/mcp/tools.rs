//! MCP tool definitions and handlers.
//!
//! Each tool has a name, description, JSON Schema input definition, and an async
//! handler that operates on [`AppState`]. Tools that require agent execution
//! (start_task, approve_changes, send_feedback, approve_spec) are stubs in this
//! phase -- they return a "not implemented" message.
//!
//! The tools mirror the TypeScript MCP implementation:
//! - Repository: `add_repository`, `list_repositories`
//! - Tasks: `create_task`, `list_tasks`, `get_task`
//! - Workflow stubs: `start_task`, `approve_spec`, `send_feedback`
//! - Review: `get_changes`, `approve_changes`, `request_changes`
//! - Status: `get_setup_status`

use serde_json::{json, Value};
use tracing::{info, warn};

use crate::error::AppError;
use crate::models::task::TaskStatus;
use crate::services::task_service::{self, CreateTaskServiceInput};
use crate::AppState;

// ============================================================================
// Tool definition (returned by tools/list)
// ============================================================================

/// Returns the list of all tool definitions for `tools/list`.
///
/// Each tool has `name`, `description`, and `inputSchema` (JSON Schema).
pub fn tool_definitions() -> Value {
    json!({
        "tools": [
            {
                "name": "add_repository",
                "description": "Add a local repository to Agent Board. Detects the project stack automatically from the filesystem. Returns the created repository object.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Repository display name"
                        },
                        "path": {
                            "type": "string",
                            "description": "Absolute filesystem path to the local git repository"
                        },
                        "default_branch": {
                            "type": "string",
                            "description": "Default branch name (defaults to \"main\")"
                        },
                        "remote_url": {
                            "type": "string",
                            "description": "Optional remote URL override"
                        }
                    },
                    "required": ["name", "path"]
                }
            },
            {
                "name": "list_repositories",
                "description": "List all repositories registered in Agent Board. Returns an array of repository objects with id, name, url, default_branch, detected_stack, and active_tasks_count.",
                "inputSchema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "create_task",
                "description": "Create a new task in Agent Board. Requires a repository_id and user_input describing what to build. Returns the created task object in 'draft' status.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repository_id": {
                            "type": "string",
                            "description": "Repository UUID to associate the task with"
                        },
                        "user_input": {
                            "type": "string",
                            "description": "Natural language description of what to build or fix"
                        },
                        "title": {
                            "type": "string",
                            "description": "Short task title (auto-generated from user_input if omitted)"
                        },
                        "description": {
                            "type": "string",
                            "description": "Detailed description (defaults to user_input)"
                        },
                        "target_branch": {
                            "type": "string",
                            "description": "Base branch for the task (defaults to \"main\")"
                        },
                        "context_files": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "File paths the agent should review first"
                        },
                        "build_command": {
                            "type": "string",
                            "description": "Build command to verify changes"
                        },
                        "agent_type": {
                            "type": "string",
                            "description": "CLI agent type override (e.g. claude-code, codex, gemini)"
                        },
                        "agent_model": {
                            "type": "string",
                            "description": "CLI agent model override"
                        }
                    },
                    "required": ["repository_id", "user_input"]
                }
            },
            {
                "name": "list_tasks",
                "description": "List tasks, optionally filtered by repository_id and/or status. Returns an array of task objects ordered by creation date (newest first).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repository_id": {
                            "type": "string",
                            "description": "Filter by repository UUID"
                        },
                        "status": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Filter by one or more task statuses (e.g. ['draft', 'planning'])"
                        }
                    }
                }
            },
            {
                "name": "get_task",
                "description": "Get the full details of a specific task by its ID, including status, branch_name, pr_url, error, and all metadata.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        }
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "start_task",
                "description": "Start a task that is in 'draft' or 'failed' status. Creates a feature branch and launches the agent in planning mode. The agent runs asynchronously; poll the task status to track progress.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        }
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "approve_spec",
                "description": "Approve the generated spec for a task. Moves the task from 'pending_approval' to 'approved'. Optionally provide an edited spec.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        },
                        "final_spec": {
                            "type": "string",
                            "description": "Optionally provide an edited spec to approve instead of the generated one"
                        }
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "send_feedback",
                "description": "Send feedback or a message to the agent working on a task. If the agent is running, the message is delivered directly. If the task is in 'plan_review', this approves the plan.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        },
                        "message": {
                            "type": "string",
                            "description": "Feedback message to send to the agent"
                        }
                    },
                    "required": ["task_id", "message"]
                }
            },
            {
                "name": "get_changes",
                "description": "Get the files changed by the agent for a task. Returns a list of changed files with their diff content. Falls back to persisted changes data.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        }
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "approve_changes",
                "description": "Approve the agent's code changes and create a Pull Request. Only valid when the task is in 'awaiting_review' or 'review' status.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        }
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "request_changes",
                "description": "Request changes on a task. Sets the task to 'changes_requested' and stores the feedback for the agent.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        },
                        "feedback": {
                            "type": "string",
                            "description": "Detailed feedback describing what changes are needed"
                        }
                    },
                    "required": ["task_id", "feedback"]
                }
            },
            {
                "name": "delete_task",
                "description": "Delete a task by ID. Cancels any running agent and cleans up the worktree in the background. Returns confirmation.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        }
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "mark_pr_merged",
                "description": "Mark a task's PR as merged. Sets status to 'done' and cleans up the worktree.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        }
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "mark_pr_closed",
                "description": "Mark a task's PR as closed without merging. Sets status to 'canceled'.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "Task UUID"
                        }
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "get_setup_status",
                "description": "Get the current Agent Board setup status including AI provider configuration and secret status. Useful for checking if the board is ready to run tasks.",
                "inputSchema": {
                    "type": "object",
                    "properties": {}
                }
            }
        ]
    })
}

// ============================================================================
// Tool dispatch
// ============================================================================

/// Dispatches a `tools/call` request to the appropriate tool handler.
///
/// Returns an MCP tool result with `content` array containing text items.
pub async fn call_tool(state: &AppState, name: &str, args: Value) -> Value {
    match name {
        "add_repository" => handle_add_repository(state, args).await,
        "list_repositories" => handle_list_repositories(state).await,
        "create_task" => handle_create_task(state, args).await,
        "list_tasks" => handle_list_tasks(state, args).await,
        "get_task" => handle_get_task(state, args).await,
        "start_task" => handle_start_task(state, args).await,
        "approve_spec" => handle_approve_spec(state, args).await,
        "send_feedback" => handle_send_feedback(state, args).await,
        "get_changes" => handle_get_changes(state, args).await,
        "approve_changes" => handle_approve_changes(state, args).await,
        "request_changes" => handle_request_changes(state, args).await,
        "delete_task" => handle_delete_task(state, args).await,
        "mark_pr_merged" => handle_pr_lifecycle(state, args, "pr-merged").await,
        "mark_pr_closed" => handle_pr_lifecycle(state, args, "pr-closed").await,
        "get_setup_status" => handle_get_setup_status(state).await,
        _ => tool_error(&format!("Unknown tool: {name}")),
    }
}

// ============================================================================
// Tool result helpers
// ============================================================================

/// Wraps a value as an MCP tool result with a single text content item.
fn tool_result(data: &Value) -> Value {
    json!({
        "content": [{
            "type": "text",
            "text": serde_json::to_string_pretty(data).unwrap_or_else(|_| "{}".to_string())
        }]
    })
}

/// Returns an MCP tool error result.
fn tool_error(message: &str) -> Value {
    json!({
        "content": [{
            "type": "text",
            "text": message
        }],
        "isError": true
    })
}

/// Returns an error result from an `AppError`.
fn tool_app_error(context: &str, err: AppError) -> Value {
    warn!(%err, context = context, "MCP tool error");
    tool_error(&format!("{context}: {err}"))
}

/// Returns a "not implemented" stub result for tools that depend on agent services.
fn tool_stub(tool_name: &str) -> Value {
    json!({
        "content": [{
            "type": "text",
            "text": serde_json::to_string_pretty(&json!({
                "status": "not_implemented",
                "message": format!("Tool '{tool_name}' is not yet implemented in the Rust server. Agent execution requires the CLI runner which is planned for a future phase.")
            })).unwrap_or_default()
        }]
    })
}

// ============================================================================
// Repository tools
// ============================================================================

/// `add_repository` - Create a repository from a local filesystem path.
async fn handle_add_repository(state: &AppState, args: Value) -> Value {
    let name = args["name"].as_str().unwrap_or("").trim().to_string();
    let path = args["path"].as_str().unwrap_or("").trim().to_string();
    let default_branch = args["default_branch"]
        .as_str()
        .unwrap_or("main")
        .to_string();

    if name.is_empty() || path.is_empty() {
        return tool_error("Missing required parameters: name, path");
    }

    let url = format!("file://{path}");

    let result = state
        .db
        .call(move |conn| {
            // Check for duplicate
            let existing: Option<String> = conn
                .query_row(
                    "SELECT id FROM repositories WHERE url = ?1",
                    [&url],
                    |row| row.get(0),
                )
                .ok();

            if let Some(existing_id) = existing {
                return Ok(json!({
                    "error": "duplicate_repository",
                    "message": format!("Repository already exists at this path (id: {existing_id})"),
                    "hint": format!("Use list_repositories or get repository with id: {existing_id}")
                }));
            }

            let id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().to_rfc3339();

            conn.execute(
                "INSERT INTO repositories (id, name, url, default_branch, detected_stack, conventions, learned_patterns, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![id, name, url, default_branch, "{}", "", "[]", now, now],
            )
            .map_err(AppError::Database)?;

            info!(id = %id, name = %name, "Repository created via MCP");

            Ok(json!({
                "id": id,
                "name": name,
                "url": url,
                "default_branch": default_branch,
                "detected_stack": {},
                "conventions": "",
                "learned_patterns": [],
                "active_tasks_count": 0,
                "created_at": now,
                "updated_at": now
            }))
        })
        .await;

    match result {
        Ok(data) => {
            // Emit data change event if it was a successful creation (no error field)
            if data.get("error").is_none() {
                if let Some(id) = data["id"].as_str() {
                    state.data_emitter.emit_change("repo", "created", Some(id));
                }
            }
            tool_result(&data)
        }
        Err(e) => tool_app_error("Error adding repository", e),
    }
}

/// `list_repositories` - List all registered repositories.
async fn handle_list_repositories(state: &AppState) -> Value {
    let result = state
        .db
        .call(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT r.*, \
                       (SELECT COUNT(*) FROM tasks t \
                        WHERE t.repository_id = r.id \
                        AND t.status NOT IN ('done', 'archived')) as active_tasks_count \
                     FROM repositories r \
                     ORDER BY r.created_at DESC",
                )
                .map_err(AppError::Database)?;

            let rows = stmt
                .query_map([], |row| {
                    Ok(json!({
                        "id": row.get::<_, String>("id").unwrap_or_default(),
                        "name": row.get::<_, String>("name").unwrap_or_default(),
                        "url": row.get::<_, String>("url").unwrap_or_default(),
                        "default_branch": row.get::<_, String>("default_branch").unwrap_or_else(|_| "main".to_string()),
                        "detected_stack": serde_json::from_str::<Value>(
                            &row.get::<_, String>("detected_stack").unwrap_or_else(|_| "{}".to_string())
                        ).unwrap_or(json!({})),
                        "conventions": row.get::<_, String>("conventions").unwrap_or_default(),
                        "learned_patterns": serde_json::from_str::<Value>(
                            &row.get::<_, String>("learned_patterns").unwrap_or_else(|_| "[]".to_string())
                        ).unwrap_or(json!([])),
                        "active_tasks_count": row.get::<_, i64>("active_tasks_count").unwrap_or(0),
                        "created_at": row.get::<_, String>("created_at").unwrap_or_default(),
                        "updated_at": row.get::<_, String>("updated_at").unwrap_or_default(),
                    }))
                })
                .map_err(AppError::Database)?;

            let mut repos = Vec::new();
            for row in rows {
                repos.push(row.map_err(AppError::Database)?);
            }

            info!(count = repos.len(), "list_repositories via MCP");
            Ok(Value::Array(repos))
        })
        .await;

    match result {
        Ok(data) => tool_result(&data),
        Err(e) => tool_app_error("Error listing repositories", e),
    }
}

// ============================================================================
// Task tools
// ============================================================================

/// `create_task` - Create a new task in draft status.
async fn handle_create_task(state: &AppState, args: Value) -> Value {
    let repository_id = args["repository_id"].as_str().map(String::from);
    let user_input = args["user_input"].as_str().map(String::from);

    if repository_id.is_none() || user_input.is_none() {
        return tool_error("Missing required parameters: repository_id, user_input");
    }

    let input = CreateTaskServiceInput {
        repository_id,
        user_input,
        title: args["title"].as_str().map(String::from),
        description: args["description"].as_str().map(String::from),
        repo_url: None, // Will be resolved from repository_id if needed
        target_branch: args["target_branch"].as_str().map(String::from),
        context_files: args["context_files"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            }),
        build_command: args["build_command"].as_str().map(String::from),
        agent_type: args["agent_type"].as_str().map(String::from),
        agent_model: args["agent_model"].as_str().map(String::from),
    };

    let result = state
        .db
        .call(move |conn| {
            let task = task_service::create_task(conn, &input)?;
            let task_json = serde_json::to_value(&task)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("JSON error: {e}")))?;
            Ok(task_json)
        })
        .await;

    match result {
        Ok(data) => {
            if let Some(id) = data["id"].as_str() {
                state
                    .data_emitter
                    .emit_change("task", "created", Some(id));
            }
            tool_result(&data)
        }
        Err(e) => tool_app_error("Error creating task", e),
    }
}

/// `list_tasks` - List tasks with optional filters.
async fn handle_list_tasks(state: &AppState, args: Value) -> Value {
    let repository_id = args["repository_id"].as_str().map(String::from);
    let status_filter: Option<Vec<String>> = args["status"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        });

    let result = state
        .db
        .call(move |conn| {
            let tasks =
                task_service::get_all_tasks(conn, None, repository_id.as_deref())?;

            // Apply status filter if provided
            let filtered = if let Some(ref statuses) = status_filter {
                tasks
                    .into_iter()
                    .filter(|t| statuses.contains(&t.status.as_str().to_string()))
                    .collect::<Vec<_>>()
            } else {
                tasks
            };

            info!(count = filtered.len(), "list_tasks via MCP");

            let tasks_json = serde_json::to_value(&filtered)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("JSON error: {e}")))?;
            Ok(tasks_json)
        })
        .await;

    match result {
        Ok(data) => tool_result(&data),
        Err(e) => tool_app_error("Error listing tasks", e),
    }
}

/// `get_task` - Get full task details by ID.
async fn handle_get_task(state: &AppState, args: Value) -> Value {
    let task_id = match args["task_id"].as_str() {
        Some(id) => id.to_string(),
        None => return tool_error("Missing required parameter: task_id"),
    };

    let result = state
        .db
        .call(move |conn| {
            let task = task_service::get_task_by_id(conn, &task_id)?;
            let task_json = serde_json::to_value(&task)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("JSON error: {e}")))?;
            Ok(task_json)
        })
        .await;

    match result {
        Ok(data) => tool_result(&data),
        Err(e) => tool_app_error("Error getting task", e),
    }
}

// ============================================================================
// Workflow tools (stubs)
// ============================================================================

/// `start_task` - Start a task (draft/failed → planning), spawn agent.
async fn handle_start_task(state: &AppState, args: Value) -> Value {
    let task_id = match args.get("task_id").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return tool_error("task_id is required"),
    };

    // Load task
    let tid = task_id.clone();
    let task = match state.db.call(move |conn| task_service::get_task_by_id(conn, &tid)).await {
        Ok(t) => t,
        Err(e) => return tool_app_error("start_task", e),
    };

    // Validate status
    if task.status != TaskStatus::Draft && task.status != TaskStatus::Failed {
        return tool_error(&format!(
            "Cannot start task with status: {}. Expected: draft or failed",
            task.status.as_str()
        ));
    }

    // Generate branch name
    let title_slug: String = task.title.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let title_slug = &title_slug[..title_slug.len().min(40)];
    let task_suffix = &task_id[..task_id.len().min(8)];
    let branch_name = format!("feature/{title_slug}-{task_suffix}");

    let is_retry = task.status == TaskStatus::Failed;

    // Update task
    let tid = task_id.clone();
    let branch_clone = branch_name.clone();
    if let Err(e) = state.db.call(move |conn| {
        task_service::update_task(conn, &tid, &crate::models::task::UpdateTaskInput {
            branch_name: Some(Some(branch_clone)),
            status: Some(TaskStatus::Planning),
            error: if is_retry { Some(None) } else { None },
            ..Default::default()
        })
    }).await {
        return tool_app_error("start_task", e);
    }

    state.sse_emitter.emit_status(&task_id, "planning").await;

    // Start agent in background
    let state_clone = state.clone();
    let id_clone = task_id.clone();
    let task_clone = task.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::routes::tasks::start_agent_for_task(&state_clone, &id_clone, &task_clone).await {
            warn!(task_id = %id_clone, error = %e, "Failed to start agent (MCP)");
            let tid = id_clone.clone();
            let err_msg = e.to_string();
            let _ = state_clone.db.call(move |conn| {
                task_service::update_task(conn, &tid, &crate::models::task::UpdateTaskInput {
                    status: Some(TaskStatus::Failed),
                    error: Some(Some(err_msg)),
                    ..Default::default()
                })
            }).await;
            state_clone.sse_emitter.emit_status(&id_clone, "failed").await;
            state_clone.sse_emitter.emit_error(&id_clone, &e.to_string()).await;
        }
    });

    state.data_emitter.emit_change("task", "updated", Some(&task_id));
    info!(id = %task_id, "start_task (MCP)");
    tool_result(&json!({ "status": "started", "message": "Agent started" }))
}

/// `approve_spec` - Approve a generated spec for a task.
async fn handle_approve_spec(state: &AppState, args: Value) -> Value {
    let task_id = match args["task_id"].as_str() {
        Some(id) => id.to_string(),
        None => return tool_error("Missing required parameter: task_id"),
    };

    let final_spec = args["final_spec"].as_str().map(String::from);

    let result = state
        .db
        .call(move |conn| {
            let task = task_service::approve_spec(
                conn,
                &task_id,
                final_spec.as_deref(),
            )?;
            let task_json = serde_json::to_value(&task)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("JSON error: {e}")))?;
            Ok(task_json)
        })
        .await;

    match result {
        Ok(data) => {
            if let Some(id) = data["id"].as_str() {
                state
                    .data_emitter
                    .emit_change("task", "updated", Some(id));
            }
            tool_result(&data)
        }
        Err(e) => tool_app_error("Error approving spec", e),
    }
}

/// `send_feedback` - STUB: Agent communication not yet implemented.
async fn handle_send_feedback(_state: &AppState, _args: Value) -> Value {
    tool_stub("send_feedback")
}

// ============================================================================
// Review tools
// ============================================================================

/// `get_changes` - Get persisted changes/diff data for a task.
async fn handle_get_changes(state: &AppState, args: Value) -> Value {
    let task_id = match args["task_id"].as_str() {
        Some(id) => id.to_string(),
        None => return tool_error("Missing required parameter: task_id"),
    };

    let result = state
        .db
        .call(move |conn| {
            let task = task_service::get_task_by_id(conn, &task_id)?;

            // Try to parse persisted changes_data
            if let Some(ref changes_json) = task.changes_data {
                match serde_json::from_str::<Value>(changes_json) {
                    Ok(data) => return Ok(data),
                    Err(_) => {
                        warn!(task_id = %task_id, "Failed to parse persisted changes_data");
                    }
                }
            }

            // No changes available
            Ok(json!({
                "error": "no_changes_available",
                "message": "No worktree or persisted changes found for this task.",
                "hint": "The agent may still be working. Use get_task to check status."
            }))
        })
        .await;

    match result {
        Ok(data) => tool_result(&data),
        Err(e) => tool_app_error("Error getting changes", e),
    }
}

/// `approve_changes` - Approve changes and create PR (awaiting_review/review → approved → pr_created).
async fn handle_approve_changes(state: &AppState, args: Value) -> Value {
    let task_id = match args.get("task_id").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return tool_error("task_id is required"),
    };

    // Load task
    let tid = task_id.clone();
    let task = match state.db.call(move |conn| task_service::get_task_by_id(conn, &tid)).await {
        Ok(t) => t,
        Err(e) => return tool_app_error("approve_changes", e),
    };

    // Validate status
    if task.status != TaskStatus::AwaitingReview && task.status != TaskStatus::Review {
        return tool_error(&format!(
            "Cannot approve task with status: {}. Expected: awaiting_review or review",
            task.status.as_str()
        ));
    }

    // Set status to approved
    let tid = task_id.clone();
    if let Err(e) = state.db.call(move |conn| {
        task_service::update_task(conn, &tid, &crate::models::task::UpdateTaskInput {
            status: Some(TaskStatus::Approved),
            ..Default::default()
        })
    }).await {
        return tool_app_error("approve_changes", e);
    }
    state.sse_emitter.emit_status(&task_id, "approved").await;

    // Push and create PR
    match crate::routes::tasks::push_and_create_pr(state.clone(), task_id.clone(), task).await {
        Ok(body) => {
            info!(id = %task_id, "approve_changes (MCP)");
            tool_result(&body.0)
        }
        Err(e) => tool_app_error("approve_changes", e),
    }
}

/// `request_changes` - Update task status to changes_requested.
async fn handle_request_changes(state: &AppState, args: Value) -> Value {
    let task_id = match args["task_id"].as_str() {
        Some(id) => id.to_string(),
        None => return tool_error("Missing required parameter: task_id"),
    };

    let feedback = match args["feedback"].as_str() {
        Some(f) if !f.is_empty() => f.to_string(),
        _ => return tool_error("Missing required parameter: feedback"),
    };

    let result = state
        .db
        .call(move |conn| {
            let task = task_service::get_task_by_id(conn, &task_id)?;

            // Validate status
            let valid_statuses = ["pr_created", "review", "awaiting_review"];
            if !valid_statuses.contains(&task.status.as_str()) {
                return Err(AppError::Validation(format!(
                    "Cannot request changes for task with status '{}'. Expected: {}",
                    task.status,
                    valid_statuses.join(", ")
                )));
            }

            let update = crate::models::task::UpdateTaskInput {
                status: Some(TaskStatus::ChangesRequested),
                error: Some(Some(feedback)),
                ..Default::default()
            };

            let updated = task_service::update_task(conn, &task_id, &update)?;
            let task_json = serde_json::to_value(&updated)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("JSON error: {e}")))?;
            Ok(task_json)
        })
        .await;

    match result {
        Ok(data) => {
            if let Some(id) = data["id"].as_str() {
                state
                    .data_emitter
                    .emit_change("task", "updated", Some(id));
            }
            tool_result(&json!({
                "status": "changes_requested",
                "message": "Changes requested. Use execute_task to resume the agent."
            }))
        }
        Err(e) => tool_app_error("Error requesting changes", e),
    }
}

// ============================================================================
// Status tools
// ============================================================================

/// `delete_task` - Delete a task by ID, cancel agent, cleanup worktree.
async fn handle_delete_task(state: &AppState, args: Value) -> Value {
    let task_id = match args.get("task_id").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return tool_error("task_id is required"),
    };

    // Check task exists
    let tid = task_id.clone();
    let task = state.db.call(move |conn| {
        crate::services::task_service::get_task_by_id(conn, &tid)
    }).await;

    if let Err(e) = &task {
        return tool_app_error("delete_task", AppError::NotFound(format!("Task not found (id: {task_id}): {e}")));
    }

    // Cancel running agent if any
    if state.agent_service.is_running(&task_id).await {
        info!(id = %task_id, "Cancelling running agent before deleting task (MCP)");
        let _ = state.agent_service.cancel_agent(&task_id).await;
    }

    // Delete task
    let tid = task_id.clone();
    let delete_result = state.db.call(move |conn| {
        crate::services::task_service::delete_task(conn, &tid)
    }).await;

    match delete_result {
        Ok(_) => {
            // Fire-and-forget worktree cleanup
            let git_service = std::sync::Arc::clone(&state.git_service);
            let tid = task_id.clone();
            tokio::spawn(async move {
                if let Ok(true) = git_service.worktree_exists(&tid).await {
                    let _ = git_service.cleanup_worktree(&tid, true).await;
                }
            });

            state.data_emitter.emit_change("task", "deleted", Some(&task_id));
            info!(id = %task_id, "delete_task (MCP)");
            tool_result(&json!({ "status": "deleted", "task_id": task_id }))
        }
        Err(e) => tool_app_error("delete_task", e),
    }
}

/// `mark_pr_merged` / `mark_pr_closed` - Update task status directly.
async fn handle_pr_lifecycle(state: &AppState, args: Value, action: &str) -> Value {
    let task_id = match args.get("task_id").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return tool_error("task_id is required"),
    };

    let (new_status, status_str, message) = match action {
        "pr-merged" => (TaskStatus::Done, "done", "PR marked as merged."),
        "pr-closed" => (TaskStatus::Canceled, "canceled", "PR marked as closed."),
        _ => return tool_error(&format!("Unknown action: {action}")),
    };

    let tid = task_id.clone();
    let result = state.db.call(move |conn| {
        task_service::update_task(conn, &tid, &crate::models::task::UpdateTaskInput {
            status: Some(new_status),
            ..Default::default()
        })
    }).await;

    match result {
        Ok(_) => {
            state.data_emitter.emit_change("task", "updated", Some(&task_id));
            info!(id = %task_id, action = action, "pr_lifecycle (MCP)");
            tool_result(&json!({ "status": status_str, "message": message }))
        }
        Err(e) => tool_app_error(action, e),
    }
}

/// `get_setup_status` - Get secrets configuration status.
async fn handle_get_setup_status(state: &AppState) -> Value {
    let result = state
        .db
        .call(|conn| {
            let status =
                crate::services::secrets_service::get_all_secrets_status(conn)?;

            info!("get_setup_status via MCP");

            Ok(json!({
                "secrets": {
                    "ai_configured": status.ai_configured,
                    "github_configured": status.github_configured,
                    "gitlab_configured": status.gitlab_configured
                },
                "agents": [],
                "oauth_configured": false
            }))
        })
        .await;

    match result {
        Ok(data) => tool_result(&data),
        Err(e) => tool_app_error("Error getting setup status", e),
    }
}
