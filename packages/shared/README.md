# @agent-board/shared

Shared types and Zod schemas for Agent Board frontend and backend.

## Installation

This package is automatically available via npm workspaces. No installation required.

## Usage

### Import everything from the main entry point

```typescript
import {
  // Schemas
  CreateTaskSchema,
  TaskStatusSchema,
  FeedbackSchema,

  // Types
  Task,
  TaskStatus,
  CreateTaskInput,
  LogEntry,
  SSEEvent,

  // Constants
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  ERROR_CODES,

  // Utilities
  getAvailableActionsForStatus,
  isTerminalStatus,
  isActiveStatus,
} from '@agent-board/shared';
```

### Import from specific submodules

```typescript
// Only schemas
import { CreateTaskSchema, TaskSchema } from '@agent-board/shared/schemas';

// Only types
import { LogEntry, SSEEvent } from '@agent-board/shared/types';
```

## Task Status Flow

```
backlog -> planning -> in_progress -> awaiting_review -> approved -> pr_created
                                                                         |
                         +-----------------------------------------------+
                         |
                         v
                  changes_requested  <-- POST /tasks/:id/request-changes
                         |                    (with reviewer feedback)
                         v
                   in_progress (agent works in same worktree)
                         |
                         v
                  awaiting_review
                         |
                         v
                   push (PR updates automatically)
                         |
                         v
                       done  <-- when PR is merged
```

## Available Exports

### Schemas (Zod)

- `TaskStatusSchema` - Validates task status values
- `TaskSchema` - Complete task entity validation
- `CreateTaskSchema` - Validates task creation input
- `UpdateTaskSchema` - Validates task update input
- `FeedbackSchema` - Validates feedback input
- `RequestChangesSchema` - Validates change request input
- `FileChangeSchema` - Validates file change objects
- `ApiErrorSchema` - Validates API error responses

### Types (TypeScript)

- `Task` - Task entity type
- `TaskStatus` - Task status union type
- `CreateTaskInput` - Task creation input type
- `UpdateTaskInput` - Task update input type
- `LogEntry` - Log entry type for SSE
- `SSEEvent` - Union of all SSE event types
- `FileChange` - File change type
- `ApiError` - API error type
- `ExecuteResponse`, `ApproveResponse`, etc. - Action response types

### Constants

- `TASK_STATUSES` - Array of all valid task statuses
- `TASK_STATUS_LABELS` - Human-readable labels for statuses
- `TASK_STATUS_COLORS` - Tailwind CSS classes for status badges
- `ERROR_CODES` - Standard error codes

### Utilities

- `getAvailableActionsForStatus(status)` - Get available actions for a task status
- `isTerminalStatus(status)` - Check if status is terminal (done/failed)
- `isActiveStatus(status)` - Check if task is being actively worked on
- `requiresUserAction(status)` - Check if task needs user attention

## Building

```bash
npm run build -w @agent-board/shared
```

## Development

When making changes to this package, remember to rebuild before testing in frontend/backend:

```bash
npm run build:shared
```
