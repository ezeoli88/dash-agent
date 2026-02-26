# Migration Plan: Server TypeScript → Rust

## Context
Migrate `packages/server/` (Bun + Express + sql.js, ~10,000 LoC across 50+ files) to `packages/server-rs/` (axum + tokio + rusqlite). Motivations: binary size (~10-15MB vs ~80MB), performance, memory efficiency. The Rust server must produce an identical HTTP API surface so the React frontend works unchanged.

## Key Decisions
- **Shared types**: ts-rs generates TS interfaces from Rust structs → `packages/shared/src/generated/`. Zod schemas stay for runtime validation.
- **MCP**: Manual JSON-RPC 2.0 implementation (no SDK)
- **SQLite**: rusqlite with `bundled` feature (no WASM, writes to disk directly)
- **State**: `Arc<RwLock<HashMap>>` replaces JS `Map` singletons; `tokio::sync::broadcast` replaces EventEmitter

## Critical Compatibility Concerns
1. **Encryption format**: TS uses 16-byte IV + separate authTag (`iv:authTag:ciphertext`). Rust `aes-gcm` uses 12-byte nonce + appended tag. Must match the TS format exactly to read existing encrypted secrets.
2. **Shared package coexistence**: During migration, `packages/shared/` has both Zod schemas (runtime) and ts-rs types (compile-time). Both must stay in sync.
3. **SQL schema**: Same 9 migrations, same column types. rusqlite reads the existing `.sqlite` file created by sql.js.

---

## Rust Project Structure

```
packages/server-rs/
  Cargo.toml
  build.rs                           # ts-rs type generation trigger
  src/
    main.rs                          # CLI args (--port, --no-open), tokio runtime
    lib.rs                           # pub async fn run() - init DB, build router, bind
    config.rs                        # Config struct, env var loading, data dir paths
    error.rs                         # AppError enum, axum IntoResponse impl
    db/
      mod.rs
      database.rs                    # rusqlite Connection in Mutex, spawn_blocking wrapper
      migrations.rs                  # 9 migrations verbatim from TS
    models/
      mod.rs
      task.rs                        # Task, TaskStatus, CreateTaskInput — #[derive(TS)]
      repository.rs                  # Repository, DetectedStack, LearnedPattern
      secret.rs                      # SecretKeyType, SecretRecord
      agent.rs                       # AgentType, DetectedAgent, AgentModel
      settings.rs                    # SettingKey enum
      sse_events.rs                  # SSEEvent, LogEntry, SSEEventType
    services/
      mod.rs
      task_service.rs
      repo_service.rs
      settings_service.rs
      secrets_service.rs
      encryption_service.rs
      auth_service.rs
      agent_service.rs
      pm_agent_service.rs
      dev_agent_service.rs
      git_service.rs
      github_service.rs
      github_oauth_service.rs
      gitlab_service.rs
      pr_comments_service.rs
      agent_detection_service.rs
      ai_provider_service.rs
      stack_detector_service.rs
      local_scan_service.rs
    agent/
      mod.rs
      types.rs                       # AgentRunResult, IAgentRunner trait
      cli_runner.rs                  # Child process management, stdin delivery
      parsers/
        mod.rs
        claude_code.rs               # stream-json parser
        codex.rs                     # NDJSON item events
        gemini.rs                    # init/tool_use/result events
        copilot.rs                   # JSON + plain terminal
      cli_prompts.rs                 # 5 prompt variants
      runner.rs                      # Legacy OpenAI API runner
      openrouter_runner.rs           # OpenRouter API fallback
      executor.rs                    # Tool execution sandbox
    routes/
      mod.rs                         # api_router() combining all routes
      tasks.rs                       # 14 endpoints
      repos.rs                       # 14 endpoints
      setup.rs                       # 12 endpoints
      secrets.rs                     # 11 endpoints
      data.rs                        # 3 endpoints
    mcp/
      mod.rs
      jsonrpc.rs                     # JSON-RPC 2.0 types and dispatch
      server.rs                      # McpServer struct, tool/resource registry
      errors.rs                      # McpErrorCode, structured errors
      tools/
        mod.rs
        repo_tools.rs
        task_tools.rs
        workflow_tools.rs
        review_tools.rs
        status_tools.rs
      resources/
        mod.rs
        task_resources.rs
        repo_resources.rs
    middleware/
      mod.rs
      auth.rs                        # Bearer + query param + loopback bypass
      cors.rs                        # RFC 1918 private IPs
    utils/
      mod.rs
      sse_emitter.rs                 # tokio::sync::broadcast per task_id
      data_events.rs                 # Global broadcast + 30s keepalive
      process_killer.rs              # taskkill on Windows, kill(-pid) on Unix
      logger.rs                      # tracing-based structured logger
```

