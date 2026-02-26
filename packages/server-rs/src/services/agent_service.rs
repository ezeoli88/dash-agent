use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::RwLock;
use tokio::time::Instant;
use tracing::{error, info, warn};

use crate::agent::{CLIAgentRunner, CLIRunnerOptions};
use crate::error::AppError;
use crate::utils::{DataEventEmitter, SSEEmitter};

/// Default timeout duration (10 minutes).
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// Warning threshold before timeout (5 minutes before).
#[allow(dead_code)]
const WARNING_THRESHOLD: Duration = Duration::from_secs(5 * 60);

/// Extension duration (5 minutes).
const EXTENSION_DURATION: Duration = Duration::from_secs(5 * 60);

/// Maximum number of log entries per task to prevent memory leaks.
const MAX_LOGS_PER_TASK: usize = 1000;

/// A log entry recorded during agent execution.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentLogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Tracking metadata for a running agent.
///
/// The actual `CLIAgentRunner` is owned by the spawned Tokio task. This struct
/// stores only the lightweight metadata needed for management operations
/// (timeout, cancel, feedback). Communication with the runner happens via
/// a `CancellationToken` and an `mpsc` feedback channel.
#[allow(dead_code)]
struct AgentTracking {
    task_id: String,
    started_at: Instant,
    timeout_at: Instant,
    warning_sent: bool,
    /// Cancellation token shared with the runner.
    cancel_token: tokio_util::sync::CancellationToken,
    /// Feedback sender shared with the runner.
    feedback_tx: tokio::sync::mpsc::Sender<String>,
}

/// Service for managing agent execution.
///
/// Handles starting, stopping, monitoring, and sending feedback to CLI agent runners.
/// Each running agent is tracked by task ID.
pub struct AgentService {
    active_agents: Arc<RwLock<HashMap<String, AgentTracking>>>,
    agent_logs: Arc<RwLock<HashMap<String, Vec<AgentLogEntry>>>>,
    sse_emitter: Arc<SSEEmitter>,
    #[allow(dead_code)]
    data_emitter: Arc<DataEventEmitter>,
}

impl AgentService {
    /// Creates a new agent service.
    pub fn new(sse_emitter: Arc<SSEEmitter>, data_emitter: Arc<DataEventEmitter>) -> Self {
        Self {
            active_agents: Arc::new(RwLock::new(HashMap::new())),
            agent_logs: Arc::new(RwLock::new(HashMap::new())),
            sse_emitter,
            data_emitter,
        }
    }

    /// Starts an agent for the given task.
    ///
    /// Spawns the CLI agent as a background Tokio task and returns immediately.
    /// The result of the agent run is communicated via SSE events.
    pub async fn start_agent(
        &self,
        task_id: &str,
        options: CLIRunnerOptions,
    ) -> Result<(), AppError> {
        // Check if agent is already running
        {
            let agents = self.active_agents.read().await;
            if agents.contains_key(task_id) {
                return Err(AppError::Conflict(format!(
                    "Agent is already running for task {task_id}"
                )));
            }
        }

        // Initialize logs
        {
            let mut logs = self.agent_logs.write().await;
            logs.entry(task_id.to_string()).or_default();
        }

        self.log(
            task_id,
            "info",
            &format!("Starting CLI agent: {}", options.agent_type),
            None,
        )
        .await;

        // Create the runner
        let mut runner = CLIAgentRunner::new(options);

        // Extract the cancel token and feedback channel from the runner
        // so the tracking struct can reference them.
        let cancel_token = runner.cancel_token();
        let feedback_tx = runner.feedback_sender();

        let now = Instant::now();
        let timeout_at = now + DEFAULT_TIMEOUT;

        // Store tracking metadata
        {
            let mut agents = self.active_agents.write().await;
            agents.insert(
                task_id.to_string(),
                AgentTracking {
                    task_id: task_id.to_string(),
                    started_at: now,
                    timeout_at,
                    warning_sent: false,
                    cancel_token: cancel_token.clone(),
                    feedback_tx,
                },
            );
        }

        // Spawn the agent execution as a background task
        let sse = Arc::clone(&self.sse_emitter);
        let active_agents = Arc::clone(&self.active_agents);
        let _agent_logs = Arc::clone(&self.agent_logs);
        let task_id_bg = task_id.to_string();

        tokio::spawn(async move {
            let result = runner.run(&sse).await;

            match &result {
                Ok(res) if res.success => {
                    info!(task_id = %task_id_bg, "Agent completed successfully");
                    sse.emit_log(&task_id_bg, "info", "Agent completed successfully", None)
                        .await;
                }
                Ok(res) => {
                    let err = res.error.as_deref().unwrap_or("Unknown error");
                    warn!(task_id = %task_id_bg, error = err, "Agent failed");
                    sse.emit_error(&task_id_bg, err).await;
                }
                Err(e) => {
                    error!(task_id = %task_id_bg, error = %e, "Agent error");
                    sse.emit_error(&task_id_bg, &e.to_string()).await;
                }
            }

            // Remove from active agents
            {
                let mut agents = active_agents.write().await;
                agents.remove(&task_id_bg);
            }
        });

        info!(
            task_id,
            timeout_at = ?timeout_at,
            "Agent started successfully"
        );

        Ok(())
    }

