# Tauri Feasibility Review - ai-agent-board

**Date:** 2026-03-04
**Status:** Analysis complete

## Executive Summary

**Viability: HIGH** — The project is exceptionally well-positioned for a Tauri migration due to having a complete Rust backend (`server-rs`, ~17,600 LoC) and a pure React SPA frontend.

---

## Current Architecture

| Component | Technology | Lines of Code |
|---|---|---|
| Frontend | React 19 + Vite 7 + TanStack Router/Query + Tailwind 4 + Radix UI | SPA |
| Backend (TS) | Bun + Express + sql.js + SSE | ~26,500 LoC |
| Backend (Rust) | Axum + Tokio + rusqlite + SSE | ~17,600 LoC |
| CLI | Node.js wrapper → downloads & runs Rust binary | ~1,400 LoC |
| Shared | Zod schemas + TypeScript types | Shared |
| Communication | REST API + SSE (Server-Sent Events) | ~40 endpoints |

---

## Why This Project is a Good Fit for Tauri

1. **Rust backend already exists** — `packages/server-rs/` is a production-ready Axum server with SQLite, process spawning, git operations, encryption, and SSE. Tauri's backend is Rust, so there's massive code reuse potential.

2. **Frontend is a pure SPA** — No SSR, no server-side rendering. Tauri embeds a WebView that loads exactly this type of app with zero changes.

3. **100% local app** — SQLite database, local git repos, local CLI processes. No remote server dependency. This is Tauri's ideal use case.

4. **Already compiles cross-platform** — CI builds for linux-x64, macos-x64, macos-arm64, win-x64.

---

## Migration Strategy

### Approach A: Axum Embedded in Tauri (Recommended First Step)

**Concept:** Run the existing Axum server as a background task within the Tauri process. The WebView continues talking to `localhost` via HTTP/SSE.

```
┌──────────────────────────────────┐
│         Tauri Application        │
│                                  │
│  ┌────────────┐  HTTP   ┌─────┐ │
│  │  React SPA │ ──────> │Axum │ │
│  │  (WebView) │ <────── │Tokio│ │
│  │            │   SSE   │     │ │
│  └────────────┘         └─────┘ │
│                                  │
│  System tray · Auto-update       │
│  Native menus · Notifications    │
└──────────────────────────────────┘
```

**Changes required:**
- New `src-tauri/` directory with Tauri config
- `main.rs` starts Axum server on a random port, then opens WebView pointing to it
- Frontend reads server URL from Tauri instead of hardcoded `localhost:51767`
- Bundle frontend assets with Tauri (already done for current binary)

**Effort:** ~1-2 weeks for a functional MVP

**Pros:**
- Reuses 95%+ of existing code without modification
- Immediately gains: system tray, auto-update, native window, no terminal needed
- Low risk — if anything breaks, it's only the thin wrapper

**Cons:**
- Still uses HTTP locally (minor overhead vs IPC)
- Still opens a port on localhost (though Tauri can restrict access)

---

### Approach B: Full Tauri Commands Migration (Long-term)

**Concept:** Convert each REST endpoint to a `#[tauri::command]` and replace SSE with Tauri Events.

```
┌──────────────────────────────────┐
│         Tauri Application        │
│                                  │
│  ┌────────────┐  IPC   ┌──────┐ │
│  │  React SPA │ ─────> │Rust  │ │
│  │  (WebView) │ <───── │Core  │ │
│  │            │ Events │      │ │
│  └────────────┘        └──────┘ │
└──────────────────────────────────┘
```

**Changes required:**
- Convert ~40 REST endpoints → `#[tauri::command]` functions
- Replace SSE client (`EventSource`) → Tauri event listeners (`listen()`)
- Replace `fetch()` calls → `invoke()` calls in frontend
- Refactor SSE emitter to use `app.emit()` instead of HTTP streaming
- Keep Axum alive **only** for MCP server (external agents need HTTP)

**Effort:** ~3-4 weeks

**Pros:**
- Native IPC (no HTTP overhead, no open port)
- Better security model (no localhost exposure)
- Cleaner architecture long-term

**Cons:**
- Significant refactoring of transport layer
- Must maintain HTTP server anyway for MCP
- Risk of introducing bugs during migration

---

## Key Technical Considerations

### What Works Out of the Box