---

## Cargo.toml Dependencies

```toml
[package]
name = "agent-board"
version = "0.2.14"
edition = "2021"

[dependencies]
# Web framework
axum = { version = "0.8", features = ["json", "query"] }
tower = { version = "0.5", features = ["util", "timeout"] }
tower-http = { version = "0.6", features = ["cors", "fs", "trace"] }
tokio = { version = "1", features = ["full"] }

# Database
rusqlite = { version = "0.32", features = ["bundled"] }

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Type generation (TS from Rust)
ts-rs = { version = "10", features = ["serde-compat"] }

# Crypto
aes-gcm = "0.10"
pbkdf2 = "0.12"
sha2 = "0.10"
rand = "0.8"
hex = "0.4"

# HTTP client
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }

# GitHub API
octocrab = "0.43"

# UUID
uuid = { version = "1", features = ["v4", "serde"] }

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Async utilities
tokio-stream = "0.1"
futures = "0.3"

# Process management
sysinfo = "0.32"

# CLI args
clap = { version = "4", features = ["derive"] }

# Misc
chrono = { version = "0.4", features = ["serde"] }
thiserror = "2"
anyhow = "1"
once_cell = "1"

[profile.release]
opt-level = "z"       # Optimize for binary size
lto = true
codegen-units = 1
strip = true
```

---

## Phase 0: Project Scaffold + Core Infrastructure

**Goal**: Compilable binary that serves `/api/health` and static frontend files.

### Files to create
- `Cargo.toml` — dependencies as above
- `src/main.rs` — CLI arg parsing (`--port`, `--no-open`), tokio runtime init
- `src/lib.rs` — `pub async fn run()`: init DB → run migrations → build router → bind listener
- `src/config.rs` — `Config` struct (port, data_dir, auth_enabled), `load_config()` from env vars
- `src/error.rs` — `AppError` enum (Validation, NotFound, Unauthorized, Internal, Database), `impl IntoResponse`
- `src/db/database.rs` — rusqlite Connection wrapped in `std::sync::Mutex`, accessed via `tokio::task::spawn_blocking`
- `src/db/migrations.rs` — 9 migrations copied verbatim from `packages/server/src/db/migrations.ts`

### Key design: Database access pattern

rusqlite `Connection` is `!Send`, so it cannot be held across `.await` points:

```rust
pub struct Database {
    conn: std::sync::Mutex<rusqlite::Connection>,
}

impl Database {
    pub async fn call<F, R>(&self, f: F) -> Result<R, AppError>
    where
        F: FnOnce(&rusqlite::Connection) -> Result<R, AppError> + Send + 'static,
        R: Send + 'static,
    {
        let db = Arc::clone(&self.inner);
        tokio::task::spawn_blocking(move || {
            let conn = db.conn.lock().unwrap();
            f(&conn)
        }).await?
    }
}
```

### Key difference from TS
sql.js is in-memory + manual `saveDatabase()`. rusqlite writes to disk directly, eliminating all `saveDatabase()` calls. Transactions use `conn.execute_batch("BEGIN; ... COMMIT;")` or the `Transaction` API.

### Verify
```bash
cargo run -- --port 51768
curl http://localhost:51768/api/health
# → {"status":"ok","timestamp":"..."}
```

---

## Phase 1: Models + Core Services + ts-rs Type Generation

**Goal**: All CRUD services working. TypeScript types auto-generated from Rust structs.

### Models with ts-rs

Every struct the frontend needs gets `#[derive(TS)]`:

