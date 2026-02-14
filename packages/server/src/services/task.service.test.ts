import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskService } from './task.service.js';

const mockState = vi.hoisted(() => ({
  tasks: [] as Record<string, unknown>[],
  rowsModified: 0,
}));

const TASK_COLUMNS = [
  'id',
  'title',
  'description',
  'repo_url',
  'target_branch',
  'context_files',
  'build_command',
  'status',
  'pr_url',
  'error',
  'created_at',
  'updated_at',
  'repository_id',
  'user_input',
  'generated_spec',
  'generated_spec_at',
  'final_spec',
  'spec_approved_at',
  'was_spec_edited',
  'branch_name',
  'pr_number',
  'agent_type',
  'agent_model',
  'changes_data',
  'conflict_files',
] as const;

function selectTasks(sql: string, params: unknown[]): Record<string, unknown>[] {
  let results = [...mockState.tasks];

  if (sql.includes('WHERE id = ?')) {
    results = results.filter((t) => t.id === params[0]);
  } else if (sql.includes('WHERE repository_id = ?')) {
    results = results.filter((t) => t.repository_id === params[0]);
  } else if (sql.includes('WHERE status = ?')) {
    results = results.filter((t) => t.status === params[0]);
  }

  if (sql.includes('ORDER BY created_at DESC')) {
    results.sort((a, b) => {
      const aTs = new Date((a.created_at as string) ?? 0).getTime();
      const bTs = new Date((b.created_at as string) ?? 0).getTime();
      return bTs - aTs;
    });
  }

  return results;
}

const mockDb = vi.hoisted(() => ({
  run: vi.fn((sql: string, params: unknown[] = []) => {
    mockState.rowsModified = 0;

    if (sql.includes('INSERT INTO tasks')) {
      const task: Record<string, unknown> = {
        id: params[0],
        title: params[1],
        description: params[2],
        repo_url: params[3],
        target_branch: params[4],
        context_files: params[5],
        build_command: params[6],
        status: params[7],
        created_at: params[8],
        updated_at: params[9],
        repository_id: params[10],
        user_input: params[11],
        generated_spec: null,
        generated_spec_at: null,
        final_spec: null,
        spec_approved_at: null,
        was_spec_edited: params[12],
        branch_name: null,
        pr_number: null,
        agent_type: params[13],
        agent_model: params[14],
        changes_data: null,
        conflict_files: null,
        pr_url: null,
        error: null,
      };
      mockState.tasks.push(task);
      mockState.rowsModified = 1;
      return;
    }

    if (sql.includes('UPDATE tasks SET')) {
      const id = params[params.length - 1];
      const task = mockState.tasks.find((t) => t.id === id);
      if (!task) {
        return;
      }

      const setMatch = sql.match(/SET (.+), updated_at = \? WHERE/);
      if (!setMatch || !setMatch[1]) {
        return;
      }

      const assignments = setMatch[1].split(',').map((chunk) => chunk.trim());
      assignments.forEach((assignment, index) => {
        const eqIndex = assignment.indexOf('=');
        if (eqIndex <= 0) {
          return;
        }
        const field = assignment.substring(0, eqIndex).trim();
        task[field] = params[index];
      });

      task.updated_at = params[assignments.length];
      mockState.rowsModified = 1;
      return;
    }

    if (sql.includes('DELETE FROM tasks')) {
      const beforeCount = mockState.tasks.length;
      const id = params[0];
      mockState.tasks = mockState.tasks.filter((t) => t.id !== id);
      mockState.rowsModified = beforeCount === mockState.tasks.length ? 0 : 1;
    }
  }),

  exec: vi.fn((sql: string, params: unknown[] = []) => {
    if (!sql.includes('SELECT') || !sql.includes('FROM tasks')) {
      return [];
    }
    const tasks = selectTasks(sql, params);
    return [
      {
        columns: [...TASK_COLUMNS],
        values: tasks.map((task) => TASK_COLUMNS.map((column) => task[column] ?? null)),
      },
    ];
  }),

  prepare: vi.fn((sql: string) => {
    let boundParams: unknown[] = [];
    let cursor = -1;
    let results: Record<string, unknown>[] = [];

    return {
      bind(params: unknown[] = []) {
        boundParams = params;
        results = selectTasks(sql, boundParams);
        cursor = -1;
        return this;
      },
      step() {
        cursor += 1;
        return cursor < results.length;
      },
      get() {
        if (cursor < 0 || cursor >= results.length) {
          return [];
        }
        const task = results[cursor];
        return TASK_COLUMNS.map((column) => task?.[column] ?? null);
      },
      free() {
        return undefined;
      },
    };
  }),

  getRowsModified: vi.fn(() => mockState.rowsModified),
}));

