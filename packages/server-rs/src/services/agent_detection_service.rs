use std::path::PathBuf;
use std::time::{Duration, Instant};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Cache TTL for agent detection results (5 minutes).
const CACHE_TTL: Duration = Duration::from_secs(300);

/// Timeout for individual CLI detection commands.
const DETECTION_TIMEOUT: Duration = Duration::from_secs(5);

/// A model available for a detected agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentModel {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// A detected CLI agent with installation and authentication status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedAgent {
    /// Agent type identifier (e.g., "claude-code", "codex").
    pub id: String,
    /// Human-friendly display name.
    pub name: String,
    /// Version string from `--version`, if available.
    pub version: Option<String>,
    /// Whether the CLI binary was found on PATH.
    pub installed: bool,
    /// Whether the agent appears to be authenticated.
    pub authenticated: bool,
    /// Available models for this agent.
    pub models: Vec<AgentModel>,
}

/// Configuration for a single CLI agent detection.
struct CLIConfig {
    id: &'static str,
    name: &'static str,
    command: &'static str,
    version_args: &'static [&'static str],
    models: Vec<AgentModel>,
    /// Primary login file relative to home directory.
    login_file: Option<&'static str>,
    /// Fallback indicator files relative to home directory.
    install_indicator_files: &'static [&'static str],
    /// Environment variables that indicate authentication.
    auth_env_vars: &'static [&'static str],
}