```rust
// src/models/task.rs
use ts_rs::TS;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../shared/src/generated/")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub repo_url: String,
    pub target_branch: String,
    pub context_files: Vec<String>,
    pub build_command: Option<String>,
    pub repository_id: Option<String>,
    pub user_input: Option<String>,
    pub generated_spec: Option<String>,
    pub final_spec: Option<String>,
    pub agent_type: Option<String>,
    pub agent_model: Option<String>,
    pub changes_data: Option<String>,
    pub conflict_files: Option<String>,
    pub pr_url: Option<String>,
    pub error: Option<String>,
    pub branch_name: Option<String>,
    pub pr_number: Option<i64>,
    pub was_spec_edited: bool,
    pub created_at: String,
    pub updated_at: String,
    // ... all 25 columns
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../shared/src/generated/")]
pub enum TaskStatus {
    #[serde(rename = "draft")] Draft,
    #[serde(rename = "refining")] Refining,
    #[serde(rename = "pending_approval")] PendingApproval,
    #[serde(rename = "approved")] Approved,
    #[serde(rename = "coding")] Coding,
    #[serde(rename = "plan_review")] PlanReview,
    #[serde(rename = "review")] Review,
    #[serde(rename = "done")] Done,
    #[serde(rename = "failed")] Failed,
    #[serde(rename = "canceled")] Canceled,
    // ... all 16 statuses
}
```

**ts-rs generation trigger** — Rust test:
```rust
#[test]
fn export_ts_types() {
    Task::export_all().unwrap();
    Repository::export_all().unwrap();
    // ... all exported types
}
```

Run `cargo test export_ts_types` to regenerate `packages/shared/src/generated/*.ts`.

### Services to implement

| Service | Replaces | Key methods |
|---------|----------|-------------|
| `task_service.rs` | task.service.ts (525 LoC) | create, get_all, get_by_id, update, delete, get_by_status, update_spec, approve_spec |
| `settings_service.rs` | settings.service.ts | get_setting, set_setting, get_default_agent |
| `encryption_service.rs` | encryption.service.ts (132 LoC) | encrypt, decrypt — **must match iv:authTag:ciphertext format** |
| `secrets_service.rs` | secrets.service.ts (527 LoC) | save_secret, get_secret, delete_secret, get_ai_credentials, get_github_credentials |
| `auth_service.rs` | auth.service.ts (10 LoC) | generate_startup_token, get/set token |

### Encryption backwards compatibility (CRITICAL)

The TS version stores secrets as `iv_hex:authTag_hex:ciphertext_hex` with 16-byte IV. The Rust `aes-gcm` crate uses 12-byte nonces. To maintain compatibility:

```rust
// Encrypt — split authTag to match TS format
let ct = cipher.encrypt(nonce, plaintext)?;
let (ciphertext_bytes, auth_tag) = ct.split_at(ct.len() - 16);
format!("{}:{}:{}", hex::encode(iv), hex::encode(auth_tag), hex::encode(ciphertext_bytes))

// Decrypt — reconstruct combined payload for aes-gcm
let parts: Vec<&str> = encrypted.splitn(3, ':');
let iv = hex::decode(parts[0])?;
let auth_tag = hex::decode(parts[1])?;
let mut payload = hex::decode(parts[2])?;
payload.extend_from_slice(&auth_tag); // aes-gcm expects tag appended
cipher.decrypt(Nonce::from_slice(&iv), payload.as_ref())?
```

> Note: If TS uses 16-byte IV, use `Aes256Gcm` with 16-byte nonce via `aes_gcm::aead::generic_array`, or detect IV length at runtime for migration support.

### Verify
Integration tests: create task → read → update → delete. Compare JSON output with TS server.

---

## Phase 2: HTTP Routes + SSE + Auth Middleware

**Goal**: All 54+ REST endpoints returning identical JSON responses.

### AppState (shared across handlers)

```rust
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub task_service: Arc<TaskService>,
    pub repo_service: Arc<RwLock<RepoService>>,
    pub settings_service: Arc<SettingsService>,
    pub secrets_service: Arc<SecretsService>,
    pub agent_service: Arc<AgentService>,
    pub sse_emitter: Arc<SSEEmitter>,
    pub data_emitter: Arc<DataEventEmitter>,
    pub auth_token: Option<String>,
    pub startup_id: String,
    pub config: Arc<Config>,
}
```

### Router

```rust
pub fn api_router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/events", get(data_events_sse))
        .nest("/api/tasks", tasks::router())
        .nest("/api/repos", repos::router())
        .nest("/api/setup", setup::router())
        .nest("/api/secrets", secrets::router())
        .nest("/api/data", data::router())
        .route("/api/mcp", post(mcp_handler))
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .layer(cors_layer())
        .fallback_service(ServeDir::new("public"))
        .with_state(state)
}
```