vi.mock('../db/database.js', () => ({
  getDatabase: () => mockDb,
  saveDatabase: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.tasks = [];
    mockState.rowsModified = 0;
    service = new TaskService();
  });

  it('creates two-agent tasks in draft status and hydrates title from user_input', () => {
    const task = service.create({
      repository_id: '123e4567-e89b-12d3-a456-426614174000',
      user_input: 'Create dashboard filters for failed and canceled tasks',
    } as any);

    expect(task.status).toBe('draft');
    expect(task.title).toContain('Create dashboard filters');
    expect(task.description).toContain('Create dashboard filters');
    expect(task.target_branch).toBe('main');
  });

  it('creates legacy tasks in backlog status', () => {
    const task = service.create({
      title: 'Legacy flow task',
      description: 'Needs execution',
      repo_url: 'https://github.com/acme/repo',
    } as any);

    expect(task.status).toBe('backlog');
    expect(task.title).toBe('Legacy flow task');
  });

  it('returns null when task id does not exist', () => {
    const task = service.getById('missing-task');
    expect(task).toBeNull();
  });

  it('filters tasks by repository id', () => {
    service.create({
      repository_id: '11111111-1111-4111-8111-111111111111',
      user_input: 'Task A',
    } as any);
    service.create({
      repository_id: '22222222-2222-4222-8222-222222222222',
      user_input: 'Task B',
    } as any);

    const tasks = service.getAll('11111111-1111-4111-8111-111111111111');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.repository_id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('updates task status and context_files', () => {
    const created = service.create({
      repository_id: '123e4567-e89b-12d3-a456-426614174000',
      user_input: 'Initial',
    } as any);

    const updated = service.update(created.id, {
      status: 'coding',
      context_files: ['src/index.ts', 'src/routes/tasks.ts'],
    });

    expect(updated?.status).toBe('coding');
    expect(updated?.context_files).toEqual(['src/index.ts', 'src/routes/tasks.ts']);
  });

  it('returns null when updating an unknown task', () => {
    const updated = service.update('missing-task', { status: 'coding' });
    expect(updated).toBeNull();
  });

  it('returns tasks by status', () => {
    const t1 = service.create({
      repository_id: '123e4567-e89b-12d3-a456-426614174000',
      user_input: 'Task 1',
    } as any);
    service.update(t1.id, { status: 'coding' });
    service.create({
      repository_id: '123e4567-e89b-12d3-a456-426614174000',
      user_input: 'Task 2',
    } as any);

    const coding = service.getByStatus('coding');
    expect(coding).toHaveLength(1);
    expect(coding[0]?.id).toBe(t1.id);
  });

  it('updateSpec marks generated specs as pending_approval', () => {
    const created = service.create({
      repository_id: '123e4567-e89b-12d3-a456-426614174000',
      user_input: 'Generate spec',
    } as any);

    const updated = service.updateSpec(created.id, '# Spec title', true);

    expect(updated?.generated_spec).toBe('# Spec title');
    expect(updated?.final_spec).toBe('# Spec title');
    expect(updated?.status).toBe('pending_approval');
  });

  it('approveSpec throws when no spec exists', () => {
    const created = service.create({
      repository_id: '123e4567-e89b-12d3-a456-426614174000',
      user_input: 'No spec yet',
    } as any);

    expect(() => service.approveSpec(created.id)).toThrow('No spec to approve');
  });

  it('approveSpec transitions task to approved and stores timestamps', () => {
    const created = service.create({
      repository_id: '123e4567-e89b-12d3-a456-426614174000',
      user_input: 'Approve me',
    } as any);
    service.updateSpec(created.id, '# Build feature', true);

    const approved = service.approveSpec(created.id, '# Build feature with tests');

    expect(approved?.status).toBe('approved');
    expect(approved?.spec_approved_at).toBeTruthy();
    expect(approved?.was_spec_edited).toBe(true);
    expect(approved?.description).toBe('# Build feature with tests');
  });

  it('deletes existing tasks and reports missing tasks correctly', () => {
    const created = service.create({
      repository_id: '123e4567-e89b-12d3-a456-426614174000',
      user_input: 'Delete me',
    } as any);

    expect(service.delete(created.id)).toBe(true);
    expect(service.getById(created.id)).toBeNull();
    expect(service.delete('missing-task')).toBe(false);
  });
});