/// Returns the detection configurations for all supported agents.
fn get_cli_configs() -> Vec<CLIConfig> {
    vec![
        CLIConfig {
            id: "claude-code",
            name: "Claude Code",
            command: "claude",
            version_args: &["--version"],
            models: vec![
                AgentModel {
                    id: "claude-opus-4-6".into(),
                    name: "Claude Opus 4.6".into(),
                    description: Some("Most intelligent -- complex tasks & agents".into()),
                },
                AgentModel {
                    id: "claude-sonnet-4-6".into(),
                    name: "Claude Sonnet 4.6".into(),
                    description: Some("Latest -- best speed/intelligence balance".into()),
                },
                AgentModel {
                    id: "claude-sonnet-4-5-20250929".into(),
                    name: "Claude Sonnet 4.5".into(),
                    description: Some("Best speed/intelligence balance".into()),
                },
                AgentModel {
                    id: "claude-haiku-4-5-20251001".into(),
                    name: "Claude Haiku 4.5".into(),
                    description: Some("Fastest -- near-frontier intelligence".into()),
                },
            ],
            login_file: Some(".claude.json"),
            install_indicator_files: &[".claude/.credentials.json", ".claude/credentials.json"],
            auth_env_vars: &["ANTHROPIC_API_KEY"],
        },
        CLIConfig {
            id: "codex",
            name: "Codex",
            command: "codex",
            version_args: &["--version"],
            models: vec![
                AgentModel {
                    id: "gpt-5.3-codex".into(),
                    name: "GPT-5.3 Codex".into(),
                    description: Some("Most capable -- frontier coding + reasoning".into()),
                },
                AgentModel {
                    id: "gpt-5.2-codex".into(),
                    name: "GPT-5.2 Codex".into(),
                    description: Some("Advanced agentic coding model".into()),
                },
                AgentModel {
                    id: "gpt-5.1-codex-max".into(),
                    name: "GPT-5.1 Codex Max".into(),
                    description: Some("Long-horizon agentic coding".into()),
                },
                AgentModel {
                    id: "gpt-5.2".into(),
                    name: "GPT-5.2".into(),
                    description: Some("Best general agentic model".into()),
                },
                AgentModel {
                    id: "gpt-5.1-codex-mini".into(),
                    name: "GPT-5.1 Codex Mini".into(),
                    description: Some("Cost-effective, smaller model".into()),
                },
            ],
            login_file: Some(".codex/auth.json"),
            install_indicator_files: &[".codex/version.json", ".codex/config.toml"],
            auth_env_vars: &["OPENAI_API_KEY"],
        },
        CLIConfig {
            id: "gemini",
            name: "Gemini",
            command: "gemini",
            version_args: &["--version"],
            models: vec![
                AgentModel {
                    id: "gemini-3.1-pro-preview".into(),
                    name: "Gemini 3.1 Pro".into(),
                    description: Some("Most advanced -- complex tasks & agentic coding".into()),
                },
                AgentModel {
                    id: "gemini-3-pro-preview".into(),
                    name: "Gemini 3 Pro".into(),
                    description: Some("Best multimodal understanding".into()),
                },
                AgentModel {
                    id: "gemini-3-flash-preview".into(),
                    name: "Gemini 3 Flash".into(),
                    description: Some("Balanced speed & performance".into()),
                },
                AgentModel {
                    id: "gemini-2.5-pro".into(),
                    name: "Gemini 2.5 Pro".into(),
                    description: Some("Frontier thinking model (stable)".into()),
                },
                AgentModel {
                    id: "gemini-2.5-flash".into(),
                    name: "Gemini 2.5 Flash".into(),
                    description: Some("Best price-performance (stable)".into()),
                },
                AgentModel {
                    id: "gemini-2.5-flash-lite".into(),
                    name: "Gemini 2.5 Flash Lite".into(),
                    description: Some("Lightweight and fast".into()),
                },
            ],
            login_file: Some(".gemini/oauth_creds.json"),
            install_indicator_files: &[".gemini/settings.json", ".gemini/installation_id"],
            auth_env_vars: &["GOOGLE_API_KEY", "GEMINI_API_KEY"],
        },
        CLIConfig {
            id: "copilot",
            name: "GitHub Copilot",
            command: "copilot",
            version_args: &["--version"],
            models: vec![
                AgentModel {
                    id: "gpt-5.1-codex".into(),
                    name: "GPT-5.1 Codex".into(),
                    description: Some("Default Codex model".into()),
                },
                AgentModel {
                    id: "gpt-5.2-codex".into(),
                    name: "GPT-5.2 Codex".into(),
                    description: Some("Advanced agentic coding".into()),
                },
                AgentModel {
                    id: "claude-sonnet-4-6".into(),
                    name: "Claude Sonnet 4.6".into(),
                    description: Some("Anthropic Sonnet 4.6".into()),
                },
                AgentModel {
                    id: "claude-opus-4-6".into(),
                    name: "Claude Opus 4.6".into(),
                    description: Some("Anthropic Opus 4.6".into()),
                },
                AgentModel {
                    id: "gemini-2.5-pro".into(),
                    name: "Gemini 2.5 Pro".into(),
                    description: Some("Google Gemini 2.5 Pro".into()),
                },
            ],
            login_file: None,
            install_indicator_files: &[],
            auth_env_vars: &[],
        },
    ]
}

