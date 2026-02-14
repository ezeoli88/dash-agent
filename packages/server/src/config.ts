import { homedir } from 'os';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

/**
 * Application configuration loaded from environment variables.
 * All required variables are validated at startup.
 */
export interface Config {
  /** OpenAI API key for AI agent operations */
  openaiApiKey: string;
  /** GitHub Personal Access Token for repository operations */
  githubToken: string;
  /** Base directory where repositories are cloned */
  reposBaseDir: string;
  /** Directory for git worktrees used by the agent */
  worktreesDir: string;
  /** Server port */
  port: number;
  /** SQLite database file path */
  databasePath: string;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Retrieves an environment variable, throwing an error if required and not set.
 */
function getEnvVar(name: string, required: true): string;
function getEnvVar(name: string, required: false, defaultValue: string): string;
function getEnvVar(name: string, required: boolean, defaultValue?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return defaultValue ?? '';
}

/**
 * Returns a writable OS-specific data directory for binary mode.
 * This avoids permission issues when the executable is in Program Files.
 */
function getDefaultDataRoot(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'];
    if (localAppData && localAppData.trim().length > 0) {
      return join(localAppData, 'agent-board');
    }
    return join(homedir(), 'AppData', 'Local', 'agent-board');
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'agent-board');
  }

  const xdgDataHome = process.env['XDG_DATA_HOME'];
  if (xdgDataHome && xdgDataHome.trim().length > 0) {
    return join(xdgDataHome, 'agent-board');
  }

  return join(homedir(), '.local', 'share', 'agent-board');
}

/**
 * Finds an existing legacy binary directory for backwards compatibility.
 * Older releases stored data relative to the executable/current working dir.
 */
function findLegacyBinaryDir(dirName: string): string | null {
  const exeDir = dirname(process.execPath);
  const candidates = [
    join(process.cwd(), dirName),
    join(process.cwd(), 'data', dirName),
    join(exeDir, dirName),
    join(exeDir, 'data', dirName),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Finds an existing legacy binary database path for backwards compatibility.
 */
function findLegacyBinaryDatabasePath(): string | null {
  const exeDir = dirname(process.execPath);
  const candidates = [
    join(process.cwd(), 'data', 'agent-board.db'),
    join(process.cwd(), 'agent-board.db'),
    join(exeDir, 'data', 'agent-board.db'),
    join(exeDir, 'agent-board.db'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Validates and returns the application configuration.
 * Throws an error if required environment variables are missing.
 */
export function loadConfig(): Config {
  const isBinaryMode = process.env['__BIN_MODE__'] === '1';
  const configuredDataRoot = process.env['AGENT_BOARD_DATA_DIR'];
  const hasConfiguredDataRoot = configuredDataRoot !== undefined && configuredDataRoot !== '';
  const dataRoot = getEnvVar(
    'AGENT_BOARD_DATA_DIR',
    false,
    getDefaultDataRoot()
  );
  const logLevel = getEnvVar('LOG_LEVEL', false, 'info');
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}. Must be one of: debug, info, warn, error`);
  }

  let defaultReposBaseDir = '/var/repos';
  let defaultWorktreesDir = '/tmp/agent-worktrees';
  let defaultDatabasePath = './data/agent-board.db';

  if (isBinaryMode) {
    const legacyReposDir = hasConfiguredDataRoot ? null : findLegacyBinaryDir('repos');
    const legacyWorktreesDir = hasConfiguredDataRoot ? null : findLegacyBinaryDir('worktrees');
    const legacyDatabasePath = hasConfiguredDataRoot ? null : findLegacyBinaryDatabasePath();

    defaultReposBaseDir = legacyReposDir ?? join(dataRoot, 'repos');
    defaultWorktreesDir = legacyWorktreesDir ?? join(dataRoot, 'worktrees');
    defaultDatabasePath = legacyDatabasePath ?? join(dataRoot, 'data', 'agent-board.db');
  }

  return {
    openaiApiKey: getEnvVar('OPENAI_API_KEY', false, ''),
    githubToken: getEnvVar('GITHUB_TOKEN', false, ''),
    reposBaseDir: getEnvVar('REPOS_BASE_DIR', false, defaultReposBaseDir),
    worktreesDir: getEnvVar('WORKTREES_DIR', false, defaultWorktreesDir),
    port: parseInt(getEnvVar('PORT', false, '51767'), 10),
    databasePath: getEnvVar('DATABASE_PATH', false, defaultDatabasePath),
    logLevel: logLevel as Config['logLevel'],
  };
}

/** Singleton configuration instance */
let configInstance: Config | null = null;

/**
 * Gets the application configuration.
 * Loads and validates on first call, returns cached instance thereafter.
 */
export function getConfig(): Config {
  if (configInstance === null) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export default getConfig;
