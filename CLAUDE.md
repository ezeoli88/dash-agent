# dash-agent - Project Instructions for Claude

## Critical Thinking (MANDATORY)
Before implementing any request, you MUST:
- **Evaluate tradeoffs**: Analyze pros/cons of the approach, consider alternatives, and mention what could go wrong.
- **Be critical**: If an idea has flaws, edge cases, or better alternatives, say so directly. Do not just agree and implement blindly.
- **Ask when in doubt**: If requirements are ambiguous or you see potential issues, raise them before writing code. It's better to debate first than to rewrite later.
- **Challenge assumptions**: If the user's approach could cause problems (performance, UX, maintainability), flag it explicitly.

## Project Overview
Dashboard web para gestionar tareas de un agente IA autonomo. Permite crear tareas, monitorear su ejecucion en tiempo real via SSE, enviar feedback al agente, revisar cambios (diff) y aprobar la creacion de PRs.

## Project Structure
```
dash-agent/
├── packages/
│   ├── cli/              # npx agent-board CLI wrapper
│   ├── dashboard/        # Vite + React SPA frontend
│   ├── server/           # Bun + Express backend API
│   └── shared/           # Shared types and schemas
├── package.json          # Root workspace
└── CLAUDE.md
```

## Agent Usage Rules

### Process Cleanup (MANDATORY)
Sub-agents MUST NOT leave background processes running (e.g., `npm run dev`, `npm run build`). After finishing work:
- Do NOT start dev servers (`npm run dev`) unless explicitly asked by the user
- If a dev server was started for testing, kill it before finishing
- Use `npm run build` (not `npm run dev`) to verify compilation
- The user should be the only one starting/stopping dev servers

### Frontend Development (MANDATORY)
When working on ANY files inside the `packages/dashboard/` directory, you MUST use the `frontend-engineer` sub-agent via the Task tool. This includes:
- Creating new components
- Editing existing components
- Fixing bugs in frontend code
- Adding new pages or routes
- Modifying styles or layouts
- Installing dependencies
- Any React/Vite/TanStack Router related work

Example:
```
Task tool with subagent_type: "frontend-engineer"
```

### Backend Development (MANDATORY)
When working on ANY files inside the `packages/server/` directory, you MUST use the `ai-engineer` sub-agent via the Task tool. This includes:
- Creating new API endpoints
- Editing existing endpoints
- Fixing bugs in backend code
- Implementing SSE (Server-Sent Events)
- Database operations
- Authentication/Authorization
- AI/LLM integrations
- Any Bun/Express backend work

Example:
```
Task tool with subagent_type: "ai-engineer"
```

### Fullstack Integration (MANDATORY)
When working on tasks that span BOTH `packages/dashboard/` and `packages/server/` directories, you MUST use the `fullstack-ts-eng` sub-agent via the Task tool. This includes:
- Creating API endpoints with their corresponding frontend consumers
- Setting up typed API clients
- Configuring TanStack Query for server state management
- Creating forms with shared Zod validation (client and server)
- Implementing end-to-end type safety
- Any task requiring coordination between frontend and backend layers

Example:
```
Task tool with subagent_type: "fullstack-ts-eng"
```

### CLI Integration Cross-Check (MANDATORY)
When modifying CLI-specific code in `packages/server/src/agent/cli-runner.ts` or `packages/server/src/services/agent-detection.service.ts`, you MUST verify that changes for one CLI type do NOT affect others. The system supports multiple CLI agents (claude-code, codex, copilot, gemini), each with:
- **Independent command building** in `buildCLICommand()` (separate `case` per agent)
- **Independent output parsing** in `parseOutputLine()` (separate parser per agent)
- **Independent model lists** in `agent-detection.service.ts`

After any CLI-specific change:
1. Verify the modified `case` is self-contained (no shared variables/constants affected)
2. Confirm other CLI cases remain untouched
3. Check that output parser routing in `parseOutputLine()` correctly maps each agent type
4. Run `npm run build` to verify compilation

## Tech Stack

### Frontend (packages/dashboard/)
- **Vite 7** as bundler
- **React 19.2** SPA
- **TanStack Router** for code-based routing
- **TypeScript** (strict mode)
- **Tailwind CSS 4**
- **shadcn/ui** for UI components
- **TanStack Query v5** for server state
- **Zustand** for client state
- **next-themes** for dark mode

### Backend (packages/server/)
- **Bun** as runtime (replaces Node.js/tsx)
- **Express** with TypeScript
- **sql.js** for SQLite database
- **OpenAI** for AI agent
- **Octokit** for GitHub integration
- All routes prefixed with `/api/` (e.g., `/api/tasks`, `/api/repos`)
- Serves static frontend files + SPA fallback in production
- `bin.ts` entry point for `bun build --compile` standalone binary