/// Finds the executable path for a given command.
///
/// Uses `where` on Windows, `which` on Unix.
async fn find_executable(command: &str) -> Option<String> {
    let lookup = if cfg!(windows) { "where" } else { "which" };

    let output = tokio::time::timeout(DETECTION_TIMEOUT, async {
        Command::new(lookup)
            .arg(command)
            .output()
            .await
    })
    .await
    .ok()?
    .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .next()
        .map(|l| l.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Gets the version string from a CLI tool.
async fn get_version(exec_path: &str, args: &[&str]) -> Option<String> {
    let output = tokio::time::timeout(DETECTION_TIMEOUT, async {
        let mut cmd = Command::new(exec_path);
        cmd.args(args);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000_u32); // CREATE_NO_WINDOW
        cmd.output().await
    })
    .await
    .ok()?
    .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .next()
        .map(|l| l.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Resolves a credential path relative to the home directory.
fn resolve_home_path(rel_path: &str) -> Option<PathBuf> {
    dirs_home().map(|home| home.join(rel_path))
}

/// Returns the user's home directory.
fn dirs_home() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE")
            .ok()
            .map(PathBuf::from)
            .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

/// Checks if a file exists.
fn file_exists(path: &PathBuf) -> bool {
    path.exists() && path.is_file()
}

/// Fast auth check: looks for login files, install indicators, or env vars.
///
/// Mirrors the TypeScript detection strategy:
/// 1. Check env vars (instant)
/// 2. Check primary login file (e.g., ~/.claude.json)
/// 3. Fall back to install indicator files
fn check_auth_fast(config: &CLIConfig) -> bool {
    // 1. Check environment variables first (instant)
    for env_var in config.auth_env_vars {
        if std::env::var(env_var).ok().filter(|v| !v.is_empty()).is_some() {
            debug!(agent = config.id, env_var, "Auth detected via env var");
            return true;
        }
    }

    // 2. Check primary login file
    if let Some(login_file) = config.login_file {
        if let Some(path) = resolve_home_path(login_file) {
            if file_exists(&path) {
                debug!(agent = config.id, path = %path.display(), "Auth detected via login file");
                return true;
            }
        }
    }

    // 3. Check install indicator files
    for indicator in config.install_indicator_files {
        if let Some(path) = resolve_home_path(indicator) {
            if file_exists(&path) {
                debug!(agent = config.id, path = %path.display(), "Auth detected via install indicator");
                return true;
            }
        }
    }

    false
}

/// Detects a single agent by its configuration.
async fn detect_single_agent(config: &CLIConfig) -> DetectedAgent {
    debug!(agent = config.id, command = config.command, "Detecting agent");

    let exec_path = match find_executable(config.command).await {
        Some(path) => path,
        None => {
            debug!(agent = config.id, "Agent not found on PATH");
            return DetectedAgent {
                id: config.id.to_string(),
                name: config.name.to_string(),
                version: None,
                installed: false,
                authenticated: false,
                models: vec![],
            };
        }
    };

    debug!(agent = config.id, exec_path = %exec_path, "Agent found");

    // Run version check and auth check in parallel
    let version_future = get_version(&exec_path, config.version_args);
    let authenticated = check_auth_fast(config);

    let version = version_future.await;

    debug!(
        agent = config.id,
        ?version,
        authenticated,
        model_count = config.models.len(),
        "Agent detection complete"
    );

    DetectedAgent {
        id: config.id.to_string(),
        name: config.name.to_string(),
        version,
        installed: true,
        authenticated,
        models: config.models.clone(),
    }
}

/// Global cache for agent detection results.
static CACHE: std::sync::LazyLock<RwLock<Option<(Vec<DetectedAgent>, Instant)>>> =
    std::sync::LazyLock::new(|| RwLock::new(None));

/// Detects all installed coding CLI agents plus API-based agents (OpenRouter).
///
/// Results are cached for 5 minutes. All agents are detected in parallel.
/// If `db` is provided, OpenRouter authentication and models are checked.
pub async fn detect_installed_agents(db: Option<&crate::db::Database>) -> Vec<DetectedAgent> {
    // Check cache
    {
        let cache = CACHE.read().await;
        if let Some((agents, timestamp)) = cache.as_ref() {
            if timestamp.elapsed() < CACHE_TTL {
                debug!("Returning cached agent detection results");
                return agents.clone();
            }
        }
    }

    info!("Detecting installed agents");

    let configs = get_cli_configs();

    // Detect CLI agents in parallel
    let futures: Vec<_> = configs.iter().map(|c| detect_single_agent(c)).collect();
    let mut agents = futures::future::join_all(futures).await;

    // Detect API-based agents (always "installed")
    let openrouter_agent = detect_openrouter(db).await;
    agents.push(openrouter_agent);

    let minimax_agent = detect_minimax(db).await;
    agents.push(minimax_agent);

    // Update cache
    {
        let mut cache = CACHE.write().await;
        *cache = Some((agents.clone(), Instant::now()));
    }

    let installed: Vec<_> = agents.iter().filter(|a| a.installed).collect();
    info!(
        total = agents.len(),
        installed = installed.len(),
        names = ?installed.iter().map(|a| &a.name).collect::<Vec<_>>(),
        "Agent detection complete"
    );

    agents
}

/// Detects a single agent by its type identifier.
pub async fn detect_agent(agent_type: &str) -> DetectedAgent {
    let configs = get_cli_configs();
    if let Some(config) = configs.iter().find(|c| c.id == agent_type) {
        detect_single_agent(config).await
    } else {
        DetectedAgent {
            id: agent_type.to_string(),
            name: agent_type.to_string(),
            version: None,
            installed: false,
            authenticated: false,
            models: vec![],
        }
    }
}

/// Clears the agent detection cache, forcing re-detection on next call.
pub async fn clear_agent_cache() {
    let mut cache = CACHE.write().await;
    *cache = None;
    debug!("Agent detection cache cleared");
}

// ============================================================================
// OpenRouter Detection
// ============================================================================

const OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";

/// Detects OpenRouter as an API-based agent.
///
/// OpenRouter is always "installed" (it's API-based, not a CLI tool).
/// Authentication is determined by whether a stored API key exists.
/// Models are fetched from the OpenRouter API when credentials are available.
async fn detect_openrouter(db: Option<&crate::db::Database>) -> DetectedAgent {
    let mut authenticated = false;
    let mut models: Vec<AgentModel> = vec![];

    if let Some(db) = db {
        // Check if OpenRouter API key exists
        match db
            .call(|conn| {
                let has_key = crate::services::secrets_service::has_secret(
                    conn,
                    "ai_api_key",
                    Some("openrouter"),
                )?;
                if !has_key {
                    return Ok((false, None));
                }
                let api_key = crate::services::secrets_service::get_secret(
                    conn,
                    "ai_api_key",
                    Some("openrouter"),
                )?;
                Ok((true, api_key))
            })
            .await
        {
            Ok((has_key, api_key_opt)) => {
                authenticated = has_key;
                if let Some(api_key) = api_key_opt {
                    models = fetch_openrouter_agent_models(&api_key).await;
                }

                // Fallback: if API fetch returned no models, try to get model from secret metadata
                if models.is_empty() && authenticated {
                    if let Ok(fallback) = db
                        .call(|conn| get_openrouter_model_from_metadata(conn))
                        .await
                    {
                        models = fallback;
                    }
                }
            }
            Err(e) => {
                warn!(error = %e, "Failed to check OpenRouter credentials");
            }
        }
    }

    DetectedAgent {
        id: "openrouter".to_string(),
        name: "OpenRouter".to_string(),
        installed: true, // Always true — API based
        version: None,
        authenticated,
        models,
    }
}

/// Fetches models from the OpenRouter API and maps them to AgentModel format.
async fn fetch_openrouter_agent_models(api_key: &str) -> Vec<AgentModel> {
    #[derive(serde::Deserialize)]
    struct OpenRouterAPIModel {
        id: String,
        name: String,
        pricing: Option<OpenRouterPricing>,
        supported_parameters: Option<Vec<String>>,
    }

    #[derive(serde::Deserialize)]
    struct OpenRouterPricing {
        prompt: String,
        completion: String,
    }

    #[derive(serde::Deserialize)]
    struct ModelsResponse {
        data: Vec<OpenRouterAPIModel>,
    }

    let client = reqwest::Client::new();
    let resp = match client
        .get(format!("{OPENROUTER_BASE_URL}/models?supported_parameters=tools"))
        .header("Authorization", format!("Bearer {api_key}"))
        .header("HTTP-Referer", "https://dash-agent.local")
        .header("X-Title", "dash-agent")
        .timeout(Duration::from_secs(10))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(error = %e, "Failed to fetch OpenRouter models");
            return vec![];
        }
    };

    if !resp.status().is_success() {
        warn!(status = %resp.status(), "OpenRouter API returned non-success status");
        return vec![];
    }

    let data: ModelsResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            warn!(error = %e, "Failed to parse OpenRouter models response");
            return vec![];
        }
    };

    data.data
        .into_iter()
        .filter(|m| {
            m.supported_parameters
                .as_ref()
                .map_or(true, |params| params.iter().any(|p| p == "tools"))
        })
        .map(|m| {
            let is_free = m.pricing.as_ref().map_or(false, |p| {
                p.prompt.parse::<f64>().unwrap_or(1.0) == 0.0
                    && p.completion.parse::<f64>().unwrap_or(1.0) == 0.0
            });
            AgentModel {
                id: m.id,
                name: m.name,
                description: if is_free {
                    Some("Free".to_string())
                } else {
                    None
                },
            }
        })
        .collect()
}

