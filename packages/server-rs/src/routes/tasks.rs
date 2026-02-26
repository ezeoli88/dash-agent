//! Task management routes.
//!
//! Implements the full task CRUD plus lifecycle endpoints (execute, cancel,
//! approve, request-changes, etc.) mirroring the TypeScript server's
//! `routes/tasks.ts`.
//!
//! Several endpoints are stubs that return 202/501 because they depend on
//! subsystems not yet ported (Agent System = Phase 4, Git+PR = Phase 3).

use std::convert::Infallible;
use std::time::Duration;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tracing::{info, warn};

use crate::error::AppError;
use crate::models::task::{CreateTaskInput, TaskStatus, UpdateTaskInput};
use crate::services::task_service;
use crate::AppState;

// ============================================================================
// Query / body types
// ============================================================================

/// Query parameters for `GET /api/tasks`.
#[derive(Debug, Deserialize)]
struct ListTasksQuery {
    #[serde(default)]
    repository_id: Option<String>,
    #[serde(default)]
    repo_url: Option<String>,
}

/// Body for `POST /:id/request-changes`.
#[derive(Debug, Deserialize)]
struct RequestChangesBody {
    #[serde(default)]
    feedback: Option<String>,
}

// ============================================================================
// Router
// ============================================================================

/// Builds the tasks sub-router.
///
/// All paths are relative; the caller nests this under `/api/tasks`.
pub fn router() -> Router<AppState> {
    Router::new()
        // CRUD
        .route("/", post(create_task))
        .route("/", get(list_tasks))
        .route("/{id}", get(get_task))
        .route("/{id}", patch(update_task))
        .route("/{id}", delete(delete_task))
        // Lifecycle (stubs where noted)
        .route("/{id}/execute", post(execute_task_stub))
        .route("/{id}/feedback", post(feedback_stub))
        .route("/{id}/cancel", post(cancel_task))
        .route("/{id}/approve", post(approve_stub))
        .route("/{id}/request-changes", post(request_changes))
        .route("/{id}/approve-plan", post(approve_plan_stub))
        .route("/{id}/logs", get(task_logs_stream))
        .route("/{id}/changes", get(get_changes))
        .route("/{id}/pr-merged", post(pr_merged))
        .route("/{id}/pr-closed", post(pr_closed))
        .route("/{id}/start", post(start_stub))
        .route("/{id}/extend", post(extend_stub))
        .route("/{id}/cleanup-worktree", post(cleanup_worktree_stub))
        .route("/{id}/open-editor", post(open_editor_stub))
        .route("/{id}/resolve-conflicts", post(resolve_conflicts_stub))
        .route("/{id}/pr-comments", get(pr_comments_stub))
        // Deprecated (spec endpoints removed in favour of two-agent workflow)
        .route("/{id}/generate-spec", post(deprecated_gone))
        .route("/{id}/regenerate-spec", post(deprecated_gone))
        .route("/{id}/spec", patch(deprecated_gone))
        .route("/{id}/approve-spec", post(deprecated_gone))
}

// ============================================================================
// CRUD handlers
// ============================================================================

/// POST /api/tasks - Create a new task.
async fn create_task(
    State(state): State<AppState>,
    Json(input): Json<CreateTaskInput>,
) -> Result<impl IntoResponse, AppError> {
    info!(
        repository_id = %input.repository_id,
        user_input = %input.user_input,
        "POST /tasks"
    );

    let service_input: task_service::CreateTaskServiceInput = input.into();

    let task = state
        .db
        .call(move |conn| task_service::create_task(conn, &service_input))
        .await?;

    state
        .data_emitter
        .emit_change("task", "created", Some(&task.id));

    Ok((StatusCode::CREATED, Json(task)))
}

/// GET /api/tasks - List all tasks, with optional filters.
async fn list_tasks(
    State(state): State<AppState>,
    Query(query): Query<ListTasksQuery>,
) -> Result<impl IntoResponse, AppError> {
    let repo_url = query.repo_url.clone();
    let repository_id = query.repository_id.clone();

    let tasks = state
        .db
        .call(move |conn| {
            task_service::get_all_tasks(
                conn,
                repo_url.as_deref(),
                repository_id.as_deref(),
            )
        })
        .await?;

    Ok(Json(tasks))
}

