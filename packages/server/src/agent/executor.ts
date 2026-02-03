import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { isCommandAllowed } from './whitelist.js';
import { registerProcess, killChildProcessTree } from '../utils/process-killer.js';

const logger = createLogger('tool-executor');

/**
 * Maximum output size in bytes (10KB).
 */
const MAX_OUTPUT_SIZE = 10 * 1024;

/**
 * Command execution timeout in milliseconds (30 seconds).
 */
const COMMAND_TIMEOUT_MS = 30 * 1000;

/**
 * Maximum file size that can be read (1MB).
 */
const MAX_FILE_SIZE = 1024 * 1024;

/**
 * Result of executing a tool.
 */
export interface ToolResult {
  /** Whether the tool execution was successful */
  success: boolean;
  /** The output from the tool */
  output: string;
  /** Error message if the execution failed */
  error?: string;
}

/**
 * Truncates output if it exceeds the maximum size.
 */
function truncateOutput(output: string, maxSize: number = MAX_OUTPUT_SIZE): string {
  if (output.length <= maxSize) {
    return output;
  }
  const truncated = output.substring(0, maxSize);
  return `${truncated}\n\n[Output truncated - exceeded ${maxSize} bytes]`;
}

/**
 * Normalizes a path for the current platform.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Validates that a path is within the workspace and doesn't try to escape.
 */
function isPathWithinWorkspace(workspacePath: string, targetPath: string): boolean {
  const normalizedWorkspace = path.resolve(workspacePath);
  const normalizedTarget = path.resolve(workspacePath, targetPath);

  // Ensure workspace path ends with separator to avoid false positives
  // (e.g., workspace="/var/data" shouldn't match target="/var/data2")
  const workspaceWithSep = normalizedWorkspace.endsWith(path.sep)
    ? normalizedWorkspace
    : normalizedWorkspace + path.sep;

  return normalizedTarget === normalizedWorkspace ||
    normalizedTarget.startsWith(workspaceWithSep);
}

/**
 * Resolves a relative path within the workspace.
 */
function resolvePath(workspacePath: string, relativePath: string): string {
  // Normalize the path separators and resolve
  const normalized = relativePath.replace(/\\/g, '/');
  return path.resolve(workspacePath, normalized);
}

/**
 * Tool executor that runs tools within a sandboxed workspace.
 */
export class ToolExecutor {
  private readonly workspacePath: string;
  private readonly taskId: string | undefined;

  constructor(workspacePath: string, taskId?: string) {
    this.workspacePath = path.resolve(workspacePath);
    this.taskId = taskId;
    logger.debug('ToolExecutor initialized', { workspacePath: this.workspacePath, taskId });
  }

  /**
   * Executes a tool by name with the provided arguments.
   *
   * @param toolName - Name of the tool to execute
   * @param args - Arguments for the tool
   * @returns The result of the tool execution
   */
  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    logger.debug('Executing tool', { toolName, args });