### CLI (packages/cli/)
- npm package: `ai-agent-board` (run with `npx ai-agent-board`)
- Downloads platform-specific ZIP from Cloudflare R2, verifies SHA256, extracts binary + public/ + sql-wasm.wasm
- Caches binary in `~/.cache/agent-board/v{version}/{platform}/`

### Shared (packages/shared/)
- **Zod** for schemas and validation
- Shared types for frontend and backend

### Development
- Dashboard runs on **port 3003** (Vite dev server)
- Server runs on **port 3000** (Bun)
- Vite proxies `/api` requests to server in dev mode
- Command: `npm run dev` (from root, runs both concurrently)

## Key Directories

### Dashboard (packages/dashboard/)
- `packages/dashboard/src/app/` - Page components
- `packages/dashboard/src/components/ui/` - shadcn/ui components
- `packages/dashboard/src/components/layout/` - Layout components (Header, Sidebar, etc.)
- `packages/dashboard/src/components/shared/` - Shared components (StatusBadge, EmptyState, etc.)
- `packages/dashboard/src/features/tasks/` - Task feature (components, hooks, stores, types)
- `packages/dashboard/src/lib/` - Utilities (api-client, utils)
- `packages/dashboard/src/stores/` - Zustand stores

### Server (packages/server/)
- `packages/server/src/index.ts` - Express app + static serving + SPA fallback
- `packages/server/src/bin.ts` - Binary entry point (`bun build --compile`)
- `packages/server/src/routes/` - API routes (all under `/api/`)
- `packages/server/src/services/` - Business logic services
- `packages/server/src/db/` - Database layer

### CLI (packages/cli/)
- `packages/cli/bin/cli.js` - npx entry point (downloads + runs binary)

### Shared (packages/shared/)
- `packages/shared/src/schemas/` - Zod schemas
- `packages/shared/src/types/` - TypeScript types

## Environment Variables
```
VITE_API_BASE_URL=http://localhost:3000
```

## npm Workspace Commands
```bash
# Install all dependencies
npm install

# Build all packages (order matters: shared -> server -> dashboard)
npm run build

# Development mode (runs server + dashboard concurrently)
npm run dev

# Build specific packages
npm run build:shared
npm run build:server
npm run build:dashboard

# Run specific package in dev mode
npm run dev:server    # bun run --watch
npm run dev:dashboard # vite

# Build standalone binaries (requires Bun, cross-compiles from any platform)
npm run build:binary:linux-x64    # Linux x64
npm run build:binary:macos-x64    # macOS x64
npm run build:binary:macos-arm64  # macOS ARM64
npm run build:binary:win-x64      # Windows x64
```

## Release & Publishing Pipeline

### Overview
Releases are automated via GitHub Actions (`.github/workflows/release.yml`). Pushing a semver tag triggers:
1. **build** - Compiles 4 platform binaries, bundles frontend assets + sql-wasm.wasm, creates ZIPs, generates manifest.json with SHA256 checksums
2. **upload-r2** - Uploads ZIPs + manifest to Cloudflare R2 (`agent-board` bucket)
3. **publish-npm** - Publishes `ai-agent-board` to npm via OIDC trusted publishing (no tokens needed)

### How to Release
When the user asks to release or deploy to npm, follow these steps:

1. **Bump version** in `packages/cli/package.json` (this is the npm package version)
2. **Commit** the version bump
3. **Tag and push:**
   ```bash
   git tag v{VERSION}
   git push origin main --tags
   ```
4. **Monitor** the workflow:
   ```bash
   gh run list -w release.yml --limit 3
   gh run view {RUN_ID}           # check status
   gh run view {RUN_ID} --log-failed  # if something fails
   ```
5. **Verify** after all 3 jobs pass:
   ```bash
   npx ai-agent-board@latest
   ```

### Version Bumping Rules
- `packages/cli/package.json` version = release version (this is what npm publishes)
- Tag must match: `v{version}` (e.g., `v0.2.0`)
- Root `package.json` version is informational only (monorepo version)

### If a Release Fails
- **build fails**: Check compilation errors, fix, commit, delete tag, re-tag and push
- **upload-r2 fails**: Check R2 secrets in GitHub repo settings
- **publish-npm fails**:
  - "already published": Version was already published - bump version and re-release
  - OIDC errors: Check trusted publisher config at npmjs.com/package/ai-agent-board/access

### Deleting and Re-creating a Tag
If you need to re-release the same version (e.g., after fixing a build issue):
```bash
git push origin --delete v{VERSION}   # delete remote tag
git tag -d v{VERSION}                 # delete local tag
# ... fix and commit ...
git tag v{VERSION}                    # re-create tag
git push origin main --tags           # push
```

### Infrastructure
- **Cloudflare R2 bucket**: `agent-board` (public URL: `https://pub-3e8e5cea43b3427fa24870c7a04e46dd.r2.dev`)
- **npm package**: `ai-agent-board` (OIDC trusted publishing, no token rotation needed)
- **GitHub secrets**: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
