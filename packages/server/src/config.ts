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
 * Validates and returns the application configuration.
 * Throws an error if required environment variables are missing.
 */
export function loadConfig(): Config {
  const logLevel = getEnvVar('LOG_LEVEL', false, 'info');
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}. Must be one of: debug, info, warn, error`);
  }

  return {
    openaiApiKey: getEnvVar('OPENAI_API_KEY', false, ''),
    githubToken: getEnvVar('GITHUB_TOKEN', false, ''),
    reposBaseDir: getEnvVar('REPOS_BASE_DIR', false, '/var/repos'),
    worktreesDir: getEnvVar('WORKTREES_DIR', false, '/tmp/agent-worktrees'),
    port: parseInt(getEnvVar('PORT', false, '3000'), 10),
    databasePath: getEnvVar('DATABASE_PATH', false, './data/agent-board.db'),
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
