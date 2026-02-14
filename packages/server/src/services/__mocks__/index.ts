/**
 * Mock implementations for testing
 * These replace the actual database and logger implementations
 */
import { vi } from 'vitest';

// Mock database instance
export interface MockDatabase {
  tables: {
    tasks: Record<string, unknown>[];
    repositories: Record<string, unknown>[];
    task_logs: Record<string, unknown>[];
  };
  runCount: number;
}

// Create a fresh mock database for each test
export function createMockDatabase(): MockDatabase {
  return {
    tables: {
      tasks: [],
      repositories: [],
      task_logs: [],
    },
    runCount: 0,
  };
}

// Create mock sql.js Database class
export function createMockSqlJs(db: MockDatabase) {
  return class MockDatabase {
    run(sql: string, params: unknown[] = []) {
      db.runCount++;
      // Parse INSERT statements for tasks
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
          was_spec_edited: params[12],
          agent_type: params[13],
          agent_model: params[14],
        };
        db.tables.tasks.push(task);
      }
      // Parse UPDATE statements
      if (sql.includes('UPDATE tasks')) {
        const id = params[params.length - 1];
        const task = db.tables.tasks.find((t) => t.id === id);
        if (task) {
          const setPart = sql.match(/SET (.+) WHERE/)?.[1];
          if (setPart) {
            const updates = setPart.split(',').map((s) => s.trim());
            let paramIndex = 0;
            for (const update of updates) {
              const field = update.split(' = ')[0];
              if (field !== undefined && field !== 'updated_at') {
                (task as Record<string, unknown>)[field] = params[paramIndex];
                paramIndex++;
              }
            }
          }
        }
      }
      // Parse DELETE statements
      if (sql.includes('DELETE FROM tasks')) {
        const id = params[0];
        db.tables.tasks = db.tables.tasks.filter((t) => t.id !== id);
      }
    }

    exec(sql: string, params: unknown[] = []) {
      // Handle SELECT queries
      if (sql.includes('SELECT') && sql.includes('FROM tasks')) {
        let results = [...db.tables.tasks];

        // Apply WHERE conditions
        if (sql.includes('WHERE id = ?')) {
          const id = params[0];
          results = results.filter((t) => t.id === id);
        } else if (sql.includes('WHERE repository_id = ?')) {
          const repoId = params[0];
          results = results.filter((t) => t.repository_id === repoId);
        } else if (sql.includes('WHERE status = ?')) {
          const status = params[0];
          results = results.filter((t) => t.status === status);
        }

        // Get column names from query or use default
        const columns = [
          'id', 'title', 'description', 'repo_url', 'target_branch',
          'context_files', 'build_command', 'status', 'pr_url', 'error',
          'created_at', 'updated_at', 'repository_id', 'user_input',
          'generated_spec', 'generated_spec_at', 'final_spec',
          'spec_approved_at', 'was_spec_edited', 'branch_name', 'pr_number',
          'agent_type', 'agent_model', 'changes_data', 'conflict_files'
        ];

        return [{
          columns,
          values: results.map(task => columns.map(col => (task as Record<string, unknown>)[col] ?? null))
        }];
      }

      return [];
    }

    prepare(sql: string) {
      return {
        bind: (params: unknown[] = []) => {
          return {
            step: () => {
              // Simplified: return true for first row if exists
              if (sql.includes('WHERE id = ?')) {
                const id = params[0];
                return db.tables.tasks.some((t) => t.id === id);
              }
              if (sql.includes('WHERE repository_id = ?')) {
                return db.tables.tasks.some((t) => t.repository_id === params[0]);
              }
              if (sql.includes('WHERE status = ?')) {
                return db.tables.tasks.some((t) => t.status === params[0]);
              }
              return db.tables.tasks.length > 0;
            },
            get: () => {
              if (sql.includes('WHERE id = ?')) {
                const id = params[0];
                const task = db.tables.tasks.find((t) => t.id === id);
                if (!task) return [];
                const columns = [
                  'id', 'title', 'description', 'repo_url', 'target_branch',
                  'context_files', 'build_command', 'status', 'pr_url', 'error',
                  'created_at', 'updated_at', 'repository_id', 'user_input',
                  'generated_spec', 'generated_spec_at', 'final_spec',
                  'spec_approved_at', 'was_spec_edited', 'branch_name', 'pr_number',
                  'agent_type', 'agent_model', 'changes_data', 'conflict_files'
                ];
                return columns.map(col => (task as Record<string, unknown>)[col] ?? null);
              }
              return [];
            },
            free: () => {},
          };
        },
      };
    }

    getRowsModified() {
      return 1;
    }
  };
}

// Mock logger
export const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// Reset all mocks
export function resetMocks() {
  vi.clearAllMocks();
}