### SSE implementation

```rust
// SSEEmitter — replaces Node EventEmitter
pub struct SSEEmitter {
    channels: RwLock<HashMap<String, broadcast::Sender<SSEEvent>>>,
}

impl SSEEmitter {
    pub fn subscribe(&self, task_id: &str) -> broadcast::Receiver<SSEEvent> { /* ... */ }
    pub fn emit(&self, task_id: &str, event: SSEEvent) { /* ... */ }
    pub fn emit_log(&self, task_id: &str, level: &str, msg: &str) { /* ... */ }
    pub fn emit_status(&self, task_id: &str, status: TaskStatus) { /* ... */ }
    pub fn emit_complete(&self, task_id: &str, pr_url: Option<&str>) { /* ... */ }
    pub fn emit_error(&self, task_id: &str, msg: &str) { /* ... */ }
}

// axum SSE handler
async fn task_sse_stream(State(s): State<AppState>, Path(id): Path<String>)
    -> Sse<impl Stream<Item = Result<Event, Infallible>>>
{
    let rx = s.sse_emitter.subscribe(&id);
    Sse::new(BroadcastStream::new(rx).map(|e| { /* format as SSE Event */ }))
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(30)))
}
```

### Auth middleware

```rust
async fn auth_middleware(State(s): State<AppState>, req: Request, next: Next) -> Response {
    // 1. No token configured → pass through
    // 2. Loopback + /api/mcp → bypass
    // 3. Check "Authorization: Bearer <token>" header
    // 4. Check ?token= query param (for SSE EventSource)
    // 5. 401 Unauthorized
}
```

### Port order (simple → complex)
1. `/api/data` (3 endpoints) — export/import/clear
2. `/api/secrets` (11 endpoints) — CRUD encrypted secrets
3. `/api/setup` (12 endpoints) — agent detection, settings, OAuth
4. `/api/repos` (14 endpoints) — CRUD repos, GitHub integration
5. `/api/tasks` (14 endpoints) — CRUD tasks, SSE streaming, agent execution

### All endpoints (complete reference)

**Tasks** (`/api/tasks`):
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/` | Create task |
| GET | `/` | List tasks (filter by repo_url) |
| GET | `/:id` | Get task by ID |
| PATCH | `/:id` | Update task |
| DELETE | `/:id` | Delete task |
| POST | `/:id/spec/generate` | Generate spec (PM Agent) |
| POST | `/:id/spec/regenerate` | Regenerate spec |
| DELETE | `/:id/spec/generation` | Cancel spec generation |
| PATCH | `/:id/spec/approve` | Approve spec |
| POST | `/:id/execute` | Start execution (Dev Agent) |
| DELETE | `/:id/execution` | Cancel execution |
| GET | `/:id/logs` | Get task logs |
| GET | `/:id/logs/stream` | SSE log stream |
| POST | `/:id/pr/approve` | Approve PR creation |
| POST | `/:id/feedback` | Send feedback to agent |

**Repos** (`/api/repos`):
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List repositories |
| POST | `/` | Create repository |
| GET | `/github/repos` | List GitHub repos |
| POST | `/github/repos/validate` | Validate GitHub repo URL |
| GET | `/local/pick-folder` | OS folder picker |
| GET | `/local/scan` | Scan local filesystem |
| POST | `/local/add` | Add local repo |
| GET | `/:id` | Get repo by ID |
| PATCH | `/:id` | Update repo |
| DELETE | `/:id` | Delete repo |
| POST | `/:id/detect-stack` | Re-detect tech stack |
| POST | `/:id/patterns` | Add learned pattern |
| DELETE | `/:id/patterns` | Clear all patterns |
| DELETE | `/:id/patterns/:patternId` | Delete specific pattern |

**Setup** (`/api/setup`):
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/agents` | Detect installed CLI agents |
| GET | `/settings` | Get app settings |
| PATCH | `/settings` | Update settings |
| POST | `/validate-ai-key` | Validate Claude/OpenAI key |
| POST | `/validate-openrouter-key` | Validate OpenRouter key |
| GET | `/openrouter-models` | Get OpenRouter models |
| GET | `/github/auth` | Get GitHub OAuth URL |
| POST | `/github/callback` | Handle OAuth callback |
| GET | `/status` | Get setup status |
| DELETE | `/ai-provider` | Disconnect AI provider |
| DELETE | `/github` | Disconnect GitHub |
| GET | `/mcp-config` | Get MCP server config |

