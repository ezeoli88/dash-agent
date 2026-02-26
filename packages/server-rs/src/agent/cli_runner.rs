use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use crate::error::AppError;
use crate::utils::SSEEmitter;

use super::parsers;
use super::types::{AgentRunResult, AgentType, CLICommand, CLIRunnerOptions};

/// Silence timeout: warn if no stdout output after this duration.
const SILENCE_TIMEOUT: Duration = Duration::from_secs(30);

/// Maximum silence before considering the agent stuck (5 minutes).
const MAX_SILENCE: Duration = Duration::from_secs(300);

/// Auth/subscription error rules keyed by agent type.
struct AuthErrorRule {
    pattern: regex_lite::Regex,
    message: &'static str,
    help_url: &'static str,
}

/// Returns the set of auth error rules for each agent type.
fn get_auth_error_rules() -> HashMap<&'static str, Vec<AuthErrorRule>> {
    let mut rules = HashMap::new();

    rules.insert(
        "copilot",
        vec![AuthErrorRule {
            pattern: regex_lite::Regex::new(
                r"(?i)Access denied by policy|subscription does not include|policies have not been enabled|organization has restricted",
            )
            .unwrap(),
            message: "Your GitHub Copilot subscription may have expired or the CLI feature is not enabled in your account/organization settings.",
            help_url: "https://github.com/settings/copilot",
        }],
    );

    rules.insert(
        "claude-code",
        vec![AuthErrorRule {
            pattern: regex_lite::Regex::new(
                r"(?i)invalid.{0,10}api.?key|authentication.{0,10}(failed|error)|unauthorized|credit balance is too low",
            )
            .unwrap(),
            message: "Your Anthropic API key may be invalid, expired, or your account may have insufficient credits.",
            help_url: "https://console.anthropic.com/settings/keys",
        }],
    );

    rules.insert(
        "codex",
        vec![AuthErrorRule {
            pattern: regex_lite::Regex::new(
                r"(?i)invalid.{0,10}api.?key|authentication.{0,10}(failed|error)|unauthorized|exceeded.{0,10}quota",
            )
            .unwrap(),
            message: "Your OpenAI API key may be invalid or your subscription may have expired.",
            help_url: "https://platform.openai.com/api-keys",
        }],
    );

    rules.insert(
        "gemini",
        vec![
            AuthErrorRule {
                pattern: regex_lite::Regex::new(
                    r"(?i)must specify the GEMINI_API_KEY|GEMINI_API_KEY environment variable",
                )
                .unwrap(),
                message: "The Gemini CLI requires the GEMINI_API_KEY environment variable. Set it via `export GEMINI_API_KEY=your-key` or authenticate with `gemini auth login`.",
                help_url: "https://aistudio.google.com/app/apikey",
            },
            AuthErrorRule {
                pattern: regex_lite::Regex::new(
                    r"(?i)api.?key.{0,10}not valid|PERMISSION_DENIED|RESOURCE_EXHAUSTED|authentication.{0,10}(failed|error)|unauthorized",
                )
                .unwrap(),
                message: "Your Google API key may be invalid or your quota may have been exceeded.",
                help_url: "https://aistudio.google.com/app/apikey",
            },
        ],
    );

    rules
}

/// Checks accumulated stderr lines for known auth/subscription error patterns.
fn detect_auth_error(agent_type: &str, stderr_lines: &[String]) -> Option<(String, String)> {
    let rules = get_auth_error_rules();
    let Some(agent_rules) = rules.get(agent_type) else {
        return None;
    };

    let full_stderr = stderr_lines.join("\n");
    for rule in agent_rules {
        if rule.pattern.is_match(&full_stderr) {
            return Some((
                rule.message.to_string(),
                rule.help_url.to_string(),
            ));
        }
    }

    None
}