    try {
      switch (toolName) {
        case 'read_file':
          return await this.readFile(args.path as string);

        case 'write_file':
          return await this.writeFile(args.path as string, args.content as string);

        case 'list_directory':
          return await this.listDirectory(args.path as string);

        case 'run_command':
          return await this.runCommand(args.command as string);

        case 'verify_server':
          return await this.verifyServer(
            args.command as string,
            args.success_patterns as string[],
            args.timeout_seconds as number | undefined
          );

        case 'search_files':
          return await this.searchFiles(args.pattern as string, args.path as string | undefined);

        case 'task_complete':
          return this.taskComplete(args.summary as string);

        default:
          return {
            success: false,
            output: '',
            error: `Unknown tool: ${toolName}`,
          };
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Tool execution failed', { toolName, error: errorMessage });
      return {
        success: false,
        output: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Reads the contents of a file.
   */
  private async readFile(relativePath: string): Promise<ToolResult> {
    if (!relativePath) {
      return { success: false, output: '', error: 'Path is required' };
    }

    // Validate path is within workspace
    if (!isPathWithinWorkspace(this.workspacePath, relativePath)) {
      return {
        success: false,
        output: '',
        error: 'Path must be within the workspace',
      };
    }

    const fullPath = resolvePath(this.workspacePath, relativePath);

    try {
      // Check file size before reading
      const stats = await fs.stat(fullPath);
      if (stats.size > MAX_FILE_SIZE) {
        return {
          success: false,
          output: '',
          error: `File is too large (${stats.size} bytes). Maximum allowed: ${MAX_FILE_SIZE} bytes`,
        };
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      logger.debug('File read successfully', { path: relativePath, size: content.length });

      return {
        success: true,
        output: truncateOutput(content),
      };
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code === 'ENOENT') {
        return { success: false, output: '', error: `File not found: ${relativePath}` };
      }
      if (fsError.code === 'EISDIR') {
        return { success: false, output: '', error: `Path is a directory, not a file: ${relativePath}` };
      }
      throw error;
    }
  }

  /**
   * Writes content to a file, creating directories as needed.
   */
  private async writeFile(relativePath: string, content: string): Promise<ToolResult> {
    if (!relativePath) {
      return { success: false, output: '', error: 'Path is required' };
    }
    if (content === undefined || content === null) {
      return { success: false, output: '', error: 'Content is required' };
    }

    // Validate path is within workspace
    if (!isPathWithinWorkspace(this.workspacePath, relativePath)) {
      return {
        success: false,
        output: '',
        error: 'Path must be within the workspace',
      };
    }

    const fullPath = resolvePath(this.workspacePath, relativePath);

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(fullPath);
      await fs.mkdir(parentDir, { recursive: true });

      // Write the file
      await fs.writeFile(fullPath, content, 'utf-8');

      logger.debug('File written successfully', { path: relativePath, size: content.length });

      return {
        success: true,
        output: `File written successfully: ${relativePath} (${content.length} bytes)`,
      };
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      throw new Error(`Failed to write file: ${fsError.message}`);
    }
  }

  /**
   * Lists contents of a directory.
   */
  private async listDirectory(relativePath: string): Promise<ToolResult> {
    const targetPath = relativePath || '.';

    // Validate path is within workspace
    if (!isPathWithinWorkspace(this.workspacePath, targetPath)) {
      return {
        success: false,
        output: '',
        error: 'Path must be within the workspace',
      };
    }

    const fullPath = resolvePath(this.workspacePath, targetPath);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      const formatted = entries.map((entry) => {
        const type = entry.isDirectory() ? '[DIR]' : '[FILE]';
        return `${type} ${entry.name}`;
      });

      // Sort directories first, then files
      formatted.sort((a, b) => {
        const aIsDir = a.startsWith('[DIR]');
        const bIsDir = b.startsWith('[DIR]');
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });

      logger.debug('Directory listed successfully', { path: targetPath, count: entries.length });

      return {
        success: true,
        output: formatted.join('\n') || '(empty directory)',
      };
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code === 'ENOENT') {
        return { success: false, output: '', error: `Directory not found: ${targetPath}` };
      }
      if (fsError.code === 'ENOTDIR') {
        return { success: false, output: '', error: `Path is not a directory: ${targetPath}` };
      }
      throw error;
    }
  }

