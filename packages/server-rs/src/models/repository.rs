use serde::{Deserialize, Serialize};

/// Detected technology stack from analyzing a repository.
///
/// Stored as a JSON string in the `detected_stack` column of the
/// `repositories` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedStack {
    pub framework: Option<String>,
    pub state_management: Option<String>,
    pub styling: Option<String>,
    pub testing: Option<String>,
}

impl Default for DetectedStack {
    fn default() -> Self {
        Self {
            framework: None,
            state_management: None,
            styling: None,
            testing: None,
        }
    }
}

/// A pattern learned by the agent from user feedback.
///
/// Stored as a JSON array in the `learned_patterns` column of the
/// `repositories` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearnedPattern {
    pub id: String,
    pub pattern: String,
    pub learned_from_task_id: String,
    pub created_at: String,
}

/// A repository registered in the dashboard.
///
/// Maps 1:1 to the `repositories` SQLite table. The `detected_stack` column
/// stores a JSON object and `learned_patterns` stores a JSON array.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    /// Unique identifier (UUID).
    pub id: String,
    /// Repository display name (e.g., "ezeoli88/dash-agent").
    pub name: String,
    /// Repository URL (e.g., "https://github.com/...").
    pub url: String,
    /// Default branch name (e.g., "main").
    pub default_branch: String,
    /// Detected technology stack (JSON object in DB).
    pub detected_stack: DetectedStack,
    /// Markdown conventions editable by the user.
    pub conventions: String,
    /// Patterns learned from user feedback (JSON array in DB).
    pub learned_patterns: Vec<LearnedPattern>,
    /// Count of active tasks linked to this repository (computed, not stored).
    #[serde(default)]
    pub active_tasks_count: i64,
    /// ISO timestamp when the repository was created.
    pub created_at: String,
    /// ISO timestamp when the repository was last updated.
    pub updated_at: String,
}

/// Input for creating a new repository.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRepositoryInput {
    /// Repository display name (required).
    pub name: String,
    /// Repository URL (required, must be valid URL).
    pub url: String,
    /// Default branch (defaults to "main" if not provided).
    #[serde(default = "default_branch")]
    pub default_branch: String,
}

fn default_branch() -> String {
    "main".to_string()
}

/// Input for updating an existing repository. All fields are optional.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdateRepositoryInput {
    pub default_branch: Option<String>,
    pub conventions: Option<String>,
}