/// Builds the spawn command for a specific CLI agent type.
///
/// Each agent type has its own command-line interface and flags.
pub fn build_cli_command(
    agent_type: &AgentType,
    prompt: &str,
    model: Option<&str>,
    plan_only: bool,
) -> CLICommand {
    match agent_type {
        AgentType::ClaudeCode => {
            // Claude Code: prompt is sent via stdin to avoid Windows command-line issues
            let allowed_tools = if plan_only {
                "Read,Bash,Grep,Glob"
            } else {
                "Read,Edit,Bash,Write"
            };
            let mut args = vec![
                "-p".to_string(),
                "--output-format".to_string(),
                "stream-json".to_string(),
                "--verbose".to_string(),
                "--allowedTools".to_string(),
                allowed_tools.to_string(),
            ];
            if let Some(m) = model {
                args.push("--model".to_string());
                args.push(m.to_string());
            }
            CLICommand {
                command: "claude".to_string(),
                args,
                use_stdin: true,
            }
        }

        AgentType::Codex => {
            // Codex: exec subcommand with danger-full-access sandbox
            let mut args = vec![
                "exec".to_string(),
                "--json".to_string(),
                "--sandbox".to_string(),
                "danger-full-access".to_string(),
            ];
            if let Some(m) = model {
                args.push("-m".to_string());
                args.push(m.to_string());
            }
            args.push(prompt.to_string());
            CLICommand {
                command: "codex".to_string(),
                args,
                use_stdin: false,
            }
        }

        AgentType::Gemini => {
            // Gemini: prompt via stdin, -p '.' as placeholder
            let mut args = vec![
                "-p".to_string(),
                ".".to_string(),
                "--output-format".to_string(),
                "stream-json".to_string(),
                "--yolo".to_string(),
            ];
            if let Some(m) = model {
                args.push("--model".to_string());
                args.push(m.to_string());
            }
            CLICommand {
                command: "gemini".to_string(),
                args,
                use_stdin: true,
            }
        }

        AgentType::Copilot => {
            // Copilot: prompt via stdin with empty -p flag
            let mut args = vec![
                "-p".to_string(),
                String::new(),
                "--yolo".to_string(),
                "--no-ask-user".to_string(),
            ];
            if let Some(m) = model {
                args.push("--model".to_string());
                args.push(m.to_string());
            }
            CLICommand {
                command: "copilot".to_string(),
                args,
                use_stdin: true,
            }
        }
    }
}

/// Kills a process and all its children.
///
/// On Windows, uses `taskkill /F /T /PID`. On Unix, sends SIGKILL to the
/// process group.
pub fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    #[cfg(unix)]
    {
        // Send SIGKILL to the entire process group
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
}

/// CLI-based agent runner that spawns coding CLIs (Claude Code, Codex, Gemini, Copilot)
/// as child processes, parses their output, and manages their lifecycle.
pub struct CLIAgentRunner {
    options: CLIRunnerOptions,
    feedback_tx: mpsc::Sender<String>,
    feedback_rx: Option<mpsc::Receiver<String>>,
    cancel_token: CancellationToken,
    is_running: Arc<AtomicBool>,
    /// Accumulated raw output for summary extraction.
    output: Arc<tokio::sync::Mutex<String>>,
}

impl CLIAgentRunner {
    /// Creates a new CLI agent runner.
    pub fn new(options: CLIRunnerOptions) -> Self {
        let (feedback_tx, feedback_rx) = mpsc::channel(32);

        info!(
            task_id = %options.task_id,
            agent_type = %options.agent_type,
            cwd = %options.cwd.display(),
            "CLIAgentRunner initialized"
        );

        Self {
            options,
            feedback_tx,
            feedback_rx: Some(feedback_rx),
            cancel_token: CancellationToken::new(),
            is_running: Arc::new(AtomicBool::new(false)),
            output: Arc::new(tokio::sync::Mutex::new(String::new())),
        }
    }

    /// Returns a clone of the cancellation token for external cancellation.
    pub fn cancel_token(&self) -> CancellationToken {
        self.cancel_token.clone()
    }

    /// Returns a clone of the feedback sender channel.
    pub fn feedback_sender(&self) -> mpsc::Sender<String> {
        self.feedback_tx.clone()
    }

    /// Runs the CLI agent to completion.
    ///
    /// Spawns the child process, monitors stdout/stderr, handles feedback delivery,
    /// and returns the result when the process exits or is cancelled.
    pub async fn run(&mut self, sse_emitter: &SSEEmitter) -> Result<AgentRunResult, AppError> {
        if self.is_running.load(Ordering::SeqCst) {
            return Ok(AgentRunResult {
                success: false,
                pr_url: None,
                error: Some("Agent is already running".to_string()),
                summary: None,
                changes_data: None,
            });
        }

        self.is_running.store(true, Ordering::SeqCst);

        let result = self.spawn_and_monitor(sse_emitter).await;

        self.is_running.store(false, Ordering::SeqCst);

        result
    }

    /// Sends feedback to the running CLI process via the feedback channel.
    pub fn send_feedback(&self, message: String) {
        let tx = self.feedback_tx.clone();
        tokio::spawn(async move {
            if let Err(e) = tx.send(message).await {
                warn!("Failed to send feedback: {e}");
            }
        });
    }

    /// Cancels the agent execution.
    pub fn cancel(&self) {
        self.cancel_token.cancel();
        info!(task_id = %self.options.task_id, "Agent cancellation requested");
    }