  /**
   * Runs a whitelisted shell command.
   */
  private async runCommand(command: string): Promise<ToolResult> {
    if (!command) {
      return { success: false, output: '', error: 'Command is required' };
    }

    // Validate command against whitelist
    const validation = isCommandAllowed(command);
    if (!validation.allowed) {
      logger.warn('Command blocked by whitelist', { command, reason: validation.reason });
      return {
        success: false,
        output: '',
        error: `Command not allowed: ${validation.reason}`,
      };
    }

    logger.debug('Running command', { command });

    return new Promise((resolve) => {
      // Use shell on Windows, direct execution on Unix
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? true : '/bin/sh';

      // On Windows, spawn with detached: false to ensure child processes
      // are in the same job object and can be killed together
      const proc = spawn(command, {
        cwd: this.workspacePath,
        shell,
        env: {
          ...process.env,
          // Restrict some environment variables for security
          HOME: this.workspacePath,
          USER: 'agent',
        },
        timeout: COMMAND_TIMEOUT_MS,
        // On Windows, this helps with process tree management
        windowsHide: true,
      });

      // Register the process for tracking (enables proper cleanup on cancellation)
      registerProcess(proc, this.taskId);

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Helper to kill the process tree properly
      const killProcess = () => {
        killed = true;
        // Use the process killer which handles Windows properly
        killChildProcessTree(proc);
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        logger.warn('Command timed out, killing process tree', { command, pid: proc.pid });
        killProcess();
      }, COMMAND_TIMEOUT_MS);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        // Prevent memory issues with very large outputs
        if (stdout.length > MAX_OUTPUT_SIZE * 2) {
          logger.warn('Command output too large, killing process tree', { command, pid: proc.pid });
          killProcess();
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > MAX_OUTPUT_SIZE * 2) {
          logger.warn('Command stderr too large, killing process tree', { command, pid: proc.pid });
          killProcess();
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output: '',
          error: `Failed to execute command: ${error.message}`,
        });
      });

      proc.on('close', (exitCode) => {
        clearTimeout(timeout);

        if (killed) {
          resolve({
            success: false,
            output: truncateOutput(stdout),
            error: 'Command timed out or produced too much output',
          });
          return;
        }

        const combinedOutput = stdout + (stderr ? `\n[STDERR]\n${stderr}` : '');

        logger.debug('Command completed', { command, exitCode });

        if (exitCode === 0) {
          resolve({
            success: true,
            output: truncateOutput(combinedOutput),
          });
        } else {
          resolve({
            success: false,
            output: truncateOutput(combinedOutput),
            error: `Command exited with code ${exitCode}`,
          });
        }
      });
    });
  }

  /**
   * Starts a server and verifies it starts successfully by monitoring output.
   * The server is automatically killed after verification.
   */
  private async verifyServer(
    command: string,
    successPatterns: string[],
    timeoutSeconds: number = 30
  ): Promise<ToolResult> {
    if (!command) {
      return { success: false, output: '', error: 'Command is required' };
    }

    if (!successPatterns || successPatterns.length === 0) {
      return { success: false, output: '', error: 'At least one success pattern is required' };
    }

    // Validate command against whitelist
    const validation = isCommandAllowed(command);
    if (!validation.allowed) {
      logger.warn('Command blocked by whitelist', { command, reason: validation.reason });
      return {
        success: false,
        output: '',
        error: `Command not allowed: ${validation.reason}`,
      };
    }

    // Ensure timeout is reasonable (between 5 and 120 seconds)
    const effectiveTimeout = Math.max(5, Math.min(120, timeoutSeconds)) * 1000;
    // Stabilization delay after pattern match (2 seconds)
    const STABILIZATION_DELAY_MS = 2000;

    logger.info('Starting server verification', {
      command,
      successPatterns,
      timeoutSeconds: effectiveTimeout / 1000,
    });

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? true : '/bin/sh';

      const proc = spawn(command, {
        cwd: this.workspacePath,
        shell,
        env: {
          ...process.env,
          HOME: this.workspacePath,
          USER: 'agent',
        },
        windowsHide: true,
      });

      // Register the process for tracking
      registerProcess(proc, this.taskId);

      let stdout = '';
      let stderr = '';
      let killed = false;
      let matchedPattern: string | null = null;
      let resolved = false;

      // Helper to safely resolve only once
      const safeResolve = (result: ToolResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        resolve(result);
      };

      // Helper to kill the process tree properly
      const killProcess = () => {
        if (killed) return;
        killed = true;
        logger.debug('Killing server process tree', { pid: proc.pid });
        killChildProcessTree(proc);
      };

      // Check if any success pattern matches the current output
      const checkForSuccessPattern = (output: string): string | null => {
        for (const pattern of successPatterns) {
          if (output.toLowerCase().includes(pattern.toLowerCase())) {
            return pattern;
          }
        }
        return null;
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        logger.warn('Server verification timed out', {
          command,
          pid: proc.pid,
          timeoutSeconds: effectiveTimeout / 1000,
        });
        killProcess();
        const combinedOutput = stdout + (stderr ? `\n[STDERR]\n${stderr}` : '');
        safeResolve({
          success: false,
          output: truncateOutput(combinedOutput),
          error: `Server did not start within ${effectiveTimeout / 1000} seconds. No success pattern matched. Patterns: [${successPatterns.join(', ')}]`,
        });
      }, effectiveTimeout);

      const handleData = (data: Buffer, isStderr: boolean) => {
        const text = data.toString();
        if (isStderr) {
          stderr += text;
        } else {
          stdout += text;
        }

        // Prevent memory issues with very large outputs
        if (stdout.length > MAX_OUTPUT_SIZE * 2 || stderr.length > MAX_OUTPUT_SIZE * 2) {
          logger.warn('Server output too large, killing process', { command, pid: proc.pid });
          killProcess();
          safeResolve({
            success: false,
            output: truncateOutput(stdout),
            error: 'Server output exceeded maximum size before matching success pattern',
          });
          return;
        }

        // Check for success pattern in combined output
        if (!matchedPattern) {
          const combinedOutput = stdout + stderr;
          const matched = checkForSuccessPattern(combinedOutput);
          if (matched) {
            matchedPattern = matched;
            logger.info('Success pattern matched', { pattern: matched, command });

            // Wait for stabilization before killing
            setTimeout(() => {
              logger.info('Server verified successfully, killing process', {
                command,
                pattern: matchedPattern,
                pid: proc.pid,
              });
              killProcess();
              const combinedOutput = stdout + (stderr ? `\n[STDERR]\n${stderr}` : '');
              safeResolve({
                success: true,
                output: truncateOutput(
                  `Server started successfully!\n\nMatched pattern: "${matchedPattern}"\n\n--- Server Output ---\n${combinedOutput}`
                ),
              });
            }, STABILIZATION_DELAY_MS);
          }
        }
      };

      proc.stdout?.on('data', (data: Buffer) => handleData(data, false));
      proc.stderr?.on('data', (data: Buffer) => handleData(data, true));

      proc.on('error', (error) => {
        logger.error('Server process error', { command, error: error.message });
        killProcess();
        safeResolve({
          success: false,
          output: '',
          error: `Failed to start server: ${error.message}`,
        });
      });

      proc.on('close', (exitCode) => {
        // Only handle close if we haven't already resolved
        if (resolved) return;

        logger.debug('Server process exited', { command, exitCode, matchedPattern });

        // If the process exited before matching a pattern, it crashed
        if (!matchedPattern) {
          const combinedOutput = stdout + (stderr ? `\n[STDERR]\n${stderr}` : '');
          safeResolve({
            success: false,
            output: truncateOutput(combinedOutput),
            error: `Server process exited with code ${exitCode} before matching any success pattern. The server may have crashed or failed to start.`,
          });
        }
        // If we matched a pattern but process exited (killed by us), that's handled by the timeout above
      });
    });
  }

  /**
   * Searches for a pattern in files.
   */
  private async searchFiles(pattern: string, relativePath?: string): Promise<ToolResult> {
    if (!pattern) {
      return { success: false, output: '', error: 'Pattern is required' };
    }

    const searchPath = relativePath || '.';

    // Validate path is within workspace
    if (!isPathWithinWorkspace(this.workspacePath, searchPath)) {
      return {
        success: false,
        output: '',
        error: 'Path must be within the workspace',
      };
    }

    const fullSearchPath = resolvePath(this.workspacePath, searchPath);

    try {
      // Check if search path exists
      const stats = await fs.stat(fullSearchPath);
      if (!stats.isDirectory()) {
        return { success: false, output: '', error: `Search path is not a directory: ${searchPath}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, output: '', error: `Search path error (${searchPath}): ${message}` };
    }

    // Use grep on Unix, findstr on Windows
    const isWindows = process.platform === 'win32';
    let command: string;

    if (isWindows) {
      // Use findstr on Windows with recursive search
      // Escape special characters in pattern for findstr
      const escapedPattern = pattern.replace(/[<>|&^]/g, '^$&');
      command = `findstr /s /n /i "${escapedPattern}" *`;
    } else {
      // Use grep on Unix
      // -r recursive, -n line numbers, -i case insensitive, --include to skip binary files
      const escapedPattern = pattern.replace(/'/g, "'\\''");
      command = `grep -rn --include='*.*' '${escapedPattern}' .`;
    }

    // Run the search command
    return new Promise((resolve) => {
      const proc = spawn(command, {
        cwd: fullSearchPath,
        shell: true,
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
      });

      // Register the process for tracking
      registerProcess(proc, this.taskId);

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timeout = setTimeout(() => {
        killed = true;
        killChildProcessTree(proc);
        resolve({
          success: false,
          output: truncateOutput(stdout),
          error: 'Search timed out',
        });
      }, COMMAND_TIMEOUT_MS);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output: '',
          error: `Search failed: ${error.message}`,
        });
      });

      proc.on('close', (exitCode) => {
        clearTimeout(timeout);

        if (killed) {
          return; // Already resolved in timeout handler
        }

        // grep returns 1 if no matches found, which is not an error
        if (exitCode === 1 && stdout === '') {
          resolve({
            success: true,
            output: 'No matches found',
          });
          return;
        }

        logger.debug('Search completed', { pattern, path: searchPath, exitCode });

        resolve({
          success: true,
          output: truncateOutput(stdout) || 'No matches found',
        });
      });
    });
  }

  /**
   * Signals task completion.
   */
  private taskComplete(summary: string): ToolResult {
    if (!summary) {
      return { success: false, output: '', error: 'Summary is required' };
    }

    logger.info('Task marked as complete', { summary });

    return {
      success: true,
      output: `Task completed: ${summary}`,
    };
  }
}

export default ToolExecutor;
