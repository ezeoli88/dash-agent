import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

/**
 * We track the last created Database instance so tests can assert on it.
 * The source code calls `new SQL.Database(buffer?)`, so we need a real class.
 */
const mockDbMethods = vi.hoisted(() => ({
  run: vi.fn(),
  export: vi.fn(() => new Uint8Array([1, 2, 3])),
  close: vi.fn(),
}));

// Track the last constructed instance and constructor args
const constructorTracker = vi.hoisted(() => ({
  lastInstance: null as unknown,
  lastArgs: [] as unknown[],
}));

const MockDatabaseClass = vi.hoisted(() => {
  return class MockDatabase {
    run: typeof mockDbMethods.run;
    export: typeof mockDbMethods.export;
    close: typeof mockDbMethods.close;

    constructor(...args: unknown[]) {
      this.run = mockDbMethods.run;
      this.export = mockDbMethods.export;
      this.close = mockDbMethods.close;
      constructorTracker.lastInstance = this;
      constructorTracker.lastArgs = args;
    }
  };
});

const mockInitSqlJs = vi.hoisted(() =>
  vi.fn(async () => ({
    Database: MockDatabaseClass,
  })),
);

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from([0])),
  writeFileSync: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
  databasePath: '/tmp/test-data/test.db',
}));

// ── Module mocks ───────────────────────────────────────────────────────
vi.mock('sql.js', () => ({
  default: mockInitSqlJs,
}));

vi.mock('fs', () => ({
  existsSync: mockFs.existsSync,
  mkdirSync: mockFs.mkdirSync,
  readFileSync: mockFs.readFileSync,
  writeFileSync: mockFs.writeFileSync,
}));

