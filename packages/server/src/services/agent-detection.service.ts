import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createLogger } from '../utils/logger.js';
import type { AgentType, DetectedAgent, AgentModel } from '@dash-agent/shared';

const execFileAsync = promisify(execFile);
const logger = createLogger('agent-detection');

// ============================================================================
// CLI Configuration
// ============================================================================

interface CLIConfig {
  id: AgentType;
  name: string;
  command: string;
  versionArgs: string[];
  authCheckArgs: string[];
  models: AgentModel[];
  /**
   * Primary login file — its presence means the user has logged in.
   * Path relative to home dir unless absolute.
   */
  loginFile: string | null;
  /**
   * Fallback files that indicate the CLI is at least installed/configured
   * (but maybe not fully authenticated).
   */
  installIndicatorFiles: string[];
  /** Environment variables that indicate authentication */
  authEnvVars: string[];
}

const isWindows = process.platform === 'win32';
const home = homedir();

const CLI_CONFIGS: CLIConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    versionArgs: ['--version'],
    authCheckArgs: ['-p', 'hi', '--output-format', 'json', '--max-turns', '1'],
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: 'Most intelligent — complex tasks & agents' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Best speed/intelligence balance' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fastest — near-frontier intelligence' },
    ],
    // Same as vibe-kanban: ~/.claude.json indicates a logged-in session
    loginFile: '.claude.json',
    installIndicatorFiles: [
      '.claude/.credentials.json',
      '.claude/credentials.json',
    ],
    authEnvVars: ['ANTHROPIC_API_KEY'],
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    versionArgs: ['--version'],
    authCheckArgs: ['exec', 'hi', '--json'],
    models: [
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', description: 'Most capable — frontier coding + reasoning' },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', description: 'Advanced agentic coding model' },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', description: 'Long-horizon agentic coding' },
      { id: 'gpt-5.2', name: 'GPT-5.2', description: 'Best general agentic model' },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', description: 'Cost-effective, smaller model' },
    ],
    // Same as vibe-kanban: ~/.codex/auth.json indicates a logged-in session
    loginFile: '.codex/auth.json',
    installIndicatorFiles: [
      '.codex/version.json',
      '.codex/config.toml',
    ],
    authEnvVars: ['OPENAI_API_KEY'],
  },
  {
    id: 'copilot',
    name: 'Copilot',
    command: 'copilot',
    versionArgs: ['--version'],
    authCheckArgs: ['-p', 'hi'],
    models: [
      { id: 'default', name: 'Default' },
    ],
    // Same as vibe-kanban: ~/.copilot/config.json
    loginFile: '.copilot/config.json',
    installIndicatorFiles: isWindows
      ? [
          ...(process.env.LOCALAPPDATA
            ? [join(process.env.LOCALAPPDATA, 'github-copilot', 'hosts.json')]
            : []),
          '.config/github-copilot/hosts.json',
        ]
      : [
          '.config/github-copilot/hosts.json',
        ],
    authEnvVars: ['GITHUB_TOKEN'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: 'gemini',
    versionArgs: ['--version'],
    authCheckArgs: ['-p', 'hi', '--output-format', 'json'],
    models: [
      { id: 'gemini-3-pro', name: 'Gemini 3 Pro', description: 'Best multimodal understanding' },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', description: 'Balanced speed & performance' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Frontier thinking model (stable)' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Best price-performance (stable)' },
    ],
    // Same as vibe-kanban: ~/.gemini/oauth_creds.json indicates OAuth login
    loginFile: '.gemini/oauth_creds.json',
    installIndicatorFiles: [
      '.gemini/settings.json',
      '.gemini/installation_id',
    ],
    authEnvVars: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  },
];

// ============================================================================
// Cache
// ============================================================================

const CACHE_TTL_MS = 300_000; // 5 minutes

let cache: { agents: DetectedAgent[]; timestamp: number } | null = null;

function clearAgentCache(): void {
  cache = null;
  logger.debug('Agent detection cache cleared');
}

// ============================================================================
// Detection Helpers
// ============================================================================

/**
 * Find the executable path for a given command.
 * Uses `where` on Windows, `which` on Unix.
 */