**Secrets** (`/api/secrets`):
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ai` | Save AI API key |
| DELETE | `/ai` | Delete AI key |
| GET | `/ai/status` | Get AI connection status |
| POST | `/github` | Save GitHub token |
| DELETE | `/github` | Delete GitHub token |
| GET | `/github/status` | Get GitHub status |
| POST | `/github/validate-pat` | Validate GitHub PAT |
| POST | `/gitlab` | Save GitLab token |
| DELETE | `/gitlab` | Delete GitLab token |
| GET | `/gitlab/status` | Get GitLab status |
| POST | `/gitlab/validate-pat` | Validate GitLab PAT |
| GET | `/status` | Get all connections status |

**Data** (`/api/data`):
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/export` | Export all data as JSON |
| POST | `/import` | Import data from JSON |
| DELETE | `/` | Clear all data (requires confirmation) |

### Verify
Parallel test: send same requests to TS (51767) and Rust (51768), diff JSON responses.

---

## Phase 3: Git Service + GitHub/GitLab Integration

**Goal**: Bare repos, worktrees, diffs, push, PR creation all working.

### git_service.rs — the most complex service (replaces 1,960 LoC)

```rust
pub struct GitService {
    config: Arc<Config>,
    repo_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,         // per-repo serialization
    active_worktrees: RwLock<HashMap<String, WorktreeInfo>>,    // task_id → worktree path
}
```

**Key methods:**

| Method | Purpose | Notes |
|--------|---------|-------|
| `exec_git(args, cwd)` | Run git command | `tokio::process::Command`, CREATE_NO_WINDOW on Windows |
| `ensure_bare_repo(repo_url)` | Clone or find bare repo | Locked per-repo |
| `fetch_repo(bare_path, branch)` | `git fetch origin --prune` | Locked per-repo |
| `setup_worktree(task_id, url, branch)` | Create or reuse worktree | Checks .git file validity |
| `cleanup_worktree(task_id)` | Remove worktree | Windows EBUSY retry logic |
| `get_changes(task_id)` | `git diff` + file contents | Returns `Vec<ChangedFile>` |
| `commit_and_push(task_id, msg)` | `git add -A && commit && push` | Token via GIT_ASKPASS |
| `create_pull_request(task_id, ...)` | GitHub/GitLab API | octocrab or reqwest |

**Credential injection** (same pattern as TS):
```rust
// Create temp script that echoes token for GIT_ASKPASS
let script = if cfg!(windows) {
    format!("@echo {}", token)
} else {
    format!("#!/bin/sh\necho '{}'", token)
};
```

**Per-repo locking** prevents concurrent git operations on the same bare repo:
```rust
async fn with_repo_lock<F, Fut, R>(&self, key: &str, f: F) -> Result<R>
where F: FnOnce() -> Fut, Fut: Future<Output = Result<R>>
{
    let lock = {
        let mut locks = self.repo_locks.lock().await;
        locks.entry(key.to_string()).or_insert_with(|| Arc::new(Mutex::new(()))).clone()
    };
    let _guard = lock.lock().await;
    f().await
}
```

### Other services

| Service | Replaces | Rust approach |
|---------|----------|--------------|
| `github_service.rs` | github.service.ts | `octocrab` — list repos, create PR, get branches |
| `github_oauth_service.rs` | github-oauth.service.ts | `reqwest` for token exchange, in-memory state tokens |
| `gitlab_service.rs` | gitlab.service.ts | `reqwest` to GitLab API |
| `repo_service.rs` | repo.service.ts | `RwLock<HashMap<String, Repository>>` in-memory |
| `stack_detector_service.rs` | stack-detector.service.ts | Parse package.json for framework/styling/testing |
| `local_scan_service.rs` | local-scan.service.ts | `tokio::fs::read_dir` + git commands |
| `pr_comments_service.rs` | pr-comments.service.ts | `tokio::spawn` background task, poll every 60s |

### Verify
Clone test repo → create worktree → make changes → diff → push. Compare output with TS server.

---

## Phase 4: Agent System (CLI Runner + Process Management)

**Goal**: Spawn CLI agents, parse output streams, manage timeouts, handle feedback.

### Architecture

