//! Setup and configuration routes.
//!
//! Provides endpoints for initial application setup: agent detection, settings,
//! AI key validation, GitHub OAuth, and MCP configuration.
//!
//! ## Endpoints
//!
//! - `GET /api/setup/agents` - Detect installed coding CLI agents (stub)
//! - `GET /api/setup/settings` - Get application settings
//! - `PATCH /api/setup/settings` - Update application settings
//! - `POST /api/setup/validate-ai-key` - Validate an AI provider API key (stub)
//! - `POST /api/setup/validate-openrouter-key` - Validate an OpenRouter key (stub)
//! - `GET /api/setup/openrouter-models` - Get available OpenRouter models (stub)
//! - `GET /api/setup/github/auth` - Get GitHub OAuth authorization URL (stub)
//! - `POST /api/setup/github/callback` - Handle GitHub OAuth callback (stub)
//! - `GET /api/setup/status` - Get current setup status
//! - `DELETE /api/setup/ai-provider` - Disconnect AI provider
//! - `DELETE /api/setup/github` - Disconnect GitHub
//! - `GET /api/setup/mcp-config` - Get MCP server configuration

use axum::{
    extract::State,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tracing::info;

use crate::error::AppError;
use crate::services::settings_service;
use crate::AppState;

// ============================================================================
// Request/Response Types
// ============================================================================

/// PATCH /setup/settings request body.
#[derive(Debug, Deserialize)]
struct UpdateSettingsRequest {
    default_agent_type: Option<serde_json::Value>,
    default_agent_model: Option<serde_json::Value>,
}

/// Valid agent types.
const VALID_AGENT_TYPES: &[&str] = &[
    "claude-code",
    "codex",
    "gemini",
    "copilot",
    "openrouter",
];

/// POST /setup/validate-ai-key request body.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ValidateAIKeyRequest {
    provider: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
}

// ============================================================================
// Router
// ============================================================================

/// Builds the setup routes sub-router.
pub fn router() -> Router<AppState> {
    Router::new()
        // Agent detection
        .route("/agents", get(get_agents))
        // Settings
        .route("/settings", get(get_settings))
        .route("/settings", patch(update_settings))
        // AI key validation
        .route("/validate-ai-key", post(validate_ai_key))
        .route("/validate-openrouter-key", post(validate_openrouter_key))
        .route("/openrouter-models", get(get_openrouter_models))
        // GitHub OAuth
        .route("/github/auth", get(get_github_auth))
        .route("/github/callback", post(github_callback))
        // Status
        .route("/status", get(get_status))
        // Disconnect
        .route("/ai-provider", delete(delete_ai_provider))
        .route("/github", delete(delete_github))
        // MCP config
        .route("/mcp-config", get(get_mcp_config))
}

// ============================================================================
// Agent Detection Handlers
// ============================================================================

/// GET /api/setup/agents
///
/// Returns detected installed coding CLI agents.
async fn get_agents() -> Result<impl IntoResponse, AppError> {
    info!("GET /setup/agents");

    let agents = crate::services::agent_detection_service::detect_installed_agents().await;

    info!(count = agents.len(), "Agents detected");
    Ok(Json(json!({ "agents": agents })))
}

// ============================================================================
// Settings Handlers
// ============================================================================

/// GET /api/setup/settings
///
/// Returns the current application settings (default agent type and model).
async fn get_settings(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    info!("GET /setup/settings");

    let (agent_type, agent_model) = state
        .db
        .call(|conn| settings_service::get_default_agent(conn))
        .await?;

    Ok(Json(json!({
        "default_agent_type": agent_type,
        "default_agent_model": agent_model,
    })))
}

/// PATCH /api/setup/settings
///
/// Updates application settings. Supports partial updates: only provided
/// fields are modified. Sending `null` for a field deletes it.
async fn update_settings(
    State(state): State<AppState>,
    Json(body): Json<UpdateSettingsRequest>,
) -> Result<impl IntoResponse, AppError> {
    info!("PATCH /setup/settings");

    // Process default_agent_type
    if let Some(ref val) = body.default_agent_type {
        if val.is_null() {
            state
                .db
                .call(|conn| settings_service::delete_setting(conn, "default_agent_type"))
                .await?;
        } else if let Some(s) = val.as_str() {
            if !VALID_AGENT_TYPES.contains(&s) {
                return Err(AppError::Validation(format!(
                    "Invalid agent type: '{}'. Valid types: {:?}",
                    s, VALID_AGENT_TYPES
                )));
            }
            let agent_type = s.to_string();
            state
                .db
                .call(move |conn| settings_service::set_setting(conn, "default_agent_type", &agent_type))
                .await?;
        } else {
            return Err(AppError::Validation(
                "default_agent_type must be a string or null".to_string(),
            ));
        }
    }

    // Process default_agent_model
    if let Some(ref val) = body.default_agent_model {
        if val.is_null() {
            state
                .db
                .call(|conn| settings_service::delete_setting(conn, "default_agent_model"))
                .await?;
        } else if let Some(s) = val.as_str() {
            let agent_model = s.to_string();
            state
                .db
                .call(move |conn| settings_service::set_setting(conn, "default_agent_model", &agent_model))
                .await?;
        } else {
            return Err(AppError::Validation(
                "default_agent_model must be a string or null".to_string(),
            ));
        }
    }

    // Return current settings
    let (agent_type, agent_model) = state
        .db
        .call(|conn| settings_service::get_default_agent(conn))
        .await?;

    Ok(Json(json!({
        "success": true,
        "settings": {
            "default_agent_type": agent_type,
            "default_agent_model": agent_model,
        }
    })))
}

