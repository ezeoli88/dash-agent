use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, warn};

/// Channel capacity for per-task SSE broadcast channels.
const CHANNEL_CAPACITY: usize = 256;

/// Types of SSE events that can be emitted to clients.
///
/// Each variant maps to the lowercase string used as the SSE `event:` field,
/// matching the TypeScript server's event names exactly.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SSEEventType {
    Log,
    Status,
    TimeoutWarning,
    AwaitingReview,
    Complete,
    Error,
    PrComment,
    ChatMessage,
    ToolActivity,
}

impl SSEEventType {
    /// Returns the SSE event name string used in `event: <name>` lines.
    pub fn as_event_name(&self) -> &'static str {
        match self {
            SSEEventType::Log => "log",
            SSEEventType::Status => "status",
            SSEEventType::TimeoutWarning => "timeout_warning",
            SSEEventType::AwaitingReview => "awaiting_review",
            SSEEventType::Complete => "complete",
            SSEEventType::Error => "error",
            SSEEventType::PrComment => "pr_comment",
            SSEEventType::ChatMessage => "chat_message",
            SSEEventType::ToolActivity => "tool_activity",
        }
    }
}

/// An SSE event carrying a typed event and a JSON payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SSEEvent {
    pub event_type: SSEEventType,
    pub data: serde_json::Value,
}

/// Task-specific SSE broadcaster.
///
/// Maintains one `broadcast::Sender` per task ID so that multiple HTTP clients
/// can subscribe to the same task's event stream. Producers call `emit*` methods
/// which fan-out to every active subscriber on that task's channel.
///
/// This struct is cheaply cloneable (inner state is behind `Arc<RwLock<_>>`).
#[derive(Clone)]
pub struct SSEEmitter {
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<SSEEvent>>>>,
}

impl SSEEmitter {
    /// Creates a new, empty emitter with no active channels.
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Subscribes to the event stream for a given task.
    ///
    /// If no channel exists for the task yet, one is created automatically.
    /// The returned `Receiver` will receive all events emitted after the
    /// subscription point.
    pub async fn subscribe(&self, task_id: &str) -> broadcast::Receiver<SSEEvent> {
        let mut channels = self.channels.write().await;
        let sender = channels
            .entry(task_id.to_string())
            .or_insert_with(|| {
                let (tx, _) = broadcast::channel(CHANNEL_CAPACITY);
                debug!(task_id, "Created new SSE channel");
                tx
            });
        sender.subscribe()
    }

    /// Emits an arbitrary SSE event to all subscribers of a task.
    ///
    /// If no channel exists for the task (i.e., nobody has subscribed),
    /// the event is silently dropped.
    pub async fn emit(&self, task_id: &str, event: SSEEvent) {
        let channels = self.channels.read().await;
        if let Some(sender) = channels.get(task_id) {
            let receiver_count = sender.receiver_count();
            if receiver_count == 0 {
                return;
            }
            match sender.send(event) {
                Ok(_) => {
                    debug!(
                        task_id,
                        event_type = ?&"emit",
                        receivers = receiver_count,
                        "SSE event broadcast"
                    );
                }
                Err(_) => {
                    // All receivers have been dropped between the check and send.
                    // This is benign — the channel will be cleaned up on close_task.
                    warn!(task_id, "SSE send failed: no active receivers");
                }
            }
        }
    }

    /// Emits a log event for a task.
    pub async fn emit_log(
        &self,
        task_id: &str,
        level: &str,
        message: &str,
        data: Option<serde_json::Value>,
    ) {
        let mut log_data = serde_json::json!({
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "level": level,
            "message": message,
        });
        if let Some(extra) = data {
            log_data
                .as_object_mut()
                .unwrap()
                .insert("data".to_string(), extra);
        }
        self.emit(
            task_id,
            SSEEvent {
                event_type: SSEEventType::Log,
                data: log_data,
            },
        )
        .await;
    }

    /// Emits a status change event for a task.
    pub async fn emit_status(&self, task_id: &str, status: &str) {
        self.emit(
            task_id,
            SSEEvent {
                event_type: SSEEventType::Status,
                data: serde_json::json!({ "status": status }),
            },
        )
        .await;
    }