| Feature | Notes |
|---|---|
| **SQLite (rusqlite)** | Works identically inside Tauri |
| **Process spawning** | `tokio::process::Command` works fine; Tauri also provides `tauri::api::process::Command` |
| **Git operations** | Pure CLI spawning, no changes needed |
| **Encryption (AES-GCM)** | Pure Rust, no OS dependency |
| **File system access** | Tauri has fs plugin, but direct Rust fs works too |
| **Cross-platform paths** | Already handled in `config.rs` |

### What Needs Attention

| Challenge | Severity | Details |
|---|---|---|
| **SSE → Tauri Events** | Medium | Current SSE has history replay (1500 events/task). Need equivalent buffering with Tauri events |
| **MCP Server** | High | External agents (Claude Code, etc.) connect via HTTP. **Must keep an HTTP server running** for MCP even in Tauri |
| **Auth/CORS** | Positive | Disappears in Tauri — simplifies code significantly |
| **Auto-update** | Positive | Tauri's updater plugin replaces current npm + R2 manifest system |
| **Installer bundling** | Medium | Tauri generates .msi, .dmg, .deb, .AppImage — different from current ZIP distribution |
| **CI/CD pipeline** | Medium | Need `tauri-action` GitHub Action instead of current `cargo build` matrix |
| **Window management** | Positive | Native window chrome, minimize to tray, focus behavior |

### MCP Server Constraint

This is the most important architectural decision. The MCP endpoint (`/api/mcp`) **must remain HTTP-accessible** because external AI agents (Claude Code, Codex, etc.) connect to it over the network. Options:

1. **Hybrid approach**: Tauri app embeds Axum, serves only `/api/mcp` over HTTP. All other communication via IPC.
2. **Full Axum embedded**: Keep the full HTTP server (Approach A) — simplest.
3. **Separate MCP process**: Extract MCP into a lightweight standalone server — over-engineered.

**Recommendation:** Option 2 (Approach A) initially, evolve to Option 1 if needed.

---

## Distribution Comparison

| Aspect | Current (npm CLI) | Tauri App |
|---|---|---|
| Install | `npx ai-agent-board` | Download .msi/.dmg/.deb |
| Update | Manual re-run or `--clear-cache` | Built-in auto-updater |
| Launch | Terminal command | Desktop icon / system tray |
| UX | Opens browser tab | Native window |
| Size | ~10-15MB binary + frontend | ~15-25MB installer |
| Dependencies | Node.js (for npx) | None (self-contained) |
| Tray icon | No | Yes |
| Notifications | Browser only | OS-native |

---

## Recommended Roadmap

### Phase 1: Tauri Shell (1-2 weeks)
- Initialize Tauri 2.x project in `packages/tauri/`
- Embed existing Axum server as background Tokio task
- WebView loads from embedded Axum server
- System tray with start/stop/open
- Basic auto-updater

### Phase 2: Native Enhancements (1 week)
- OS notifications for task completion/errors
- Deep links (`agent-board://task/123`)
- Native file dialogs for repo selection
- Startup on login (optional)

### Phase 3: IPC Migration (3-4 weeks, optional)
- Gradually convert high-frequency endpoints to `#[tauri::command]`
- Replace SSE with Tauri events for real-time updates
- Keep HTTP only for MCP server
- Frontend feature-flag to switch between HTTP and IPC

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| WebView inconsistencies across OS | Medium | Tauri 2.x uses system WebView (Edge/WebKit). Test on all platforms |
| Increased binary size | Low | Current binary is ~10MB. Tauri adds ~5-10MB for WebView glue |
| macOS code signing | Medium | Required for distribution. Needs Apple Developer account ($99/yr) |
| Windows SmartScreen warnings | Medium | Code signing certificate needed (~$200/yr) or build reputation |
| Linux WebView availability | Low | webkit2gtk is standard on modern distros |

---

## Conclusion

The migration to Tauri is **highly feasible** and strategically sound. The existence of `server-rs` eliminates the biggest barrier (rewriting backend in Rust). The recommended path is:

1. **Start with Approach A** (Axum embedded) — low risk, high reward
2. **Ship a Tauri MVP** alongside the existing CLI distribution
3. **Migrate to IPC incrementally** only if HTTP overhead becomes a concern
4. **Keep the CLI** as an alternative for headless/CI environments

The project is in an ideal position because the hard work (Rust backend) is already done.