// ============================================================================
// AI Validation Handlers (Stubs)
// ============================================================================

/// POST /api/setup/validate-ai-key
///
/// Validates an AI provider API key. Currently a stub.
/// Full implementation will call provider APIs to verify keys.
async fn validate_ai_key(
    Json(body): Json<ValidateAIKeyRequest>,
) -> Result<impl IntoResponse, AppError> {
    info!(provider = ?body.provider, "POST /setup/validate-ai-key (stub)");

    // Stub: AI key validation requires provider-specific API calls.
    // This will be implemented when the AI provider service is ported.
    Ok(Json(json!({
        "valid": false,
        "provider": body.provider,
        "error": "AI key validation not implemented yet in Rust server",
    })))
}

/// POST /api/setup/validate-openrouter-key
///
/// Validates an OpenRouter API key. Currently a stub.
async fn validate_openrouter_key() -> Result<impl IntoResponse, AppError> {
    info!("POST /setup/validate-openrouter-key (stub)");

    Ok(Json(json!({
        "valid": false,
        "error": "OpenRouter key validation not implemented yet in Rust server",
    })))
}

/// GET /api/setup/openrouter-models
///
/// Returns available OpenRouter models. Currently a stub.
async fn get_openrouter_models() -> Result<impl IntoResponse, AppError> {
    info!("GET /setup/openrouter-models (stub)");

    Ok(Json(json!({
        "models": [],
        "freeModels": [],
    })))
}

// ============================================================================
// GitHub OAuth Handlers (Stubs)
// ============================================================================

/// GET /api/setup/github/auth
///
/// Returns a GitHub OAuth authorization URL.
/// Currently a stub since OAuth is not yet configured in the Rust server.
async fn get_github_auth() -> Result<impl IntoResponse, AppError> {
    info!("GET /setup/github/auth (stub)");

    Ok(Json(json!({
        "authUrl": "http://localhost:3003/setup/github/callback?code=demo&state=demo-state",
        "state": "demo-state",
        "configured": false,
    })))
}

/// POST /api/setup/github/callback
///
/// Handles the GitHub OAuth callback. Currently a stub.
async fn github_callback() -> Result<Json<serde_json::Value>, AppError> {
    info!("POST /setup/github/callback (stub)");

    Err(AppError::Validation(
        "GitHub OAuth is not configured on this server".to_string(),
    ))
}

// ============================================================================
// Status Handlers
// ============================================================================

/// GET /api/setup/status
///
/// Returns the current server setup status.
async fn get_status() -> Result<impl IntoResponse, AppError> {
    info!("GET /setup/status");

    Ok(Json(json!({
        "serverConfigured": true,
        "githubOAuthConfigured": false,
    })))
}

/// DELETE /api/setup/ai-provider
///
/// Disconnects the AI provider. This is mainly a confirmation endpoint
/// since the actual config is stored in localStorage on the frontend.
async fn delete_ai_provider() -> Result<impl IntoResponse, AppError> {
    info!("DELETE /setup/ai-provider");

    Ok(Json(json!({
        "success": true,
        "message": "AI provider disconnected. Please clear your local storage.",
    })))
}

/// DELETE /api/setup/github
///
/// Disconnects GitHub. This is mainly a confirmation endpoint.
async fn delete_github() -> Result<impl IntoResponse, AppError> {
    info!("DELETE /setup/github");

    Ok(Json(json!({
        "success": true,
        "message": "GitHub disconnected. Please clear your local storage.",
    })))
}

// ============================================================================
// MCP Configuration Handler
// ============================================================================

/// GET /api/setup/mcp-config
///
/// Returns the MCP server configuration for IDE/CLI setup.
/// Provides the current server URL and port.
async fn get_mcp_config(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    info!("GET /setup/mcp-config");

    let port = state.config.port;
    // In production, the URL would be built from the request's host header.
    // For now, use localhost with the configured port.
    let url = format!("http://localhost:{port}/api/mcp");

    Ok(Json(json!({
        "url": url,
        "port": port,
    })))
}