    /// Returns whether the agent is currently running.
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// Spawns the CLI process and monitors it until completion.
    async fn spawn_and_monitor(
        &mut self,
        sse_emitter: &SSEEmitter,
    ) -> Result<AgentRunResult, AppError> {
        let cli_command = build_cli_command(
            &self.options.agent_type,
            &self.options.prompt,
            self.options.model.as_deref(),
            self.options.plan_only,
        );

        info!(
            task_id = %self.options.task_id,
            command = %cli_command.command,
            args_count = cli_command.args.len(),
            prompt_length = self.options.prompt.len(),
            use_stdin = cli_command.use_stdin,
            "Spawning CLI process"
        );

        // Determine if we need shell execution.
        // On Windows, npm-installed CLIs are .cmd wrappers that need shell.
        // Gemini and Copilot CLIs need shell for wrapper resolution.
        let use_shell = cfg!(windows)
            && matches!(
                cli_command.command.as_str(),
                "gemini" | "copilot" | "codex"
            );

        let mut cmd = Command::new(&cli_command.command);
        cmd.args(&cli_command.args)
            .current_dir(&self.options.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Inject environment variables
        for (key, val) in &self.options.env {
            cmd.env(key, val);
        }

        // Windows-specific: hide the spawned console window
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000_u32); // CREATE_NO_WINDOW

        if use_shell {
            #[cfg(windows)]
            {
                // Rebuild as shell command on Windows
                let full_cmd = format!(
                    "{} {}",
                    &cli_command.command,
                    cli_command
                        .args
                        .iter()
                        .map(|a| {
                            if a.is_empty() || a.contains(' ') {
                                format!("\"{}\"", a)
                            } else {
                                a.clone()
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                );
                cmd = Command::new("cmd");
                cmd.args(["/C", &full_cmd])
                    .current_dir(&self.options.cwd)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());
                for (key, val) in &self.options.env {
                    cmd.env(key, val);
                }
                cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            }
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                error!(
                    task_id = %self.options.task_id,
                    error = %e,
                    "Failed to spawn CLI process"
                );
                return Ok(AgentRunResult {
                    success: false,
                    pr_url: None,
                    error: Some(format!("Failed to start CLI agent: {e}")),
                    summary: None,
                    changes_data: None,
                });
            }
        };

        let child_pid = child.id().unwrap_or(0);
        info!(
            task_id = %self.options.task_id,
            pid = child_pid,
            "CLI process spawned"
        );

        // Write prompt to stdin if needed, then close stdin for prompt delivery
        if cli_command.use_stdin {
            if let Some(mut stdin) = child.stdin.take() {
                let prompt = self.options.prompt.clone();
                let task_id = self.options.task_id.clone();
                tokio::spawn(async move {
                    if let Err(e) = stdin.write_all(prompt.as_bytes()).await {
                        warn!(task_id = %task_id, "Failed to write prompt to stdin: {e}");
                    }
                    if let Err(e) = stdin.shutdown().await {
                        warn!(task_id = %task_id, "Failed to close stdin: {e}");
                    }
                });
            }
        }

        // Take stdout/stderr handles
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Shared state
        let task_id = self.options.task_id.clone();
        let agent_type = self.options.agent_type.clone();
        let output_buf = Arc::clone(&self.output);
        let cancel = self.cancel_token.clone();

        // Take feedback receiver
        let mut feedback_rx = self.feedback_rx.take();

        // Spawn stdout reader task
        let sse_stdout = sse_emitter.clone();
        let task_id_stdout = task_id.clone();
        let agent_type_stdout = agent_type.clone();
        let output_stdout = Arc::clone(&output_buf);
        let stdout_handle = tokio::spawn(async move {
            let Some(stdout) = stdout else { return };
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                {
                    let mut buf = output_stdout.lock().await;
                    buf.push_str(&line);
                    buf.push('\n');
                }
                parsers::parse_output_line(&agent_type_stdout, &trimmed, &sse_stdout, &task_id_stdout).await;
            }
        });

        // Spawn stderr reader task
        let sse_stderr = sse_emitter.clone();
        let task_id_stderr = task_id.clone();
        let stderr_handle = tokio::spawn(async move {
            let mut collected_lines = Vec::new();
            let Some(stderr) = stderr else {
                return collected_lines;
            };
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim().to_string();
                if !trimmed.is_empty() {
                    sse_stderr
                        .emit_log(&task_id_stderr, "warn", &format!("CLI stderr: {trimmed}"), None)
                        .await;
                    collected_lines.push(trimmed);
                }
            }
            collected_lines
        });

