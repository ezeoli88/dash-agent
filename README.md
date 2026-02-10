<div align="center">

# ai-agent-board

**A visual dashboard for managing autonomous AI coding agents.**

Kanban board &bull; Real-time logs &bull; Diff review &bull; One-click PRs

[![npm version](https://img.shields.io/npm/v/ai-agent-board?color=blue&label=npm)](https://www.npmjs.com/package/ai-agent-board)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)]()

</div>

---

## What is agent-board?

`agent-board` is a local web dashboard that lets you **create tasks**, **assign them to AI coding agents**, and **monitor everything** from a Kanban-style interface — real-time execution logs, code diffs, and automatic PR creation on GitHub.

It works with the coding CLIs you already have installed:

| Agent | CLI Command | Status |
|-------|-------------|--------|
| **Claude Code** | `claude` | Supported |
| **Codex** | `codex` | Supported |
| **Copilot** | `copilot` | Supported |
| **Gemini** | `gemini` | Supported |

## Quick Start

```bash
npx ai-agent-board
```

That's it. The dashboard opens automatically in your browser. No configuration files, no Docker, no database setup.

> **Requirements:** Node.js >= 18. At least one supported AI coding CLI installed and authenticated.

### CLI Options

```
npx ai-agent-board [options]

  --port <number>   Server port (default: auto-detect)
  --no-open         Don't open browser automatically
  --clear-cache     Delete cached binary and re-download
  --version, -v     Show version
  --help, -h        Show help
```

## Features

### Kanban Board

Manage tasks across stages: **To Do** → **In Progress** → **In Review** → **Done**. Each task card shows its current status, assigned agent, and progress at a glance.

### Two-Agent Workflow

Tasks go through a structured pipeline:

```
 You describe a task        PM Agent generates        You review & edit        Dev Agent writes
 in natural language   ───▶  a detailed spec    ───▶   the spec          ───▶  the code
                                                                                    │
                                                                                    ▼
                                                                            Review diff & merge
```

1. **Create task** — describe what you need in plain language
2. **PM Agent** — generates a detailed technical specification
3. **Review spec** — edit, regenerate, or approve
4. **Dev Agent** — implements the approved specification
5. **Review & merge** — inspect the diff, then create a PR

### Real-time Execution Logs

Watch your AI agent work in real-time via Server-Sent Events (SSE). Every step, every file change, streamed directly to your browser.

### Diff Viewer

Review all code changes before they go anywhere. Inline diff viewer shows exactly what the agent modified, added, or removed.

### GitHub Integration

Create Pull Requests directly from the dashboard. Review PR comments, request changes, and track merge status — all without leaving the board.

### Dark Mode

Full light and dark theme support. Automatically follows your system preference.

## How It Works

`agent-board` runs a lightweight local server that:

1. **Detects** which AI coding CLIs you have installed (Claude Code, Codex, Copilot, Gemini)
2. **Orchestrates** task execution by invoking the CLI agents in sandboxed worktrees
3. **Streams** real-time output to the browser via SSE
4. **Manages** code changes with git worktrees — your main branch stays untouched
5. **Creates** Pull Requests via the GitHub API when you approve changes

All data is stored in a local SQLite database. Nothing leaves your machine except the API calls your AI coding CLIs already make and the GitHub API calls for PR creation.

## Task Lifecycle

| Status | Description | Board Column |
|--------|-------------|:------------:|
| `draft` | Task created, awaiting spec generation | To Do |
| `refining` | PM Agent generating specification | To Do |
| `pending_approval` | Spec ready for your review | To Do |
| `approved` | Spec approved, Dev Agent starting | In Progress |
| `coding` | Dev Agent working | In Progress |
| `awaiting_review` | Changes ready for your review | In Review |
| `pr_created` | Pull Request created on GitHub | In Review |
| `done` | PR merged | Done |
| `failed` | Error during execution | — |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ai-agent-board                     │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Dashboard    │  │   Server     │  │  Shared    │ │
│  │  React SPA   │◄─┤  Express API │  │  Types &   │ │
│  │  Vite 7      │  │  Bun runtime │  │  Schemas   │ │
│  │  TanStack    │  │  SQLite      │  │  Zod       │ │
│  │  Tailwind 4  │  │  SSE         │  │            │ │
│  └──────────────┘  └──────┬───────┘  └────────────┘ │
│                           │                          │
│                    ┌──────┴───────┐                   │
│                    │  CLI Runner  │                   │
│                    │  Orchestrator│                   │
│                    └──────┬───────┘                   │
│                           │                          │
│              ┌────────────┼────────────┐             │
│              ▼            ▼            ▼             │
│          claude        codex       gemini    ...     │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Router & Query, Zustand |
| **Backend** | Express, Bun, TypeScript, sql.js (SQLite via WASM), SSE |
| **Shared** | Zod schemas, TypeScript types, npm workspaces |
| **CLI** | Lightweight npx wrapper, platform-specific binary distribution |

### Key Design Decisions

- **SSE over WebSockets** — unidirectional streaming is sufficient for logs; simpler, works with any proxy/CDN, and browsers auto-reconnect
- **SQLite (WASM)** — zero-config embedded database, no external server needed, cross-platform via WebAssembly
- **Git worktrees** — agent works in isolated worktrees so your main branch is never at risk
- **npx distribution** — single command to run, binary auto-downloaded and cached per platform

## Development

```bash
# Clone and install
git clone https://github.com/ezeoli88/dash-agent.git
cd dash-agent
npm install

# Run in development mode (server + dashboard)
npm run dev

# Build all packages
npm run build

# Build specific packages
npm run build:shared
npm run build:server
npm run build:dashboard
```

The dashboard runs on **port 3003** (Vite dev server) and the server on **port 3000** (Bun). Vite proxies `/api` requests to the server automatically.

### Environment Variables

Create `packages/server/.env`:

```env
# Required: for AI agent capabilities
OPENAI_API_KEY=sk-...

# Optional: for GitHub PR creation
GITHUB_TOKEN=ghp_...

# Optional: server configuration
PORT=3000
DATABASE_PATH=./data/dash-agent.db
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE) &copy; [Ezequiel Olivera](https://github.com/ezeoli88)