    /// Emits a completion event for a task.
    pub async fn emit_complete(
        &self,
        task_id: &str,
        pr_url: Option<&str>,
        summary: Option<&str>,
    ) {
        let mut obj = serde_json::Map::new();
        if let Some(url) = pr_url {
            obj.insert("pr_url".to_string(), serde_json::Value::String(url.to_string()));
        }
        if let Some(s) = summary {
            obj.insert("summary".to_string(), serde_json::Value::String(s.to_string()));
        }
        self.emit(
            task_id,
            SSEEvent {
                event_type: SSEEventType::Complete,
                data: serde_json::Value::Object(obj),
            },
        )
        .await;
    }

    /// Emits an error event for a task.
    pub async fn emit_error(&self, task_id: &str, message: &str) {
        self.emit(
            task_id,
            SSEEvent {
                event_type: SSEEventType::Error,
                data: serde_json::json!({ "message": message }),
            },
        )
        .await;
    }

    /// Removes the broadcast channel for a task, causing all receivers to see
    /// the channel as closed. Subsequent subscribes will create a fresh channel.
    pub async fn close_task(&self, task_id: &str) {
        let mut channels = self.channels.write().await;
        if channels.remove(task_id).is_some() {
            debug!(task_id, "SSE channel closed and removed");
        }
    }

    /// Returns the number of active receivers (connected SSE clients) for a task.
    /// Returns 0 if no channel exists for the task.
    pub async fn get_client_count(&self, task_id: &str) -> usize {
        let channels = self.channels.read().await;
        channels
            .get(task_id)
            .map(|tx| tx.receiver_count())
            .unwrap_or(0)
    }
}

impl Default for SSEEmitter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_type_serializes_to_snake_case() {
        let json = serde_json::to_string(&SSEEventType::TimeoutWarning).unwrap();
        assert_eq!(json, r#""timeout_warning""#);

        let json = serde_json::to_string(&SSEEventType::ChatMessage).unwrap();
        assert_eq!(json, r#""chat_message""#);

        let json = serde_json::to_string(&SSEEventType::PrComment).unwrap();
        assert_eq!(json, r#""pr_comment""#);
    }

    #[test]
    fn event_type_as_event_name() {
        assert_eq!(SSEEventType::Log.as_event_name(), "log");
        assert_eq!(SSEEventType::ToolActivity.as_event_name(), "tool_activity");
    }

    #[tokio::test]
    async fn subscribe_creates_channel_and_receives_events() {
        let emitter = SSEEmitter::new();
        let mut rx = emitter.subscribe("task-1").await;

        emitter
            .emit(
                "task-1",
                SSEEvent {
                    event_type: SSEEventType::Status,
                    data: serde_json::json!({"status": "running"}),
                },
            )
            .await;

        let event = rx.recv().await.unwrap();
        assert_eq!(event.event_type, SSEEventType::Status);
        assert_eq!(event.data["status"], "running");
    }

    #[tokio::test]
    async fn emit_to_nonexistent_task_is_silent() {
        let emitter = SSEEmitter::new();
        // Should not panic
        emitter
            .emit(
                "no-such-task",
                SSEEvent {
                    event_type: SSEEventType::Error,
                    data: serde_json::json!({"message": "boom"}),
                },
            )
            .await;
    }

    #[tokio::test]
    async fn close_task_removes_channel() {
        let emitter = SSEEmitter::new();
        let _rx = emitter.subscribe("task-2").await;
        assert_eq!(emitter.get_client_count("task-2").await, 1);

        emitter.close_task("task-2").await;
        assert_eq!(emitter.get_client_count("task-2").await, 0);
    }

    #[tokio::test]
    async fn get_client_count_reflects_subscribers() {
        let emitter = SSEEmitter::new();
        assert_eq!(emitter.get_client_count("t").await, 0);

        let _rx1 = emitter.subscribe("t").await;
        assert_eq!(emitter.get_client_count("t").await, 1);

        let _rx2 = emitter.subscribe("t").await;
        assert_eq!(emitter.get_client_count("t").await, 2);

        drop(_rx1);
        // broadcast::Sender::receiver_count decrements when receivers drop
        assert_eq!(emitter.get_client_count("t").await, 1);
    }
}
