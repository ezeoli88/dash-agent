<div align="center">

# ai-agent-board

**A visual dashboard for managing autonomous AI coding agents.**

Kanban board &bull; Real-time chat &bull; Diff review &bull; One-click PRs

[![npm version](https://img.shields.io/npm/v/ai-agent-board?color=blue&label=npm)](https://www.npmjs.com/package/ai-agent-board)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)]()

</div>

---

<img width="1919" height="912" alt="Captura de pantalla 2026-02-11 122853" src="https://github.com/user-attachments/assets/50ef263e-56f0-4e8d-8adf-a19340853c18" />


## What is agent-board?

`agent-board` is a local web dashboard that lets you **create tasks**, **assign them to AI coding agents**, and **monitor everything** from a Kanban-style interface — real-time execution logs, live chat with the agent, code diffs, and automatic PR creation.

It auto-detects the coding CLIs you already have installed:

| Agent | Command | Notes |
|-------|---------|-------|
| **Claude Code** | `claude` | Requires Anthropic API key or CLI login |
| **Codex** | `codex` | Requires OpenAI API key or CLI login |
| **Gemini** | `gemini` | Requires Google API key or CLI login |
| **OpenRouter** | _(API)_ | Use any model via OpenRouter API key |

> No CLI installed? Use **OpenRouter** to access 100+ models through the API without any CLI setup.

## Quick Start

```bash
npx ai-agent-board
```

That's it. The dashboard opens automatically in your browser. No configuration files, no Docker, no database setup.

> **Requirements:** Node.js >= 18. At least one supported AI coding CLI installed, or an OpenRouter API key.

### CLI Options

```
npx ai-agent-board [options]

  --port <number>   Server port (default: 51767)
  --no-open         Don't open browser automatically
  --clear-cache     Delete cached binary and re-download
  --version, -v     Show version
  --help, -h        Show help
```

## Features

### Kanban Board

Manage tasks across stages: **To Do** &rarr; **In Progress** &rarr; **In Review** &rarr; **Done**. Each task card shows its current status, assigned agent, and progress at a glance.

### Task Workflow

Describe what you need, and the agent handles the rest:

```
 You describe a task        Agent works in an         You review the          Approve & create
 in natural language   ───▶  isolated worktree   ───▶  code changes    ───▶   a Pull Request
```

1. **Create task** &mdash; describe what you need in plain language
2. **Agent codes** &mdash; the AI agent works in an isolated git worktree, with full context of your repo's stack and conventions
3. **Chat in real-time** &mdash; send feedback, redirect the approach, or approve the agent's plan mid-execution
4. **Review & merge** &mdash; inspect the diff, then create a PR directly from the dashboard

### Real-time Chat

Chat with the agent while it works. Send feedback, ask questions, or redirect its approach &mdash; all streamed live via SSE. The agent can present an implementation plan for your approval before writing any code.

### Diff Viewer

Review all code changes before they go anywhere. Inline diff viewer shows exactly what the agent modified, added, or removed.

### Git Integration

- **GitHub** &mdash; create PRs, review comments, request changes, and track merge status
- **GitLab** &mdash; connect via Personal Access Token
- **Merge conflict resolution** &mdash; open VS Code directly at the worktree to resolve conflicts

### Repository Management

- Scan your filesystem to discover local git repositories
- Auto-detect tech stack and conventions per repo
- Track learned patterns across tasks for smarter specs

### Credential Management

API keys and tokens are stored locally with encryption. Connect your providers from the Settings page &mdash; no `.env` files needed.

### Dark Mode

Full light and dark theme support. Automatically follows your system preference.

## How It Works

`agent-board` runs a lightweight local server that:

1. **Detects** which AI coding CLIs you have installed (Claude Code, Codex, Gemini) or uses your OpenRouter API key
2. **Assigns** a coding agent to work on your task in an isolated git worktree
3. **Streams** real-time output, chat messages, and tool activity to the browser via SSE
4. **Isolates** code changes in git worktrees &mdash; your main branch is never at risk
5. **Creates** Pull Requests via the GitHub/GitLab API when you approve changes

All data is stored in a local SQLite database. Nothing leaves your machine except the API calls your AI coding CLIs already make and the git provider API calls for PR creation.

## Task Lifecycle

| Status | Description | Board Column |
|--------|-------------|:------------:|
| `draft` | Task created, not yet started | To Do |
| `coding` | Agent working on implementation | In Progress |
| `plan_review` | Agent proposed a plan, waiting for your approval | In Progress |
| `review` | Changes ready for review / PR created | In Review |
| `merge_conflicts` | Merge conflicts detected, needs resolution | In Review |
| `changes_requested` | You requested changes on the PR | In Review |
| `done` | PR merged, task complete | Done |
| `canceled` | Canceled by user or PR closed | &mdash; |
| `failed` | Error during execution | &mdash; |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     ai-agent-board                        │
│                                                           │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │  Dashboard    │  │    Server     │  │    Shared     │  │
│  │  React 19     │◄─┤  Express API  │  │  Zod Schemas  │  │
│  │  Vite 7       │  │  Bun runtime  │  │  TypeScript   │  │
│  │  TanStack     │  │  SQLite WASM  │  │  Types        │  │
│  │  Tailwind 4   │  │  SSE + Chat   │  │               │  │
│  └──────────────┘  └───────┬───────┘  └───────────────┘  │
│                            │                              │
│               ┌────────────┴────────────┐                 │
│               │    Agent Orchestrator   │                 │
│               │   Task ──▶ AI Agent    │                 │
│               └────────────┬────────────┘                 │
│                            │                              │
│            ┌───────────┬───┴───┬────────────┐             │
│            ▼           ▼       ▼            ▼             │
│        claude       codex   gemini     OpenRouter         │
└──────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Router & Query, Zustand |
| **Backend** | Express, Bun, TypeScript, sql.js (SQLite via WASM), SSE |
| **Shared** | Zod schemas, TypeScript types, npm workspaces |
| **CLI** | Lightweight npx wrapper, platform-specific binary distribution via Cloudflare R2 |

### Key Design Decisions

- **SSE over WebSockets** &mdash; unidirectional streaming is sufficient for logs and chat; simpler, works with any proxy, and browsers auto-reconnect
- **SQLite (WASM)** &mdash; zero-config embedded database, no external server needed, cross-platform via WebAssembly
- **Git worktrees** &mdash; agent works in isolated worktrees so your main branch is never at risk
- **npx distribution** &mdash; single command to run, binary auto-downloaded and cached per platform

## Development

```bash
# Clone and install
git clone https://github.com/ezeoli88/dash-agent.git
cd dash-agent
npm install

# Run in development mode (server + dashboard)
npm run dev

# Build all packages (shared → server → dashboard)
npm run build

# Build specific packages
npm run build:shared
npm run build:server
npm run build:dashboard

# Build standalone binaries
npm run build:binary:linux-x64
npm run build:binary:macos-x64
npm run build:binary:macos-arm64
npm run build:binary:win-x64
```

The dashboard dev server runs on **port 3003** and the backend on **port 51767**. Vite proxies `/api` requests to the server automatically.

### Environment Variables

Most configuration is handled through the **Settings** page in the dashboard. Environment variables are optional and mainly useful for development:

```env
PORT=51767                          # Server port (default: 51767)
DATABASE_PATH=./data/agent-board.db # SQLite database path
LOG_LEVEL=info                      # debug | info | warn | error
```

AI keys and git tokens are managed through the dashboard UI with encrypted local storage &mdash; no `.env` file needed for normal usage.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE) &copy; [Ezequiel Olivera](https://github.com/ezeoli88)
