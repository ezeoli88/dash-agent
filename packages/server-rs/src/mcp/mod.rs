//! MCP (Model Context Protocol) implementation over JSON-RPC 2.0.
//!
//! This module provides a stateless MCP server that handles tool calls and
//! resource reads via a single HTTP POST endpoint. Each request creates a
//! fresh [`McpServer`] instance, dispatches the JSON-RPC request, and returns
//! the response.
//!
//! # Sub-modules
//!
//! - [`jsonrpc`] - JSON-RPC 2.0 request/response/error types
//! - [`server`] - McpServer dispatcher
//! - [`tools`] - MCP tool definitions and handlers
//! - [`resources`] - MCP resource templates and read handlers

pub mod jsonrpc;
pub mod resources;
pub mod server;
pub mod tools;

use axum::{extract::State, Json};
use tracing::debug;

use crate::AppState;
use jsonrpc::{JsonRpcRequest, JsonRpcResponse};
use server::McpServer;

/// Axum handler for `POST /api/mcp`.
///
/// Accepts a JSON-RPC 2.0 request body, dispatches it through the MCP server,
/// and returns the JSON-RPC response.
pub async fn mcp_handler(
    State(state): State<AppState>,
    Json(req): Json<JsonRpcRequest>,
) -> Json<JsonRpcResponse> {
    debug!(method = %req.method, "MCP request received");
    let server = McpServer::new(&state);
    Json(server.dispatch(req).await)
}
