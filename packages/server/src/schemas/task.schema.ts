/**
 * Task schemas for the server package.
 * Re-exports from @dash-agent/shared for consistency.
 */
export {
  TASK_STATUSES,
  TaskStatusSchema,
  TaskSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  GenerateSpecRequestSchema,
  GenerateSpecResponseSchema,
  UpdateSpecRequestSchema,
  ApproveSpecRequestSchema,
  ApproveSpecResponseSchema,
  type TaskStatus,
  type Task,
  type CreateTaskInput,
  type UpdateTaskInput,
  type GenerateSpecRequest,
  type GenerateSpecResponse,
  type UpdateSpecRequest,
  type ApproveSpecRequest,
  type ApproveSpecResponse,
} from '@dash-agent/shared';