/// GET /api/tasks/:id - Get a single task by ID.
async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let task = state
        .db
        .call(move |conn| task_service::get_task_by_id(conn, &id))
        .await?;

    Ok(Json(task))
}

/// PATCH /api/tasks/:id - Update task fields.
async fn update_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateTaskInput>,
) -> Result<impl IntoResponse, AppError> {
    info!(id = %id, "PATCH /tasks/:id");

    let task_id = id.clone();
    let task = state
        .db
        .call(move |conn| task_service::update_task(conn, &task_id, &input))
        .await?;

    state
        .data_emitter
        .emit_change("task", "updated", Some(&id));

    Ok(Json(task))
}

/// DELETE /api/tasks/:id - Delete a task.
async fn delete_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    info!(id = %id, "DELETE /tasks/:id");

    let task_id = id.clone();
    state
        .db
        .call(move |conn| task_service::delete_task(conn, &task_id))
        .await?;

    state
        .data_emitter
        .emit_change("task", "deleted", Some(&id));

    Ok(Json(json!({ "success": true })))
}

// ============================================================================
// Lifecycle handlers
// ============================================================================

/// POST /api/tasks/:id/execute - STUB (Agent System is Phase 4).
async fn execute_task_stub() -> impl IntoResponse {
    (
        StatusCode::ACCEPTED,
        Json(json!({ "status": "started" })),
    )
}

/// POST /api/tasks/:id/feedback - STUB (Agent System is Phase 4).
async fn feedback_stub() -> impl IntoResponse {
    Json(json!({ "status": "feedback_sent" }))
}

/// POST /api/tasks/:id/cancel - Cancel task execution.
///
/// Updates the task status to `canceled` and emits SSE error + data-change events.
async fn cancel_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    info!(id = %id, "POST /tasks/:id/cancel");

    let task_id = id.clone();
    let update = UpdateTaskInput {
        status: Some(TaskStatus::Canceled),
        error: Some(Some("Task canceled by user".to_string())),
        ..Default::default()
    };

    state
        .db
        .call(move |conn| task_service::update_task(conn, &task_id, &update))
        .await?;

    // Emit SSE events
    state.sse_emitter.emit_error(&id, "Task canceled by user").await;
    state.sse_emitter.emit_status(&id, "canceled").await;

    // Emit data-change
    state
        .data_emitter
        .emit_change("task", "updated", Some(&id));

    Ok(Json(json!({ "status": "canceled" })))
}

/// POST /api/tasks/:id/approve - STUB (needs Git+PR, Phase 3).
async fn approve_stub() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({
            "error": "Not Implemented",
            "message": "Approve & PR creation requires Git service (Phase 3)"
        })),
    )
}

/// POST /api/tasks/:id/request-changes - Request changes on a task.
///
/// Updates status to `changes_requested` and emits a data-change event.
async fn request_changes(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RequestChangesBody>,
) -> Result<impl IntoResponse, AppError> {
    info!(id = %id, "POST /tasks/:id/request-changes");

    // Validate feedback is present
    let feedback = body
        .feedback
        .filter(|f| !f.is_empty())
        .ok_or_else(|| AppError::Validation("Feedback is required".to_string()))?;

    let task_id = id.clone();
    let update = UpdateTaskInput {
        status: Some(TaskStatus::ChangesRequested),
        error: Some(Some(format!("Changes requested: {feedback}"))),
        ..Default::default()
    };

    let task = state
        .db
        .call(move |conn| task_service::update_task(conn, &task_id, &update))
        .await?;

    state
        .data_emitter
        .emit_change("task", "updated", Some(&id));

    Ok(Json(json!({
        "status": "changes_requested",
        "message": "Changes requested. Call POST /tasks/:id/execute to resume the agent.",
        "task": task,
    })))
}

/// POST /api/tasks/:id/approve-plan - STUB (Agent System, Phase 4).
async fn approve_plan_stub() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({
            "error": "Not Implemented",
            "message": "Plan approval requires Agent service (Phase 4)"
        })),
    )
}

