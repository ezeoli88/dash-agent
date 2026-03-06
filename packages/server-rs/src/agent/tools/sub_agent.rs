//! Sub-agent tool definition.
//!
//! The actual execution is handled in the API runner, not here.
//! This module only provides the tool definition for the LLM.

use serde_json::Value;

pub fn definition() -> Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": "sub_agent",
            "description": "Launch a sub-agent to research a specific topic autonomously. The sub-agent runs its own agentic loop with all tools (read_file, glob, grep, list_directory, bash, write_file, edit_file) and returns its findings. Use this when a task requires deep exploration across many files or investigating complex modules. The sub-agent has its own context window so it won't clutter the main conversation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "A detailed description of the research task for the sub-agent. Be specific about what to investigate and what kind of answer you expect."
                    },
                    "max_turns": {
                        "type": "number",
                        "description": "Maximum number of agentic loop iterations (default: 10, max: 20). Use higher values for complex exploration tasks."
                    }
                },
                "required": ["task"]
            }
        }
    })
}
