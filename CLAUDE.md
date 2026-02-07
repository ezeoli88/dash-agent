# dash-agent - Project Instructions for Claude

## Project Overview
Dashboard web para gestionar tareas de un agente IA autonomo. Permite crear tareas, monitorear su ejecucion en tiempo real via SSE, enviar feedback al agente, revisar cambios (diff) y aprobar la creacion de PRs.

## Project Structure
```
dash-agent/
├── packages/
│   ├── cli/              # CLI entry point (future - dash-agent command)
│   ├── dashboard/        # Next.js 16.1 frontend application
│   ├── server/           # Express backend API
│   └── shared/           # Shared types and schemas
├── package.json          # Root workspace
├── CLAUDE.md
└── integration-plan.md   # npm publish plan
```

## Agent Usage Rules

### Process Cleanup (MANDATORY)
Sub-agents MUST NOT leave background processes running (e.g., `npm run dev`, `npm run build`). After finishing work:
- Do NOT start dev servers (`npm run dev`) unless explicitly asked by the user
- If a dev server was started for testing, kill it before finishing
- Use `npm run build` (not `npm run dev`) to verify compilation
- The user should be the only one starting/stopping dev servers

### Frontend Development (MANDATORY)
When working on ANY files inside the `packages/dashboard/` directory, you MUST use the `nextjs-eng` sub-agent via the Task tool. This includes:
- Creating new components
- Editing existing components
- Fixing bugs in frontend code
- Adding new pages or routes
- Modifying styles or layouts
- Installing dependencies
- Any React/Next.js related work

Example:
```
Task tool with subagent_type: "nextjs-eng"
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
- Any Python/Node.js backend work

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

## Tech Stack

### Frontend (packages/dashboard/)
- **Next.js 16.1** with App Router
- **React 19.2**
- **TypeScript** (strict mode)
- **Tailwind CSS 4**
- **shadcn/ui** for UI components
- **TanStack Query v5** for server state
- **Zustand** for client state
- **next-themes** for dark mode

### Backend (packages/server/)
- **Express** with TypeScript
- **sql.js** for SQLite database
- **OpenAI** for AI agent
- **Octokit** for GitHub integration

### Shared (packages/shared/)
- **Zod** for schemas and validation
- Shared types for frontend and backend

### Development Server
- Dashboard runs on **port 3003** (port 3000 is occupied)
- Server runs on **port 3000**
- Command: `npm run dev` (from root)

## Implementation Plan
See `packages/dashboard/frontend-plan.md` for the complete frontend implementation plan with phases:
- Phase 1: Setup - COMPLETED
- Phase 2: UI Components - COMPLETED
- Phase 3: Layout and Navigation - COMPLETED
- Phase 4: Task List - COMPLETED
- Phase 5: Task Detail - COMPLETED
- Phase 6: Create Task - COMPLETED
- Phase 7: Task Actions - COMPLETED
- Phase 8: Real-time Logs (SSE) - COMPLETED
- Phase 9: Diff Viewer - COMPLETED
- Phase 10: Feedback - COMPLETED
- Phase 11: Polish - COMPLETED
- Phase 12: Refactoring
- Phase 13: Testing

See `cli-integration-plan.md` for the Multi-Agent CLI integration plan.
See `integration-plan.md` for the npm publish plan.

## Plan Tracking (MANDATORY)
When implementing phases from any plan file (e.g., `cli-integration-plan.md`, `frontend-plan.md`):
- **After completing each sub-task**, update the plan file marking it with ✅
- **After completing a full phase**, mark the phase header with ✅ COMPLETADA
- **Update the file status table** (Archivos Críticos) with ✅ for completed items
- This ensures progress is always visible and trackable across sessions

## Key Directories

### Dashboard (packages/dashboard/)
- `packages/dashboard/src/app/` - Next.js App Router pages
- `packages/dashboard/src/components/ui/` - shadcn/ui components
- `packages/dashboard/src/components/layout/` - Layout components (Header, Sidebar, etc.)
- `packages/dashboard/src/components/shared/` - Shared components (StatusBadge, EmptyState, etc.)
- `packages/dashboard/src/features/tasks/` - Task feature (components, hooks, stores, types)
- `packages/dashboard/src/lib/` - Utilities (api-client, utils)
- `packages/dashboard/src/stores/` - Zustand stores

### Server (packages/server/)
- `packages/server/src/` - Backend source code
- `packages/server/src/routes/` - API routes
- `packages/server/src/services/` - Business logic services
- `packages/server/src/db/` - Database layer

### Shared (packages/shared/)
- `packages/shared/src/schemas/` - Zod schemas
- `packages/shared/src/types/` - TypeScript types

## Environment Variables
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:3000
```

## npm Workspace Commands
```bash
# Install all dependencies
npm install

# Build all packages (order matters: shared -> server -> dashboard)
npm run build

# Development mode (runs server and dashboard concurrently)
npm run dev

# Build specific packages
npm run build:shared
npm run build:server
npm run build:dashboard

# Run specific package in dev mode
npm run dev:server
npm run dev:dashboard
```