// ============================================================================
// MiniMax Detection
// ============================================================================

/// Detects MiniMax as an API-based agent.
///
/// MiniMax is always "installed" (it's API-based, not a CLI tool).
/// Authentication is determined by whether a stored API key exists.
async fn detect_minimax(db: Option<&crate::db::Database>) -> DetectedAgent {
    let mut authenticated = false;

    if let Some(db) = db {
        match db
            .call(|conn| {
                crate::services::secrets_service::has_secret(conn, "ai_api_key", Some("minimax"))
            })
            .await
        {
            Ok(has_key) => {
                authenticated = has_key;
            }
            Err(e) => {
                warn!(error = %e, "Failed to check MiniMax credentials");
            }
        }
    }

    DetectedAgent {
        id: "minimax".to_string(),
        name: "MiniMax".to_string(),
        installed: true, // Always true — API based
        version: None,
        authenticated,
        models: vec![
            AgentModel {
                id: "MiniMax-M2.5".into(),
                name: "MiniMax M2.5".into(),
                description: Some("Peak performance, ultimate value (~60 tps)".into()),
            },
            AgentModel {
                id: "MiniMax-M2.5-highspeed".into(),
                name: "MiniMax M2.5 Highspeed".into(),
                description: Some("Same performance, faster and more agile (~100 tps)".into()),
            },
            AgentModel {
                id: "MiniMax-M2.1".into(),
                name: "MiniMax M2.1".into(),
                description: Some("Powerful multi-language programming (~60 tps)".into()),
            },
            AgentModel {
                id: "MiniMax-M2.1-highspeed".into(),
                name: "MiniMax M2.1 Highspeed".into(),
                description: Some("Faster and more agile (~100 tps)".into()),
            },
            AgentModel {
                id: "MiniMax-M2".into(),
                name: "MiniMax M2".into(),
                description: Some("Agentic capabilities, advanced reasoning".into()),
            },
        ],
    }
}

/// Fallback: reads the model from the OpenRouter secret metadata.
fn get_openrouter_model_from_metadata(conn: &Connection) -> Result<Vec<AgentModel>, crate::error::AppError> {
    let meta_str = crate::services::secrets_service::get_secret_metadata(
        conn,
        "ai_api_key",
        Some("openrouter"),
    )?;

    if let Some(meta_str) = meta_str {
        // metadata is stored as a JSON string
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&meta_str) {
            let metadata = parsed.as_object().or_else(|| {
                parsed.get("metadata").and_then(|m| m.as_object())
            });

            if let Some(metadata) = metadata {
                let model_id = metadata.get("model").and_then(|v| v.as_str());
                let model_name = metadata
                    .get("modelName")
                    .and_then(|v| v.as_str())
                    .or(model_id);
                let model_desc = metadata.get("modelDescription").and_then(|v| v.as_str());

                if let (Some(id), Some(name)) = (model_id, model_name) {
                    return Ok(vec![AgentModel {
                        id: id.to_string(),
                        name: name.to_string(),
                        description: model_desc.map(|s| s.to_string()),
                    }]);
                }
            }
        }
    }

    Ok(vec![])
}
