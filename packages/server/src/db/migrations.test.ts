import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted state ──────────────────────────────────────────────────────
const mockState = vi.hoisted(() => ({
  schemaVersions: [] as number[],
}));

/**
 * Default implementation for mockDb.run.
 * Tracks schema version inserts and is a no-op for everything else.
 */
function defaultRunImpl(sql: string, params?: unknown[]) {
  if (sql.includes('INSERT INTO schema_versions')) {
    const version = (params as unknown[])?.[0] as number;
    mockState.schemaVersions.push(version);
  }
}

const mockDb = vi.hoisted(() => ({
  run: vi.fn(defaultRunImpl),
  exec: vi.fn((sql: string) => {
    if (sql.includes('SELECT version FROM schema_versions')) {
      if (mockState.schemaVersions.length === 0) {
        return [];
      }
      const sorted = [...mockState.schemaVersions].sort((a, b) => b - a);
      return [
        {
          values: sorted.map((v: number) => [v]),
        },
      ];
    }
    return [];
  }),
}));

// ── Module mocks ───────────────────────────────────────────────────────
vi.mock('./database.js', () => ({
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

describe('migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.schemaVersions = [];

    // Restore default implementations after each test
    // (important because some tests override with mockImplementation)
    mockDb.run.mockImplementation(defaultRunImpl);
    mockDb.exec.mockImplementation((sql: string) => {
      if (sql.includes('SELECT version FROM schema_versions')) {
        if (mockState.schemaVersions.length === 0) {
          return [];
        }
        const sorted = [...mockState.schemaVersions].sort((a, b) => b - a);
        return [{ values: sorted.map((v: number) => [v]) }];
      }
      return [];
    });
  });

  // ── runMigrations: fresh database ──────────────────────────────────

  it('creates schema_versions table on first run', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const createSchemaTable = runCalls.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS schema_versions'),
    );
    expect(createSchemaTable).toBeDefined();
  });

  it('runs all 9 migrations in order on a fresh database', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    expect(mockState.schemaVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('wraps each migration in a transaction (BEGIN + COMMIT)', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);

    const begins = runCalls.filter((sql) => sql === 'BEGIN TRANSACTION');
    const commits = runCalls.filter((sql) => sql === 'COMMIT');

    expect(begins.length).toBe(9);
    expect(commits.length).toBe(9);
  });

  it('creates the tasks table in migration 1', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const tasksTable = runCalls.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS tasks'),
    );
    expect(tasksTable).toBeDefined();
  });

  it('creates the task_logs table in migration 2', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const taskLogsTable = runCalls.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS task_logs'),
    );
    expect(taskLogsTable).toBeDefined();
  });

  it('creates the repositories table in migration 3', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const reposTable = runCalls.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS repositories'),
    );
    expect(reposTable).toBeDefined();
  });

  it('creates the user_secrets table in migration 5', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const secretsTable = runCalls.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS user_secrets'),
    );
    expect(secretsTable).toBeDefined();
  });

  it('creates the user_settings table in migration 6', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const settingsTable = runCalls.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS user_settings'),
    );
    expect(settingsTable).toBeDefined();
  });

  it('calls saveDatabase after all migrations', async () => {
    const { runMigrations } = await import('./migrations.js');
    const { saveDatabase } = await import('./database.js');

    runMigrations();

    expect(saveDatabase).toHaveBeenCalled();
  });

  // ── runMigrations: partially migrated ──────────────────────────────

  it('skips already-applied migrations (idempotent)', async () => {
    // Simulate database already at version 5
    mockState.schemaVersions = [1, 2, 3, 4, 5];

    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    // Migrations 6, 7, 8, 9 were appended
    expect(mockState.schemaVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // Verify BEGIN TRANSACTION was called exactly 4 times (once per new migration)
    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const begins = runCalls.filter((sql) => sql === 'BEGIN TRANSACTION');
    expect(begins.length).toBe(4);
  });

  it('does nothing when all migrations are already applied', async () => {
    // Simulate fully migrated database
    mockState.schemaVersions = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    // No new migrations should be applied
    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const begins = runCalls.filter((sql) => sql === 'BEGIN TRANSACTION');
    expect(begins.length).toBe(0);

    // Array should remain the same (no new pushes)
    expect(mockState.schemaVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  // ── runMigrations: error handling ──────────────────────────────────

  it('rolls back and re-throws when a migration SQL fails', async () => {
    // Make db.run throw on the tasks table SQL (migration 1's sql body)
    mockDb.run.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('CREATE TABLE IF NOT EXISTS tasks')) {
        throw new Error('SQL syntax error');
      }
      // Still track schema versions for non-failing calls
      if (sql.includes('INSERT INTO schema_versions')) {
        const version = (params as unknown[])?.[0] as number;
        mockState.schemaVersions.push(version);
      }
    });

    const { runMigrations } = await import('./migrations.js');

    expect(() => runMigrations()).toThrow('SQL syntax error');

    // ROLLBACK should have been called
    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(runCalls).toContain('ROLLBACK');

    // No schema versions should be recorded for the failed migration
    expect(mockState.schemaVersions).toEqual([]);
  });

  // ── getCurrentSchemaVersion ────────────────────────────────────────

  it('treats empty exec result as version 0 and runs all migrations', async () => {
    // exec returns empty array for no rows -- this is the default when
    // mockState.schemaVersions is empty, which it is after beforeEach.

    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    // All 9 migrations should run since we started from version 0
    expect(mockState.schemaVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('adds ALTER TABLE columns in migration 4 (two-agent workflow)', async () => {
    const { runMigrations } = await import('./migrations.js');
    runMigrations();

    const runCalls = mockDb.run.mock.calls.map((c: unknown[]) => c[0] as string);
    const alterCalls = runCalls.filter((sql) => sql.includes('ALTER TABLE tasks ADD COLUMN'));
    // Migration 4 has multiple ALTER TABLE statements, plus migrations 7, 8, 9 each have one
    // Migration 4: repository_id, user_input, generated_spec, generated_spec_at, final_spec,
    //              spec_approved_at, was_spec_edited, branch_name, pr_number = 9 columns
    // But they're in a single SQL string, so only 1 db.run call for migration 4's sql.
    // Migrations 7, 8, 9 each have 1 ALTER TABLE call.
    // We just verify that at least some ALTER TABLE calls were made.
    const m4Sql = runCalls.find((sql) =>
      sql.includes('ALTER TABLE tasks ADD COLUMN repository_id'),
    );
    expect(m4Sql).toBeDefined();
  });
});
