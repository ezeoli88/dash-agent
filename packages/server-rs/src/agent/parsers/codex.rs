use serde_json::Value;
use tracing::debug;

use crate::utils::{SSEEmitter, SSEEvent, SSEEventType};

/// Parses a single line of Codex `exec --json` NDJSON output.
///
/// Codex emits NDJSON events with a `type` field:
/// - `item.started` / `item.completed`: wraps an `item` with type, name, text, content, arguments, output
/// - `turn.completed`: milestone indicating a full turn is done
/// - Top-level message/content/text fields (legacy/simple format)
pub async fn parse(line: &str, emitter: &SSEEmitter, task_id: &str) {
    let parsed: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => {
            emit_log(emitter, task_id, "info", &format!("CLI: {}", truncate(line, 1000))).await;
            return;
        }
    };

    let event_type = parsed.get("type").and_then(Value::as_str).unwrap_or("");

    // Handle item.started / item.completed events (actual Codex --json format)
    if (event_type == "item.completed" || event_type == "item.started") && parsed.get("item").is_some() {
        let item = &parsed["item"];
        let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");

        match item_type {
            // Agent messages -- show text content
            "agent_message" | "message" => {
                let text = item
                    .get("text")
                    .and_then(Value::as_str)
                    .map(String::from)
                    .or_else(|| {
                        item.get("content")
                            .and_then(Value::as_array)
                            .map(|blocks| {
                                blocks
                                    .iter()
                                    .filter_map(|b| b.get("text").and_then(Value::as_str))
                                    .collect::<Vec<_>>()
                                    .join("")
                            })
                    });

                if let Some(text) = text {
                    if !text.is_empty() {
                        emit_log(emitter, task_id, "info", &format!("Agent: {}", truncate(&text, 1000))).await;
                        emit_chat_message(emitter, task_id, "assistant", &text).await;
                    }
                } else if event_type == "item.started" {
                    emit_log(emitter, task_id, "info", "Agent is thinking...").await;
                }
            }

            // Reasoning -- show internal chain-of-thought
            "reasoning" => {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    emit_log(emitter, task_id, "info", &format!("reasoning: {}", truncate(text, 1000))).await;
                    emit_chat_message(emitter, task_id, "system", text).await;
                }
            }

            // Command execution -- shell commands run by Codex
            "command_execution" => {
                let command = item
                    .get("command")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown command");
                let summary = truncate(command, 100);
                let item_id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("");

                if event_type == "item.started" {
                    emit_log(emitter, task_id, "info", &format!("Tool: {}", truncate(command, 200))).await;
                    emit_tool_activity(emitter, task_id, item_id, "Bash", summary, "running").await;
                } else {
                    // item.completed
                    let exit_code = item.get("exit_code").and_then(Value::as_i64);
                    let item_status = item.get("status").and_then(Value::as_str);
                    let status = if item_status == Some("completed") && exit_code == Some(0) {
                        "completed"
                    } else {
                        "error"
                    };
                    emit_log(
                        emitter,
                        task_id,
                        "info",
                        &format!(
                            "Tool: {} (exit {})",
                            truncate(command, 200),
                            exit_code.map(|c| c.to_string()).unwrap_or_else(|| "?".to_string())
                        ),
                    )
                    .await;
                    emit_tool_activity(emitter, task_id, item_id, "Bash", summary, status).await;
                }
            }

            // Function/tool calls -- show tool name and key argument
            "function_call" | "tool_use" => {
                let tool_name = item
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown");
                let detail = item
                    .get("arguments")
                    .and_then(Value::as_str)
                    .and_then(|args_str| {
                        serde_json::from_str::<Value>(args_str).ok().and_then(|args| {
                            extract_tool_key(&args)
                        })
                    })
                    .unwrap_or_default();

                let log_detail = if detail.is_empty() {
                    String::new()
                } else {
                    format!(": {detail}")
                };
                emit_log(emitter, task_id, "info", &format!("Tool: {tool_name}{log_detail}")).await;

                // Emit tool activity on item.started
                if event_type == "item.started" {
                    emit_tool_activity(emitter, task_id, "", tool_name, &detail, "running").await;
                }
            }

            // Function/tool outputs
            "function_call_output" => {
                let output = item
                    .get("output")
                    .or_else(|| item.get("text"))
                    .and_then(Value::as_str);
                if let Some(out) = output {
                    debug!(task_id, "Tool result ({} chars)", out.len());
                }
                let summary = output
                    .map(|o| format!("{} chars", o.len()))
                    .unwrap_or_else(|| "done".to_string());
                emit_tool_activity(emitter, task_id, "", "", &summary, "completed").await;
            }

            // Other item types with text
            _ => {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    let label = if item_type.is_empty() { "Output" } else { item_type };
                    emit_log(emitter, task_id, "info", &format!("{label}: {}", truncate(text, 500))).await;
                }
                // Skip noisy events without useful content
            }
        }
        return;
    }

    // turn.completed -- useful milestone
    if event_type == "turn.completed" {
        emit_log(emitter, task_id, "info", "Turn completed").await;
        return;
    }

    // Top-level message/content/text (legacy/simple format)
    let message_text = parsed
        .get("message")
        .or_else(|| parsed.get("content"))
        .or_else(|| parsed.get("text"))
        .and_then(Value::as_str);

    if let Some(msg) = message_text {
        emit_log(emitter, task_id, "info", &format!("Agent: {}", truncate(msg, 1000))).await;
    } else if !event_type.is_empty() {
        debug!(task_id, "Codex event ({event_type}): {}", truncate(line, 200));
    }
}

/// Extracts a key parameter value from tool arguments for display.
fn extract_tool_key(args: &Value) -> Option<String> {
    for key in &["file_path", "command", "path", "pattern", "query", "file"] {
        if let Some(val) = args.get(key).and_then(Value::as_str) {
            return Some(truncate(val, 200).to_string());
        }
    }
    None
}

fn truncate(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        s
    } else {
        let mut end = max_len;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        &s[..end]
    }
}

async fn emit_log(emitter: &SSEEmitter, task_id: &str, level: &str, message: &str) {
    emitter.emit_log(task_id, level, message, None).await;
}

async fn emit_chat_message(emitter: &SSEEmitter, task_id: &str, role: &str, content: &str) {
    let data = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "role": role,
        "content": content,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    emitter
        .emit(
            task_id,
            SSEEvent {
                event_type: SSEEventType::ChatMessage,
                data,
            },
        )
        .await;
}

async fn emit_tool_activity(
    emitter: &SSEEmitter,
    task_id: &str,
    id: &str,
    name: &str,
    summary: &str,
    status: &str,
) {
    let tool_id = if id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        id.to_string()
    };
    let data = serde_json::json!({
        "id": tool_id,
        "name": name,
        "summary": summary,
        "status": status,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    emitter
        .emit(
            task_id,
            SSEEvent {
                event_type: SSEEventType::ToolActivity,
                data,
            },
        )
        .await;
}
