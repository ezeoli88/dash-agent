pub mod claude_code;
pub mod codex;
pub mod copilot;
pub mod gemini;

use crate::agent::types::AgentType;
use crate::utils::SSEEmitter;

/// Dispatches a single line of CLI output to the appropriate agent-specific parser.
///
/// Each parser interprets the agent's JSON or text output format and emits structured
/// SSE events (logs, chat messages, tool activity) via the emitter.
pub async fn parse_output_line(
    agent_type: &AgentType,
    line: &str,
    emitter: &SSEEmitter,
    task_id: &str,
) {
    match agent_type {
        AgentType::ClaudeCode => claude_code::parse(line, emitter, task_id).await,
        AgentType::Codex => codex::parse(line, emitter, task_id).await,
        AgentType::Copilot => copilot::parse(line, emitter, task_id).await,
        AgentType::Gemini => gemini::parse(line, emitter, task_id).await,
        AgentType::MiniMax => {} // API-based agent — output parsing is handled by the API runner
    }
}