```
agent/
  types.rs              # AgentRunResult, IAgentRunner trait
  cli_runner.rs         # Main CLIAgentRunner struct
  parsers/
    claude_code.rs      # stream-json: {"type":"assistant","content":[...]}
    codex.rs            # NDJSON: {"type":"item","item":{"type":"message",...}}
    gemini.rs           # {"type":"init"}, {"type":"tool_use"}, {"type":"result"}
    copilot.rs          # Mixed JSON + plain terminal output
  cli_prompts.rs        # 5 prompt modes (task, resume, empty_repo, plan_only, implementation)
  runner.rs             # Legacy OpenAI API runner with tool calling loop
  openrouter_runner.rs  # OpenRouter API fallback
  executor.rs           # Tool sandbox (read_file, write_file, run_command...)
```

### IAgentRunner trait

```rust
#[async_trait]
pub trait AgentRunner: Send + Sync {
    async fn run(&mut self) -> Result<AgentRunResult>;
    fn add_feedback(&self, message: &str);
    fn cancel(&self);
    fn is_running(&self) -> bool;
}
```

### CLIAgentRunner

```rust
pub struct CLIAgentRunner {
    options: CLIRunnerOptions,
    feedback_tx: mpsc::Sender<String>,     // send feedback via stdin
    cancel_tx: Option<oneshot::Sender<()>>, // cancellation signal
    is_running: Arc<AtomicBool>,
}
```

**Execution flow:**
1. `build_cli_command()` → per-agent command + args
2. `tokio::process::Command::new(cmd).stdin(piped).stdout(piped).stderr(piped).spawn()`
3. `tokio::spawn` for stdout line parsing (routes to agent-specific parser)
4. `tokio::spawn` for stderr accumulation (auth error detection)
5. `tokio::spawn` for stdin feedback delivery (reads from `mpsc::Receiver`)
6. `tokio::select!` on: process exit, cancel signal, silence timeout

**Windows .cmd workaround**: On Windows, if the CLI command resolves to a `.cmd` file, use PowerShell to invoke it with proper escaping (same temp-file approach as TS).

### Process killer

```rust
pub fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(unix)]
    {
        unsafe { libc::kill(-(pid as i32), libc::SIGKILL); }
    }
}
```

### Agent service state

```rust
pub struct AgentService {
    active_agents: RwLock<HashMap<String, ActiveAgent>>,
    // ...
}

struct ActiveAgent {
    task_id: String,
    runner: Box<dyn AgentRunner>,
    started_at: Instant,
    timeout_handle: JoinHandle<()>,     // tokio::time based
    warning_handle: JoinHandle<()>,
}
```

**Timeout logic**: 10-min default, 5-min warning, 5-min extension. Uses `tokio::time::sleep` in spawned tasks.

### Agent detection

```rust
pub async fn detect_installed_agents() -> Vec<DetectedAgent> {
    // Check for each: claude-code, codex, gemini, copilot
    // 1. Check env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
    // 2. Check login files (~/.claude.json, ~/.codex/auth.json, etc.)
    // 3. Check install indicators
    // Cache results for 5 minutes
}
```

### Verify
Create mock CLI scripts that output in each format. Run CLIAgentRunner against them. Verify parsed events match TS behavior.

---

## Phase 5: MCP JSON-RPC 2.0 Implementation

**Goal**: Full MCP protocol support, stateless, without the TS SDK.

### JSON-RPC types

```rust
#[derive(Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,        // must be "2.0"
    pub method: String,
    pub params: Option<Value>,
    pub id: Option<Value>,
}

#[derive(Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    pub id: Option<Value>,
}
```

### McpServer

```rust
pub struct McpServer<'a> {
    state: &'a AppState,
    tools: HashMap<String, Box<dyn McpTool>>,
    resources: Vec<McpResourceTemplate>,
}

impl McpServer<'_> {
    pub async fn dispatch(&self, req: JsonRpcRequest) -> JsonRpcResponse {
        match req.method.as_str() {
            "initialize" => self.handle_initialize(&req),
            "tools/list" => self.handle_tools_list(),
            "tools/call" => self.handle_tools_call(req.params).await,
            "resources/list" => self.handle_resources_list(),
            "resources/read" => self.handle_resources_read(req.params).await,
            _ => JsonRpcResponse::method_not_found(req.id),
        }
    }
}
```

