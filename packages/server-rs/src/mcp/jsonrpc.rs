//! JSON-RPC 2.0 types for the MCP protocol.
//!
//! Implements the core request/response/error types per the JSON-RPC 2.0 specification.
//! Standard error codes follow the spec plus MCP-specific additions.

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ============================================================================
// Standard JSON-RPC 2.0 error codes
// ============================================================================

/// Parse error: Invalid JSON was received by the server.
pub const PARSE_ERROR: i32 = -32700;
/// Invalid Request: The JSON sent is not a valid Request object.
pub const INVALID_REQUEST: i32 = -32600;
/// Method not found: The method does not exist / is not available.
pub const METHOD_NOT_FOUND: i32 = -32601;
/// Invalid params: Invalid method parameter(s).
pub const INVALID_PARAMS: i32 = -32602;
/// Internal error: Internal JSON-RPC error.
pub const INTERNAL_ERROR: i32 = -32603;

// ============================================================================
// Request
// ============================================================================

/// A JSON-RPC 2.0 request object.
#[derive(Debug, Deserialize)]
pub struct JsonRpcRequest {
    /// Must be "2.0".
    pub jsonrpc: String,
    /// The method to invoke.
    pub method: String,
    /// Optional parameters for the method.
    pub params: Option<Value>,
    /// Request identifier. `None` for notifications.
    pub id: Option<Value>,
}

// ============================================================================
// Response
// ============================================================================

/// A JSON-RPC 2.0 response object.
#[derive(Debug, Serialize)]
pub struct JsonRpcResponse {
    /// Always "2.0".
    pub jsonrpc: String,
    /// The result on success.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// The error on failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    /// The request id (echoed back).
    pub id: Option<Value>,
}

impl JsonRpcResponse {
    /// Creates a successful response.
    pub fn success(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: Some(result),
            error: None,
            id,
        }
    }

    /// Creates an error response.
    pub fn error(id: Option<Value>, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.into(),
                data: None,
            }),
            id,
        }
    }

    /// Creates an error response with additional data.
    pub fn error_with_data(
        id: Option<Value>,
        code: i32,
        message: impl Into<String>,
        data: Value,
    ) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.into(),
                data: Some(data),
            }),
            id,
        }
    }

    /// Creates a "method not found" error response.
    pub fn method_not_found(id: Option<Value>) -> Self {
        Self::error(id, METHOD_NOT_FOUND, "Method not found")
    }

    /// Creates an "invalid params" error response.
    pub fn invalid_params(id: Option<Value>, message: impl Into<String>) -> Self {
        Self::error(id, INVALID_PARAMS, message)
    }

    /// Creates an "internal error" response.
    pub fn internal_error(id: Option<Value>, message: impl Into<String>) -> Self {
        Self::error(id, INTERNAL_ERROR, message)
    }
}

// ============================================================================
// Error
// ============================================================================

/// A JSON-RPC 2.0 error object.
#[derive(Debug, Serialize)]
pub struct JsonRpcError {
    /// A Number that indicates the error type that occurred.
    pub code: i32,
    /// A short description of the error.
    pub message: String,
    /// Additional information about the error.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_success_response_serialization() {
        let resp = JsonRpcResponse::success(Some(json!(1)), json!({"status": "ok"}));
        let json_str = serde_json::to_string(&resp).unwrap();
        let v: Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(v["jsonrpc"], "2.0");
        assert_eq!(v["result"]["status"], "ok");
        assert_eq!(v["id"], 1);
        assert!(v.get("error").is_none());
    }

    #[test]
    fn test_error_response_serialization() {
        let resp = JsonRpcResponse::error(Some(json!(2)), METHOD_NOT_FOUND, "Method not found");
        let json_str = serde_json::to_string(&resp).unwrap();
        let v: Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(v["error"]["code"], -32601);
        assert_eq!(v["error"]["message"], "Method not found");
        assert!(v.get("result").is_none());
    }

    #[test]
    fn test_method_not_found_helper() {
        let resp = JsonRpcResponse::method_not_found(Some(json!("abc")));
        assert_eq!(resp.error.as_ref().unwrap().code, METHOD_NOT_FOUND);
        assert_eq!(resp.id, Some(json!("abc")));
    }

    #[test]
    fn test_request_deserialization() {
        let raw = r#"{"jsonrpc":"2.0","method":"tools/list","id":1}"#;
        let req: JsonRpcRequest = serde_json::from_str(raw).unwrap();
        assert_eq!(req.method, "tools/list");
        assert!(req.params.is_none());
        assert_eq!(req.id, Some(json!(1)));
    }

    #[test]
    fn test_notification_deserialization() {
        let raw = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
        let req: JsonRpcRequest = serde_json::from_str(raw).unwrap();
        assert_eq!(req.method, "notifications/initialized");
        assert!(req.id.is_none());
    }
}