        // Spawn feedback writer task (writes to child's stdin when messages arrive)
        // Note: for agents using stdin for prompt, stdin is already closed.
        // Feedback is only meaningful when the agent supports interactive stdin.
        let task_id_feedback = task_id.clone();
        let feedback_handle = tokio::spawn(async move {
            let Some(ref mut rx) = feedback_rx else { return };
            while let Some(msg) = rx.recv().await {
                info!(task_id = %task_id_feedback, "Feedback received (stdin closed, queued): {msg}");
                // In a future iteration, we could reopen stdin or use a different
                // mechanism. For now, log it.
            }
        });

        // Wait for process exit, cancellation, or silence timeout
        let result = tokio::select! {
            status = child.wait() => {
                match status {
                    Ok(exit_status) => {
                        let code = exit_status.code().unwrap_or(1);
                        info!(task_id = %task_id, exit_code = code, "CLI process exited");

                        // Wait for stdout/stderr readers to finish
                        let _ = stdout_handle.await;
                        let stderr_lines = stderr_handle.await.unwrap_or_default();

                        if cancel.is_cancelled() {
                            Ok(AgentRunResult {
                                success: false,
                                pr_url: None,
                                error: Some("Agent was cancelled".to_string()),
                                summary: None,
                                changes_data: None,
                            })
                        } else if code == 0 {
                            let summary = self.extract_summary().await;
                            Ok(AgentRunResult {
                                success: true,
                                pr_url: None,
                                error: None,
                                summary: Some(summary),
                                changes_data: None,
                            })
                        } else {
                            // Check for auth errors
                            if let Some((auth_msg, _help_url)) = detect_auth_error(agent_type.as_str(), &stderr_lines) {
                                sse_emitter.emit_log(&task_id, "error", &auth_msg, None).await;
                                Ok(AgentRunResult {
                                    success: false,
                                    pr_url: None,
                                    error: Some(auth_msg),
                                    summary: None,
                                    changes_data: None,
                                })
                            } else {
                                let error_msg = format!("CLI process exited with code {code}");
                                Ok(AgentRunResult {
                                    success: false,
                                    pr_url: None,
                                    error: Some(error_msg),
                                    summary: None,
                                    changes_data: None,
                                })
                            }
                        }
                    }
                    Err(e) => {
                        error!(task_id = %task_id, error = %e, "CLI process wait failed");
                        Ok(AgentRunResult {
                            success: false,
                            pr_url: None,
                            error: Some(format!("CLI process error: {e}")),
                            summary: None,
                            changes_data: None,
                        })
                    }
                }
            }

            _ = cancel.cancelled() => {
                warn!(task_id = %task_id, "Agent cancelled, killing process tree");
                kill_process_tree(child_pid);
                let _ = child.kill().await;
                Ok(AgentRunResult {
                    success: false,
                    pr_url: None,
                    error: Some("Agent was cancelled".to_string()),
                    summary: None,
                    changes_data: None,
                })
            }

            _ = tokio::time::sleep(MAX_SILENCE) => {
                warn!(task_id = %task_id, "Agent silence timeout reached, killing process");
                sse_emitter.emit_log(
                    &task_id,
                    "error",
                    "Agent timed out due to prolonged silence (5 minutes without output)",
                    None,
                ).await;
                kill_process_tree(child_pid);
                let _ = child.kill().await;
                Ok(AgentRunResult {
                    success: false,
                    pr_url: None,
                    error: Some("Agent timed out due to silence".to_string()),
                    summary: None,
                    changes_data: None,
                })
            }
        };

        // Clean up feedback task
        feedback_handle.abort();

        result
    }

    /// Extracts a summary from the accumulated output.
    ///
    /// For Claude Code, tries to find the `result` JSON event. Falls back to
    /// the last meaningful lines of output.
    async fn extract_summary(&self) -> String {
        let output = self.output.lock().await;

        // For Claude Code, try to find the result message in JSON output
        if self.options.agent_type == AgentType::ClaudeCode {
            for line in output.lines().rev() {
                let trimmed = line.trim();
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if parsed.get("type").and_then(|t| t.as_str()) == Some("result") {
                        if let Some(result) = parsed.get("result").and_then(|r| r.as_str()) {
                            let len = result.len().min(2000);
                            return result[..len].to_string();
                        }
                    }
                }
            }
        }

        // Fall back to the last non-empty lines
        let lines: Vec<&str> = output
            .lines()
            .filter(|l| !l.trim().is_empty())
            .collect();
        let last_lines: String = lines
            .iter()
            .rev()
            .take(5)
            .rev()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");

        let len = last_lines.len().min(2000);
        if len == 0 {
            "CLI agent completed".to_string()
        } else {
            last_lines[..len].to_string()
        }
    }
}

// Suppress the unused SILENCE_TIMEOUT warning -- it documents the design intent
// and will be used when we add the silence-warning feature.
const _: Duration = SILENCE_TIMEOUT;