async function findExecutable(command: string): Promise<string | null> {
  const lookupCommand = isWindows ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(lookupCommand, [command], {
      timeout: 5000,
      windowsHide: true,
    });
    // `where` on Windows may return multiple lines; take the first one
    const firstLine = stdout.trim().split(/\r?\n/)[0];
    return firstLine ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the version string from a CLI tool.
 */
async function getVersion(execPath: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(execPath, args, {
      timeout: 5000,
      windowsHide: true,
      shell: isWindows,
    });
    const firstLine = stdout.trim().split(/\r?\n/)[0];
    return firstLine ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a credential path: if it's absolute use as-is, otherwise join with home.
 */
function resolvePath(credPath: string): string {
  if (credPath.startsWith('/') || credPath.includes(':')) return credPath;
  return join(home, credPath);
}

/**
 * Check if a file exists and optionally return its mtime.
 */
async function fileExists(filePath: string): Promise<{ exists: boolean; mtimeMs?: number }> {
  try {
    const s = await stat(filePath);
    return { exists: true, mtimeMs: s.mtimeMs };
  } catch {
    return { exists: false };
  }
}

/**
 * Fast auth check: look for login files, install indicators, or env vars.
 * Mirrors vibe-kanban's detection strategy:
 * 1. Check env vars (instant)
 * 2. Check primary login file (e.g. ~/.claude.json, ~/.codex/auth.json)
 * 3. Fall back to install indicator files
 */
async function checkAuthFast(config: CLIConfig): Promise<boolean> {
  // 1. Check environment variables first (instant)
  for (const envVar of config.authEnvVars) {
    if (process.env[envVar]) {
      logger.debug('Auth detected via env var', { agent: config.id, envVar });
      return true;
    }
  }

  // 2. Check primary login file (strongest signal — user has actually logged in)
  if (config.loginFile) {
    const loginPath = resolvePath(config.loginFile);
    const result = await fileExists(loginPath);
    if (result.exists) {
      logger.debug('Auth detected via login file', {
        agent: config.id,
        path: loginPath,
        lastAuth: result.mtimeMs ? new Date(result.mtimeMs).toISOString() : 'unknown',
      });
      return true;
    }
  }

  // 3. Check install indicator files (weaker signal — installed but maybe not logged in)
  for (const indicatorPath of config.installIndicatorFiles) {
    const fullPath = resolvePath(indicatorPath);
    const result = await fileExists(fullPath);
    if (result.exists) {
      logger.debug('Auth detected via install indicator', { agent: config.id, path: fullPath });
      return true;
    }
  }

  return false;
}

// ============================================================================
// Dynamic Model Discovery
// ============================================================================

/**
 * Read models from Codex's local models_cache.json.
 * Codex fetches available models from the API and caches them at ~/.codex/models_cache.json.
 * This list changes based on the user's subscription (free vs paid).
 */
async function readCodexModelsCache(): Promise<AgentModel[] | null> {
  const cachePath = join(home, '.codex', 'models_cache.json');
  try {
    const raw = await readFile(cachePath, 'utf8');
    const data = JSON.parse(raw) as {
      models?: Array<{
        slug: string;
        display_name?: string;
        description?: string;
        visibility?: string;
        priority?: number;
      }>;
    };

    if (!data.models || !Array.isArray(data.models)) return null;

    // Only include models with visibility "list" (user-selectable models)
    const models = data.models
      .filter((m) => m.visibility === 'list')
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      .map((m) => ({
        id: m.slug,
        name: m.display_name ?? m.slug,
        description: m.description?.replace(/\.$/, '') ?? undefined, // trim trailing dot
      }));

    if (models.length > 0) {
      logger.debug('Codex models loaded from cache', { count: models.length, models: models.map((m) => m.id) });
      return models;
    }

    return null;
  } catch {
    // Cache file doesn't exist or is invalid — fall back to hardcoded models
    return null;
  }
}

/**
 * Attempts to load dynamic models for the given agent type.
 * Falls back to the hardcoded models in CLIConfig if no dynamic source is available.
 */
async function loadDynamicModels(config: CLIConfig): Promise<AgentModel[]> {
  switch (config.id) {
    case 'codex': {
      const dynamicModels = await readCodexModelsCache();
      if (dynamicModels) return dynamicModels;
      break;
    }
    // Claude Code and Gemini don't have a local models cache — use hardcoded
    default:
      break;
  }

  return config.models;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect a single agent by its type.
 * Uses fast filesystem-based auth check instead of running CLI prompts.
 * For Codex, reads ~/.codex/models_cache.json for dynamic model discovery.
 */
async function detectAgent(agentType: AgentType): Promise<DetectedAgent> {
  const config = CLI_CONFIGS.find((c) => c.id === agentType);
  if (!config) {
    return {
      id: agentType,
      name: agentType,
      installed: false,
      version: null,
      authenticated: false,
      models: [],
    };
  }

  logger.debug('Detecting agent', { agentType, command: config.command });

  const execPath = await findExecutable(config.command);
  if (!execPath) {
    logger.debug('Agent not found', { agentType });
    return {
      id: config.id,
      name: config.name,
      installed: false,
      version: null,
      authenticated: false,
      models: [],
    };
  }

  logger.debug('Agent found', { agentType, execPath });

  // Run version check, auth check, and dynamic model discovery in parallel
  const [version, authenticated, models] = await Promise.all([
    getVersion(execPath, config.versionArgs),
    checkAuthFast(config),
    loadDynamicModels(config),
  ]);

  logger.debug('Agent detection complete', { agentType, version, authenticated, modelCount: models.length });

  return {
    id: config.id,
    name: config.name,
    installed: true,
    version,
    authenticated,
    models,
  };
}

/**
 * Detect all installed coding CLI agents.
 * Results are cached for 5 minutes.
 *
 * This is now fast (~500ms total) because:
 * 1. All agents are detected in parallel
 * 2. Auth check reads config files instead of spawning CLI processes
 */
async function detectInstalledAgents(): Promise<DetectedAgent[]> {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    logger.debug('Returning cached agent detection results');
    return cache.agents;
  }

  logger.info('Detecting installed agents');

  const agents = await Promise.all(
    CLI_CONFIGS.map((config) => detectAgent(config.id))
  );

  // Update cache
  cache = { agents, timestamp: Date.now() };

  const installed = agents.filter((a) => a.installed);
  logger.info('Agent detection complete', {
    total: agents.length,
    installed: installed.length,
    names: installed.map((a) => a.name),
  });

  return agents;
}

export { detectInstalledAgents, detectAgent, clearAgentCache };
