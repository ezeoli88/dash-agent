import { execFile } from 'child_process';
import { promisify } from 'util';
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
}

const CLI_CONFIGS: CLIConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    versionArgs: ['--version'],
    authCheckArgs: ['-p', 'hi', '--output-format', 'json', '--max-turns', '1'],
    models: [
      { id: 'opus', name: 'Claude Opus' },
      { id: 'sonnet', name: 'Claude Sonnet' },
      { id: 'haiku', name: 'Claude Haiku' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    versionArgs: ['--version'],
    authCheckArgs: ['exec', 'hi', '--json'],
    models: [
      { id: 'o3', name: 'O3' },
      { id: 'o4-mini', name: 'O4 Mini' },
    ],
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
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: 'gemini',
    versionArgs: ['--version'],
    authCheckArgs: ['--non-interactive', 'hi'],
    models: [
      { id: 'default', name: 'Default' },
      { id: 'flash', name: 'Gemini Flash' },
      { id: 'pro', name: 'Gemini Pro' },
    ],
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

const isWindows = process.platform === 'win32';

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
    });
    const firstLine = stdout.trim().split(/\r?\n/)[0];
    return firstLine ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if a CLI tool is authenticated by running a quick command.
 * Returns true if the command exits with code 0.
 */
async function checkAuth(execPath: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(execPath, args, {
      timeout: 15000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect a single agent by its type.
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

  const version = await getVersion(execPath, config.versionArgs);
  const authenticated = await checkAuth(execPath, config.authCheckArgs);

  logger.debug('Agent detection complete', { agentType, version, authenticated });

  return {
    id: config.id,
    name: config.name,
    installed: true,
    version,
    authenticated,
    models: config.models,
  };
}

/**
 * Detect all installed coding CLI agents.
 * Results are cached for 5 minutes.
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