    /// Records a log entry for a task.
    async fn log(
        &self,
        task_id: &str,
        level: &str,
        message: &str,
        data: Option<serde_json::Value>,
    ) {
        let entry = AgentLogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: level.to_string(),
            message: message.to_string(),
            data: data.clone(),
        };

        {
            let mut logs = self.agent_logs.write().await;
            let task_logs = logs.entry(task_id.to_string()).or_default();
            if task_logs.len() < MAX_LOGS_PER_TASK {
                task_logs.push(entry);
            }
        }

        self.sse_emitter
            .emit_log(task_id, level, message, data)
            .await;
    }

    /// Sends feedback to a running agent.
    pub async fn send_feedback(&self, task_id: &str, message: &str) -> Result<(), AppError> {
        let agents = self.active_agents.read().await;
        if let Some(agent) = agents.get(task_id) {
            let tx = agent.feedback_tx.clone();
            if let Err(e) = tx.send(message.to_string()).await {
                warn!(task_id, error = %e, "Failed to send feedback");
            } else {
                info!(task_id, "Feedback sent to agent");
            }
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "No active agent for task {task_id}"
            )))
        }
    }

    /// Cancels a running agent.
    pub async fn cancel_agent(&self, task_id: &str) -> Result<(), AppError> {
        let agents = self.active_agents.read().await;
        if let Some(agent) = agents.get(task_id) {
            agent.cancel_token.cancel();
            info!(task_id, "Agent cancellation requested");
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "No active agent for task {task_id}"
            )))
        }
    }

    /// Returns whether an agent is running for the given task.
    pub async fn is_running(&self, task_id: &str) -> bool {
        let agents = self.active_agents.read().await;
        agents.contains_key(task_id)
    }

    /// Returns the number of currently active agents.
    pub async fn get_active_count(&self) -> usize {
        let agents = self.active_agents.read().await;
        agents.len()
    }

    /// Returns the logs for a task.
    pub async fn get_logs(&self, task_id: &str) -> Vec<AgentLogEntry> {
        let logs = self.agent_logs.read().await;
        logs.get(task_id).cloned().unwrap_or_default()
    }

    /// Extends the timeout for a running agent.
    ///
    /// Returns the new timeout instant.
    pub async fn extend_timeout(&self, task_id: &str) -> Result<Instant, AppError> {
        let mut agents = self.active_agents.write().await;
        if let Some(agent) = agents.get_mut(task_id) {
            agent.timeout_at = Instant::now() + EXTENSION_DURATION;
            agent.warning_sent = false;
            info!(task_id, "Timeout extended");
            Ok(agent.timeout_at)
        } else {
            Err(AppError::NotFound(format!(
                "No active agent for task {task_id}"
            )))
        }
    }
}
