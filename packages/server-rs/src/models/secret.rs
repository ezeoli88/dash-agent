use serde::{Deserialize, Serialize};

/// Types of secrets that can be stored in the `user_secrets` table.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SecretKeyType {
    #[serde(rename = "ai_api_key")]
    AiApiKey,
    #[serde(rename = "github_token")]
    GithubToken,
    #[serde(rename = "gitlab_token")]
    GitlabToken,
}

impl SecretKeyType {
    /// Returns the string representation matching the database value.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AiApiKey => "ai_api_key",
            Self::GithubToken => "github_token",
            Self::GitlabToken => "gitlab_token",
        }
    }
}

impl std::fmt::Display for SecretKeyType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for SecretKeyType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "ai_api_key" => Ok(Self::AiApiKey),
            "github_token" => Ok(Self::GithubToken),
            "gitlab_token" => Ok(Self::GitlabToken),
            other => Err(format!("unknown secret key type: '{other}'")),
        }
    }
}

/// A record from the `user_secrets` table.
///
/// The `encrypted_value` field stores the AES-GCM encrypted secret.
/// The `metadata` field is an optional JSON string with extra info
/// (e.g., username, avatar URL for GitHub tokens).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretRecord {
    /// Unique identifier (UUID).
    pub id: String,
    /// Type of secret (ai_api_key, github_token, gitlab_token).
    pub key_type: SecretKeyType,
    /// AI provider name (e.g., "claude", "openai", "openrouter") or NULL for non-AI secrets.
    pub provider: Option<String>,
    /// AES-GCM encrypted value (hex-encoded).
    pub encrypted_value: String,
    /// Optional JSON metadata (e.g., {"username": "...", "avatarUrl": "..."}).
    pub metadata: Option<String>,
    /// ISO timestamp when the record was created.
    pub created_at: String,
    /// ISO timestamp when the record was last updated.
    pub updated_at: String,
}
