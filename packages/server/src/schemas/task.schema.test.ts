import { describe, it, expect } from 'vitest';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  GenerateSpecRequestSchema,
  UpdateSpecRequestSchema,
  ApproveSpecRequestSchema,
  TaskStatusSchema
} from '../schemas/task.schema.js';

describe('Task Schemas', () => {
  describe('CreateTaskSchema', () => {
    it('should validate a valid create task input', () => {
      const validInput = {
        repository_id: '123e4567-e89b-12d3-a456-426614174000',
        user_input: 'Create a login page',
      };

      const result = CreateTaskSchema.safeParse(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repository_id).toBe(validInput.repository_id);
        expect(result.data.user_input).toBe(validInput.user_input);
      }
    });

    it('should reject input without repository_id', () => {
      const invalidInput = {
        user_input: 'Create a login page',
      };

      const result = CreateTaskSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('repository_id'))).toBe(true);
      }
    });

    it('should reject input without user_input', () => {
      const invalidInput = {
        repository_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = CreateTaskSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('user_input'))).toBe(true);
      }
    });

    it('should reject invalid UUID for repository_id', () => {
      const invalidInput = {
        repository_id: 'not-a-uuid',
        user_input: 'Create a login page',
      };

      const result = CreateTaskSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('repository_id'))).toBe(true);
      }
    });

    it('should accept optional title and description', () => {
      const inputWithOptional = {
        repository_id: '123e4567-e89b-12d3-a456-426614174000',
        user_input: 'Create a login page',
        title: 'Custom Title',
        description: 'Custom Description',
      };

      const result = CreateTaskSchema.safeParse(inputWithOptional);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Custom Title');
        expect(result.data.description).toBe('Custom Description');
      }
    });

    it('should accept optional agent_type and agent_model', () => {
      const inputWithAgents = {
        repository_id: '123e4567-e89b-12d3-a456-426614174000',
        user_input: 'Create a login page',
        agent_type: 'claude-code',
        agent_model: 'sonnet-4-20250514',
      };

      const result = CreateTaskSchema.safeParse(inputWithAgents);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agent_type).toBe('claude-code');
        expect(result.data.agent_model).toBe('sonnet-4-20250514');
      }
    });

    it('should reject invalid agent_type', () => {
      const invalidInput = {
        repository_id: '123e4567-e89b-12d3-a456-426614174000',
        user_input: 'Create a login page',
        agent_type: 'invalid-agent',
      };

      const result = CreateTaskSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('should set default values for optional fields', () => {
      const minimalInput = {
        repository_id: '123e4567-e89b-12d3-a456-426614174000',
        user_input: 'Create a login page',
      };

      const result = CreateTaskSchema.safeParse(minimalInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.target_branch).toBe('main');
        expect(result.data.context_files).toEqual([]);
      }
    });
  });

  describe('UpdateTaskSchema', () => {
    it('should validate a valid update input', () => {
      const validInput = {
        title: 'Updated Title',
        status: 'coding',
      };

      const result = UpdateTaskSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should reject empty title', () => {
      const invalidInput = {
        title: '',
      };

      const result = UpdateTaskSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('title'))).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const invalidInput = {
        status: 'invalid_status',
      };

      const result = UpdateTaskSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('should accept valid statuses', () => {
      const validStatuses = [
        'draft', 'refining', 'pending_approval', 'approved', 'coding',
        'plan_review', 'review', 'merge_conflicts', 'changes_requested',
        'done', 'failed', 'canceled', 'backlog', 'planning', 'in_progress',
        'awaiting_review', 'pr_created'
      ];

      for (const status of validStatuses) {
        const result = UpdateTaskSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should accept null for nullable fields', () => {
      const input = {
        pr_url: null,
        build_command: null,
        final_spec: null,
      };

      const result = UpdateTaskSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept context_files as array', () => {
      const input = {
        context_files: ['src/index.ts', 'src/app.ts'],
      };

      const result = UpdateTaskSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context_files).toEqual(['src/index.ts', 'src/app.ts']);
      }
    });

    it('should accept was_spec_edited as boolean', () => {
      const input = {
        was_spec_edited: true,
      };

      const result = UpdateTaskSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.was_spec_edited).toBe(true);
      }
    });
  });

  describe('GenerateSpecRequestSchema', () => {
    it('should validate empty object (all optional)', () => {
      const result = GenerateSpecRequestSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should accept additional_context', () => {
      const input = {
        additional_context: 'Focus on accessibility',
      };

      const result = GenerateSpecRequestSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.additional_context).toBe('Focus on accessibility');
      }
    });
  });

  describe('UpdateSpecRequestSchema', () => {
    it('should validate a valid spec', () => {
      const validSpec = {
        spec: '# This is a valid spec with enough content',
      };

      const result = UpdateSpecRequestSchema.safeParse(validSpec);

      expect(result.success).toBe(true);
    });

    it('should reject short spec', () => {
      const shortSpec = {
        spec: 'Short',
      };

      const result = UpdateSpecRequestSchema.safeParse(shortSpec);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('spec'))).toBe(true);
      }
    });
  });

  describe('ApproveSpecRequestSchema', () => {
    it('should validate empty object', () => {
      const result = ApproveSpecRequestSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should accept optional final_spec', () => {
      const input = {
        final_spec: '# Final spec content',
      };

      const result = ApproveSpecRequestSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.final_spec).toBe('# Final spec content');
      }
    });
  });

  describe('TaskStatusSchema', () => {
    it('should validate all valid statuses', () => {
      const validStatuses = [
        'draft', 'refining', 'pending_approval', 'approved', 'coding',
        'plan_review', 'review', 'merge_conflicts', 'changes_requested',
        'done', 'failed', 'canceled', 'backlog', 'planning', 'in_progress',
        'awaiting_review', 'pr_created'
      ];

      for (const status of validStatuses) {
        const result = TaskStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = TaskStatusSchema.safeParse('invalid_status');

      expect(result.success).toBe(false);
    });
  });
});
