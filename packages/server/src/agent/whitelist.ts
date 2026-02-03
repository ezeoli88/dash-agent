import { createLogger } from '../utils/logger.js';

const logger = createLogger('command-whitelist');

/**
 * Command whitelist configuration.
 * Keys are command names, values are either:
 * - '*' to allow all subcommands
 * - An array of allowed subcommands
 */
export const COMMAND_WHITELIST: Record<string, string[] | '*'> = {
  // Package managers
  npm: ['install', 'run', 'test', 'build', 'ci', 'ls', 'list', 'outdated', 'audit', 'start'],
  yarn: ['install', 'run', 'test', 'build', 'add', 'list'],
  pnpm: ['install', 'run', 'test', 'build', 'add', 'list'],
  pip: ['install', 'list', 'show', 'freeze'],
  cargo: ['build', 'test', 'fetch', 'check', 'run', 'clippy', 'fmt'],
  go: ['build', 'test', 'mod', 'get', 'fmt', 'vet'],

  // Build tools
  make: '*',
  tsc: '*',
  npx: ['tsc', 'jest', 'eslint', 'prettier', 'vitest', 'mocha'],

  // Runtime (with restrictions - only for testing/running scripts)
  node: '*',
  python: '*',
  python3: '*',

  // Read-only utilities
  ls: '*',
  cat: '*',
  head: '*',
  tail: '*',
  find: '*',
  grep: '*',
  tree: '*',
  wc: '*',
  which: '*',
  echo: '*',
  pwd: '*',
  dir: '*', // Windows equivalent of ls

  // Git (read + local operations only)
  git: ['status', 'diff', 'log', 'branch', 'add', 'commit', 'show', 'rev-parse', 'ls-files'],
};

/**
 * Commands that are explicitly blocked, even if they might appear in a pipeline.
 */
export const BLOCKED_COMMANDS = [
  // Network access
  'curl',
  'wget',
  'ssh',
  'scp',
  'sftp',
  'nc',
  'netcat',
  'telnet',
  'ftp',

  // Destructive file operations
  'rm',
  'rmdir',
  'del', // Windows
  'chmod',
  'chown',
  'chgrp',
  'mkfs',
  'fdisk',
  'dd',

  // Shell injection vectors
  'eval',
  'exec',
  'source',
  'bash',
  'sh',
  'zsh',
  'fish',
  'csh',
  'ksh',
  'powershell',
  'pwsh',
  'cmd',

  // Container/virtualization escape
  'docker',
  'kubectl',
  'podman',
  'vagrant',
  'vboxmanage',

  // Privilege escalation
  'sudo',
  'su',
  'doas',
  'runas',

  // System modification
  'systemctl',
  'service',
  'apt',
  'apt-get',
  'yum',
  'dnf',
  'pacman',
  'brew',
  'choco',

  // Environment manipulation
  'export',
  'set',
  'setx',

  // Process manipulation
  'kill',
  'pkill',
  'killall',
  'taskkill',

  // Dangerous redirects
  'tee',
];

/**
 * Dangerous shell operators that should be blocked.
 */
const DANGEROUS_OPERATORS = ['>', '>>', '<', '|', '&', ';', '`', '$(', '${', '\n', '\r'];

/**
 * Result of command validation - discriminated union type.
 * When allowed is true, sanitizedCommand is guaranteed to exist.
 * When allowed is false, reason is guaranteed to exist.
 */
export type CommandValidationResult =
  | { allowed: true; sanitizedCommand: string }
  | { allowed: false; reason: string };

/**
 * Parsed command result.
 */
interface ParsedCommand {
  baseCommand: string;
  subCommand: string | undefined;
  fullArgs: string[];
}

/**
 * Parses a command string into the base command and arguments.
 */
function parseCommand(command: string): ParsedCommand {
  // Trim and normalize whitespace
  const trimmed = command.trim();

  // Split on whitespace, handling quoted strings simply
  const parts = trimmed.split(/\s+/).filter((p) => p.length > 0);

  if (parts.length === 0) {
    return { baseCommand: '', subCommand: undefined, fullArgs: [] };
  }

  const baseCommand = parts[0]!.toLowerCase();
  const subCommand = parts[1];
  const fullArgs = parts.slice(1);

  return { baseCommand, subCommand, fullArgs };
}

/**
 * Validates if a command is allowed to be executed.
 *
 * @param command - The command string to validate
 * @returns Validation result with allowed status and optional reason
 */
export function isCommandAllowed(command: string): CommandValidationResult {
  // Check for empty command
  if (!command || command.trim().length === 0) {
    return { allowed: false, reason: 'Empty command' };
  }

  const normalizedCommand = command.trim();

  // Check for dangerous shell operators
  for (const operator of DANGEROUS_OPERATORS) {
    if (normalizedCommand.includes(operator)) {
      return {
        allowed: false,
        reason: `Shell operator '${operator}' is not allowed for security reasons`,
      };
    }
  }

  // Parse the command
  const { baseCommand, subCommand, fullArgs } = parseCommand(normalizedCommand);

  // Check if the base command is explicitly blocked
  if (BLOCKED_COMMANDS.includes(baseCommand)) {
    logger.warn('Blocked command attempted', { command: baseCommand });
    return {
      allowed: false,
      reason: `Command '${baseCommand}' is blocked for security reasons`,
    };
  }

  // Check if the base command is in the whitelist
  const whitelistEntry = COMMAND_WHITELIST[baseCommand];
  if (whitelistEntry === undefined) {
    return {
      allowed: false,
      reason: `Command '${baseCommand}' is not in the allowed command list`,
    };
  }

  // If '*' is specified, all subcommands are allowed
  if (whitelistEntry === '*') {
    logger.debug('Command allowed (wildcard)', { command: baseCommand });
    return { allowed: true, sanitizedCommand: normalizedCommand };
  }

  // Check if the subcommand is allowed
  if (subCommand !== undefined) {
    // Handle commands with flags before subcommand (e.g., npm --version)
    const effectiveSubCommand = subCommand.startsWith('-') ? subCommand : subCommand.toLowerCase();

    // Allow flags as subcommands for any whitelisted command
    if (effectiveSubCommand.startsWith('-')) {
      logger.debug('Command allowed (flag subcommand)', { command: baseCommand, flag: effectiveSubCommand });
      return { allowed: true, sanitizedCommand: normalizedCommand };
    }

    if (!whitelistEntry.includes(effectiveSubCommand)) {
      return {
        allowed: false,
        reason: `Subcommand '${subCommand}' is not allowed for '${baseCommand}'. Allowed: ${whitelistEntry.join(', ')}`,
      };
    }
  }

  // For commands with specific subcommands, require a subcommand
  if (Array.isArray(whitelistEntry) && whitelistEntry.length > 0 && subCommand === undefined) {
    // Allow the base command without subcommand only if it makes sense
    // (e.g., 'npm' alone is usually invalid anyway)
    logger.debug('Command allowed (base only)', { command: baseCommand });
    return { allowed: true, sanitizedCommand: normalizedCommand };
  }

  logger.debug('Command allowed', { command: baseCommand, subCommand });
  return { allowed: true, sanitizedCommand: normalizedCommand };
}

/**
 * Gets a list of all allowed commands for documentation.
 */
export function getAllowedCommands(): string[] {
  return Object.keys(COMMAND_WHITELIST);
}

/**
 * Gets the allowed subcommands for a specific command.
 */
export function getAllowedSubcommands(command: string): string[] | '*' | undefined {
  return COMMAND_WHITELIST[command.toLowerCase()];
}

export default { isCommandAllowed, getAllowedCommands, getAllowedSubcommands };