/// GET /api/tasks/:id/logs - SSE stream of task log events.
///
/// Subscribes to the per-task SSE broadcast channel and streams events to the
/// client with a 30-second keepalive heartbeat.
async fn task_logs_stream(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    info!(id = %id, "GET /tasks/:id/logs (SSE)");

    let rx = state.sse_emitter.subscribe(&id).await;
    let stream = BroadcastStream::new(rx)
        .filter_map(|result| result.ok())
        .map(|event| {
            let event_name = event.event_type.as_event_name();
            let data = serde_json::to_string(&event.data).unwrap_or_default();
            Ok(Event::default().event(event_name).data(data))
        });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("heartbeat"),
    )
}

/// GET /api/tasks/:id/changes - Return persisted changes data or empty.
///
/// In the full server this would also attempt to read the live worktree.
/// For Phase 2 we only serve persisted `changes_data` from the DB.
async fn get_changes(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let task = state
        .db
        .call(move |conn| task_service::get_task_by_id(conn, &id))
        .await?;

    if let Some(ref changes_json) = task.changes_data {
        match serde_json::from_str::<serde_json::Value>(changes_json) {
            Ok(parsed) => Ok(Json(parsed).into_response()),
            Err(_) => {
                warn!(task_id = %task.id, "Failed to parse persisted changes_data");
                Ok(Json(json!({ "files": [], "diff": "" })).into_response())
            }
        }
    } else {
        Ok(Json(json!({ "files": [], "diff": "" })).into_response())
    }
}

/// POST /api/tasks/:id/pr-merged - Mark PR as merged, set status to done.
async fn pr_merged(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    info!(id = %id, "POST /tasks/:id/pr-merged");

    let task_id = id.clone();
    let update = UpdateTaskInput {
        status: Some(TaskStatus::Done),
        ..Default::default()
    };

    state
        .db
        .call(move |conn| task_service::update_task(conn, &task_id, &update))
        .await?;

    state
        .data_emitter
        .emit_change("task", "updated", Some(&id));

    Ok(Json(json!({
        "status": "done",
        "message": "PR marked as merged."
    })))
}

/// POST /api/tasks/:id/pr-closed - Mark PR as closed, set status to canceled.
async fn pr_closed(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    info!(id = %id, "POST /tasks/:id/pr-closed");

    let task_id = id.clone();
    let update = UpdateTaskInput {
        status: Some(TaskStatus::Canceled),
        ..Default::default()
    };

    state
        .db
        .call(move |conn| task_service::update_task(conn, &task_id, &update))
        .await?;

    state
        .data_emitter
        .emit_change("task", "updated", Some(&id));

    Ok(Json(json!({
        "status": "canceled",
        "message": "PR marked as closed."
    })))
}

/// POST /api/tasks/:id/start - STUB (Agent System, Phase 4).
async fn start_stub() -> impl IntoResponse {
    (StatusCode::ACCEPTED, Json(json!({ "status": "started" })))
}

/// POST /api/tasks/:id/extend - STUB (Agent System, Phase 4).
async fn extend_stub() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({
            "error": "Not Implemented",
            "message": "Timeout extension requires Agent service (Phase 4)"
        })),
    )
}

/// POST /api/tasks/:id/cleanup-worktree - STUB (Git service, Phase 3).
async fn cleanup_worktree_stub() -> impl IntoResponse {
    Json(json!({
        "status": "no_worktree",
        "message": "No worktree exists for this task"
    }))
}

/// POST /api/tasks/:id/open-editor - STUB (Git service, Phase 3).
async fn open_editor_stub() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({
            "error": "Not Implemented",
            "message": "Editor launch requires Git service (Phase 3)"
        })),
    )
}

/// POST /api/tasks/:id/resolve-conflicts - STUB (Git service, Phase 3).
async fn resolve_conflicts_stub() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({
            "error": "Not Implemented",
            "message": "Conflict resolution requires Git service (Phase 3)"
        })),
    )
}

/// GET /api/tasks/:id/pr-comments - STUB: return empty comments array.
async fn pr_comments_stub() -> impl IntoResponse {
    Json(json!({ "comments": [] }))
}

// ============================================================================
// Deprecated endpoints (spec workflow removed)
// ============================================================================

/// Returns 410 Gone for all deprecated spec-related endpoints.
async fn deprecated_gone() -> impl IntoResponse {
    (
        StatusCode::GONE,
        Json(json!({
            "error": "Gone",
            "message": "This endpoint has been removed. Use the two-agent workflow instead."
        })),
    )
}
