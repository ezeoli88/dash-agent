use serde::{Deserialize, Serialize};

/// Known setting keys stored in the `settings` key-value table.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SettingKey {
    #[serde(rename = "default_agent_type")]
    DefaultAgentType,
    #[serde(rename = "default_agent_model")]
    DefaultAgentModel,
}

impl SettingKey {
    /// Returns the string representation matching the database key.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::DefaultAgentType => "default_agent_type",
            Self::DefaultAgentModel => "default_agent_model",
        }
    }
}

impl std::fmt::Display for SettingKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for SettingKey {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "default_agent_type" => Ok(Self::DefaultAgentType),
            "default_agent_model" => Ok(Self::DefaultAgentModel),
            other => Err(format!("unknown setting key: '{other}'")),
        }
    }
}

/// A key-value setting from the `settings` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    /// The setting key.
    pub key: SettingKey,
    /// The setting value (always stored as a string).
    pub value: String,
    /// ISO timestamp when the setting was last updated.
    pub updated_at: String,
}