vi.mock('../config.js', () => ({
  getConfig: () => mockConfig,
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// We re-import the module fresh for each test to reset the singleton.
// vitest caches modules, so we use `vi.resetModules()` + dynamic import.

describe('database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset tracker
    constructorTracker.lastInstance = null;
    constructorTracker.lastArgs = [];

    // Default: directory does not exist, db file does not exist
    mockFs.existsSync.mockReturnValue(false);
    mockConfig.databasePath = '/tmp/test-data/test.db';
  });

  // ── initDatabase ───────────────────────────────────────────────────

  describe('initDatabase', () => {
    it('initializes sql.js and creates a new database when no file exists', async () => {
      const { initDatabase } = await import('./database.js');

      const db = await initDatabase();

      // sql.js was initialized
      expect(mockInitSqlJs).toHaveBeenCalledOnce();
      // Parent dir was created because existsSync returned false
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/test-data', { recursive: true });
      // New Database() was called without a buffer (new db)
      expect(constructorTracker.lastArgs).toEqual([]);
      // Foreign keys pragma was executed
      expect(mockDbMethods.run).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      // Returns an instance of MockDatabaseClass
      expect(db).toBe(constructorTracker.lastInstance);
    });

    it('loads existing database from disk when file exists', async () => {
      // Both directory and db file exist
      mockFs.existsSync.mockReturnValue(true);
      const fileBuffer = Buffer.from([10, 20, 30]);
      mockFs.readFileSync.mockReturnValue(fileBuffer);

      const { initDatabase } = await import('./database.js');

      const db = await initDatabase();

      // Should NOT create directory since it exists
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      // Database constructor called with the file buffer
      expect(constructorTracker.lastArgs).toEqual([fileBuffer]);
      expect(db).toBe(constructorTracker.lastInstance);
    });

    it('returns the same singleton on subsequent calls', async () => {
      const { initDatabase } = await import('./database.js');

      const db1 = await initDatabase();
      const db2 = await initDatabase();

      expect(db1).toBe(db2);
      // sql.js init should only be called once
      expect(mockInitSqlJs).toHaveBeenCalledOnce();
    });

    it('passes locateFile option when in binary mode', async () => {
      process.env['__BIN_MODE__'] = '1';

      const { initDatabase } = await import('./database.js');
      await initDatabase();

      // initSqlJs was called with a config containing locateFile
      const callArg = (mockInitSqlJs.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArg).toBeDefined();
      expect(callArg).toHaveProperty('locateFile');
      expect(typeof callArg!.locateFile).toBe('function');

      // Clean up env
      delete process.env['__BIN_MODE__'];
    });

    it('does not pass locateFile when not in binary mode', async () => {
      delete process.env['__BIN_MODE__'];

      const { initDatabase } = await import('./database.js');
      await initDatabase();

      // initSqlJs was called with undefined (no config)
      const callArg = (mockInitSqlJs.mock.calls as unknown[][])[0]?.[0];
      expect(callArg).toBeUndefined();
    });

    it('propagates errors from sql.js initialization', async () => {
      mockInitSqlJs.mockRejectedValueOnce(new Error('WASM load failed'));

      const { initDatabase } = await import('./database.js');

      await expect(initDatabase()).rejects.toThrow('WASM load failed');
    });
  });

  // ── getDatabase ────────────────────────────────────────────────────

  describe('getDatabase', () => {
    it('throws when database has not been initialized', async () => {
      const { getDatabase } = await import('./database.js');

      expect(() => getDatabase()).toThrow('Database not initialized. Call initDatabase() first.');
    });

    it('returns the database instance after initialization', async () => {
      const { initDatabase, getDatabase } = await import('./database.js');

      await initDatabase();
      const db = getDatabase();

      expect(db).toBe(constructorTracker.lastInstance);
    });
  });

  // ── saveDatabase ───────────────────────────────────────────────────

  describe('saveDatabase', () => {
    it('writes database to disk when initialized', async () => {
      const { initDatabase, saveDatabase } = await import('./database.js');

      await initDatabase();
      saveDatabase();

      expect(mockDbMethods.export).toHaveBeenCalledOnce();
      expect(mockFs.writeFileSync).toHaveBeenCalledOnce();
      // Verify the path matches config
      expect(mockFs.writeFileSync.mock.calls[0]?.[0]).toBe('/tmp/test-data/test.db');
    });

    it('does nothing when database is not initialized', async () => {
      const { saveDatabase } = await import('./database.js');

      saveDatabase(); // should not throw

      expect(mockDbMethods.export).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  // ── closeDatabase ──────────────────────────────────────────────────

  describe('closeDatabase', () => {
    it('saves, closes, and nullifies the database instance', async () => {
      const { initDatabase, closeDatabase, getDatabase } = await import('./database.js');

      await initDatabase();
      closeDatabase();

      // close() was called on the db instance
      expect(mockDbMethods.close).toHaveBeenCalledOnce();
      // export + writeFile were called (saveDatabase)
      expect(mockDbMethods.export).toHaveBeenCalledOnce();
      expect(mockFs.writeFileSync).toHaveBeenCalledOnce();
      // After closing, getDatabase should throw
      expect(() => getDatabase()).toThrow('Database not initialized');
    });

    it('does nothing when database is not initialized', async () => {
      const { closeDatabase } = await import('./database.js');

      closeDatabase(); // should not throw

      expect(mockDbMethods.close).not.toHaveBeenCalled();
    });
  });

  // ── withTransaction ────────────────────────────────────────────────

  describe('withTransaction', () => {
    it('wraps a function in BEGIN/COMMIT and saves', async () => {
      const { initDatabase, withTransaction } = await import('./database.js');

      await initDatabase();
      mockDbMethods.run.mockClear();

      const result = withTransaction(() => 42);

      expect(result).toBe(42);
      // Check call order: BEGIN, COMMIT, then saveDatabase writes
      const runCalls = mockDbMethods.run.mock.calls.map((c: unknown[]) => c[0]);
      expect(runCalls[0]).toBe('BEGIN TRANSACTION');
      expect(runCalls[1]).toBe('COMMIT');
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('rolls back on error and re-throws', async () => {
      const { initDatabase, withTransaction } = await import('./database.js');

      await initDatabase();
      mockDbMethods.run.mockClear();

      expect(() =>
        withTransaction(() => {
          throw new Error('boom');
        }),
      ).toThrow('boom');

      const runCalls = mockDbMethods.run.mock.calls.map((c: unknown[]) => c[0]);
      expect(runCalls[0]).toBe('BEGIN TRANSACTION');
      expect(runCalls[1]).toBe('ROLLBACK');
    });
  });
});
