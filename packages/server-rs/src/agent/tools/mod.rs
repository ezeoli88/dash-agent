//! Tool execution module for API-based agents.
//!
//! Provides tool definitions (OpenAI function-calling format) and a dispatcher
//! that routes tool calls to the appropriate implementation.

pub mod bash;
pub mod edit_file;
pub mod glob_tool;
pub mod grep_tool;
pub mod list_dir;
pub mod read_file;
pub mod sub_agent;
pub mod write_file;

use serde_json::Value;
use std::path::Path;

/// Result from executing a tool.
#[derive(Debug, Clone)]
pub struct ToolResult {
    pub content: String,
    pub is_error: bool,
}

impl ToolResult {
    pub fn ok(content: String) -> Self {
        Self {
            content,
            is_error: false,
        }
    }

    pub fn err(content: String) -> Self {
        Self {
            content,
            is_error: true,
        }
    }
}

/// Returns all tool definitions as JSON (OpenAI function-calling format).
///
/// When `include_sub_agent` is false, the sub_agent tool is excluded
/// (used for sub-agent runners to prevent recursion).
pub fn get_tool_definitions(include_sub_agent: bool) -> Vec<Value> {
    let mut tools = vec![
        bash::definition(),
        read_file::definition(),
        write_file::definition(),
        edit_file::definition(),
        glob_tool::definition(),
        grep_tool::definition(),
        list_dir::definition(),
    ];
    if include_sub_agent {
        tools.push(sub_agent::definition());
    }
    tools
}

/// Execute a tool by name with the given arguments.
///
/// `cwd` is the working directory for all file/process operations.
/// The `sub_agent` tool is NOT executed here — it's handled by the runner.
pub async fn execute_tool(name: &str, args: Value, cwd: &Path) -> ToolResult {
    match name {
        "bash" => bash::execute(args, cwd).await,
        "read_file" => read_file::execute(args, cwd).await,
        "write_file" => write_file::execute(args, cwd).await,
        "edit_file" => edit_file::execute(args, cwd).await,
        "glob" => glob_tool::execute(args, cwd).await,
        "grep" => grep_tool::execute(args, cwd).await,
        "list_directory" => list_dir::execute(args, cwd).await,
        "sub_agent" => ToolResult::err("sub_agent is handled by the runner, not here".into()),
        _ => ToolResult::err(format!("Unknown tool: {name}")),
    }
}