### axum handler (stateless — fresh server per request)

```rust
async fn mcp_handler(State(s): State<AppState>, Json(req): Json<JsonRpcRequest>) -> Json<JsonRpcResponse> {
    let server = McpServer::new(&s);
    Json(server.dispatch(req).await)
}
```

### Tools to implement

| Tool | Category | Description |
|------|----------|-------------|
| `add_repository` | repo | Create + auto-detect stack |
| `list_repositories` | repo | Return all repos |
| `create_task` | task | Create draft task |
| `list_tasks` | task | Filter by repo/status |
| `get_task` | task | Get task details |
| `start_task` | workflow | Generate branch, launch agent |
| `approve_spec` | workflow | Approve spec → start coding |
| `send_feedback` | workflow | Send feedback to running agent |
| `get_changes` | review | Get diff from worktree or persisted |
| `approve_changes` | review | Create PR |
| `request_changes` | review | Send back for revision |
| `get_setup_status` | status | Secrets + agents + OAuth |

### Resources

| URI Pattern | Description |
|-------------|-------------|
| `agentboard://tasks/{id}` | Task details |
| `agentboard://tasks/{id}/changes` | Task changes/diff |
| `agentboard://repos/{id}` | Repository details |
| `agentboard://status` | Board status |

### Verify
Send raw JSON-RPC requests with curl, compare responses with TS server.

---

## Phase 6: Binary Distribution + Release Pipeline

**Goal**: Cross-platform binaries, updated CI/CD, smaller binaries.

### Changes to `.github/workflows/release.yml`

Replace single Bun cross-compile job with 3 native runners:

```yaml
jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - cargo build --release --target x86_64-unknown-linux-gnu
      - Bundle packages/dashboard/dist as public/
      - ZIP → linux-x64/agent-board.zip

  build-macos:
    runs-on: macos-latest
    steps:
      - cargo build --release --target x86_64-apple-darwin
      - cargo build --release --target aarch64-apple-darwin
      - Bundle + ZIP → macos-x64/ + macos-arm64/

  build-windows:
    runs-on: windows-latest
    steps:
      - cargo build --release --target x86_64-pc-windows-msvc
      - Bundle + ZIP → win-x64/agent-board.exe
```

### Key differences from current pipeline
- **No more `sql-wasm.wasm`** — SQLite compiled into binary via `rusqlite(bundled)`
- **Smaller binaries**: target 8-15MB (vs ~80MB current)
- **Faster build**: Rust release builds are slower than Bun, but produce better output
- **Frontend still built with npm**: `npm run build:dashboard` before Rust build

### Binary entry point
```rust
fn main() {
    let args = Args::parse(); // --port, --no-open
    let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
    rt.block_on(agent_board::run(args));
}
```

LAN IP detection + browser open logic from `packages/server/src/bin.ts` ported to Rust.

### Verify
Build on all 3 platforms → start binary → verify frontend loads → verify API works → compare binary sizes.

---

## Implementation Order Summary

| Phase | What | Depends On | Estimated Files | Can Parallelize? |
|-------|------|-----------|----------------|-----------------|
| 0 | Scaffold + DB | Nothing | 8 files | — |
| 1 | Models + Core Services | Phase 0 | 10 files | — |
| 2 | HTTP Routes + SSE | Phase 1 | 8 files | — |
| 3 | Git + GitHub/GitLab | Phase 2 | 8 files | — |
| 4 | Agent System | Phase 3 | 12 files | — |
| 5 | MCP | Phase 2 | 12 files | Yes, with 3-4 |
| 6 | Release Pipeline | All | 3 files | — |

## Testing Strategy

1. **Per-phase**: `cargo test` with integration tests
2. **Cross-server comparison**: Script sends identical requests to TS (51767) and Rust (51768), diffs responses
3. **Frontend smoke test**: Point dashboard at Rust server, test all features manually
4. **CI**: Add `test-server-rs` job in `test.yml`
5. **Binary testing**: Build for each platform, verify startup + frontend + API

## Binary Size Target

| Component | Current (Bun) | Target (Rust) |
|-----------|--------------|--------------|
| Server binary | ~50MB | ~8-15MB |
| sql-wasm.wasm | ~2MB | 0 (compiled in) |
| Frontend assets | ~3MB | ~3MB (unchanged) |
| **Total ZIP** | **~55MB** | **~11-18MB** |
