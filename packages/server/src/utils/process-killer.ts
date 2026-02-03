import { spawn, ChildProcess, execSync } from 'child_process';
import { createLogger } from './logger.js';

const logger = createLogger('process-killer');

/**
 * Process tracking entry.
 */
interface TrackedProcess {
  proc: ChildProcess;
  taskId: string | undefined;
}

/**
 * Tracks all spawned processes for cleanup on cancellation.
 */
const activeProcesses = new Map<number, TrackedProcess>();

/**
 * Registers a spawned process for tracking.
 *
 * @param proc - The spawned child process
 * @param taskId - Optional task ID for filtering cleanup
 */
export function registerProcess(proc: ChildProcess, taskId?: string): void {
  if (proc.pid !== undefined) {
    const entry: TrackedProcess = { proc, taskId };
    activeProcesses.set(proc.pid, entry);
    logger.debug('Process registered', { pid: proc.pid, taskId });

    // Auto-remove when process exits
    proc.on('exit', () => {
      if (proc.pid !== undefined) {
        activeProcesses.delete(proc.pid);
        logger.debug('Process unregistered on exit', { pid: proc.pid });
      }
    });

    proc.on('error', () => {
      if (proc.pid !== undefined) {
        activeProcesses.delete(proc.pid);
        logger.debug('Process unregistered on error', { pid: proc.pid });
      }
    });
  }
}

/**
 * Unregisters a process from tracking.
 *
 * @param pid - The process ID to unregister
 */
export function unregisterProcess(pid: number): void {
  activeProcesses.delete(pid);
}

/**
 * Kills a process tree (the process and all its children).
 * On Windows, uses taskkill /T to kill the entire tree.
 * On Unix, uses process group kill or recursive child kill.
 *
 * @param pid - The process ID to kill
 * @param signal - The signal to send (default: SIGKILL on Unix)
 */
export function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGKILL'): void {
  logger.debug('Killing process tree', { pid, platform: process.platform });

  try {
    if (process.platform === 'win32') {
      // On Windows, use taskkill with /T flag to kill entire process tree
      // /F = force, /T = tree (kill child processes)
      try {
        execSync(`taskkill /F /T /PID ${pid}`, {
          stdio: 'ignore',
          windowsHide: true,
        });
        logger.debug('Process tree killed via taskkill', { pid });
      } catch (error) {
        // taskkill may fail if process already exited - that's okay
        logger.debug('taskkill completed (process may have already exited)', { pid });
      }
    } else {
      // On Unix systems, try to kill the process group first
      try {
        // Negative PID kills the entire process group
        process.kill(-pid, signal);
        logger.debug('Process group killed', { pid });
      } catch {
        // If process group kill fails, try killing just the process
        try {
          process.kill(pid, signal);
          logger.debug('Process killed directly', { pid });
        } catch {
          // Process may have already exited
          logger.debug('Process kill completed (may have already exited)', { pid });
        }
      }
    }
  } catch (error) {
    logger.debug('Error during process tree kill (process may have exited)', { pid, error });
  }

  // Remove from tracking
  activeProcesses.delete(pid);
}

/**
 * Kills a child process and its entire tree.
 * This is the preferred method when you have a reference to the ChildProcess object.
 *
 * @param proc - The child process to kill
 */
export function killChildProcessTree(proc: ChildProcess): void {
  if (proc.pid === undefined) {
    logger.debug('Cannot kill process - no PID');
    return;
  }

  killProcessTree(proc.pid);
}

/**
 * Kills all processes associated with a specific task.
 *
 * @param taskId - The task ID whose processes should be killed
 */
export function killProcessesForTask(taskId: string): void {
  logger.info('Killing all processes for task', { taskId });

  const pidsToKill: number[] = [];

  for (const [pid, info] of activeProcesses.entries()) {
    if (info.taskId === taskId) {
      pidsToKill.push(pid);
    }
  }

  for (const pid of pidsToKill) {
    killProcessTree(pid);
  }

  logger.info('Killed processes for task', { taskId, count: pidsToKill.length });
}

/**
 * Kills all tracked processes.
 * Useful for cleanup on shutdown.
 */
export function killAllProcesses(): void {
  logger.info('Killing all tracked processes', { count: activeProcesses.size });

  const pidsToKill = Array.from(activeProcesses.keys());

  for (const pid of pidsToKill) {
    killProcessTree(pid);
  }
}

/**
 * Gets the count of active tracked processes.
 */
export function getActiveProcessCount(): number {
  return activeProcesses.size;
}

/**
 * Attempts to kill processes that have files open in a specific directory.
 * This is useful before attempting to delete a directory on Windows.
 *
 * Note: This is a best-effort operation and may not catch all processes.
 *
 * @param directoryPath - The directory path to check
 */
export async function killProcessesInDirectory(directoryPath: string): Promise<void> {
  if (process.platform !== 'win32') {
    // On Unix, file locks are generally not an issue for deletion
    return;
  }

  logger.debug('Attempting to kill processes with files open in directory', { directoryPath });

  try {
    // Normalize path for Windows
    const normalizedPath = directoryPath.replace(/\//g, '\\');

    // Use handle.exe if available (from Sysinternals) - but this is often not installed
    // Instead, we'll use a PowerShell approach to find processes with open handles

    // Method 1: Try using PowerShell to find processes with open file handles
    // This is a best-effort approach
    const psCommand = `
      $path = '${normalizedPath.replace(/'/g, "''")}'
      Get-Process | Where-Object {
        $_.Path -like "$path*" -or
        ($_.Modules | Where-Object { $_.FileName -like "$path*" })
      } | ForEach-Object { $_.Id }
    `.replace(/\n/g, ' ');

    try {
      const result = execSync(`powershell -Command "${psCommand}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
        timeout: 5000,
      });

      const pids = result
        .split('\n')
        .map((line) => parseInt(line.trim(), 10))
        .filter((pid) => !isNaN(pid) && pid > 0);

      if (pids.length > 0) {
        logger.info('Found processes with files in directory', { directoryPath, pids });
        for (const pid of pids) {
          // Don't kill our own process
          if (pid !== process.pid) {
            killProcessTree(pid);
          }
        }
      }
    } catch {
      // PowerShell command failed - that's okay, continue anyway
      logger.debug('PowerShell process detection did not find any processes');
    }

    // Method 2: Kill any tracked processes that might be related
    // Check if any of our tracked processes might have files in this directory
    for (const [pid, info] of activeProcesses.entries()) {
      // We don't have a direct way to know if a process has files in a directory,
      // so we rely on taskId association if available
      killProcessTree(pid);
    }
  } catch (error) {
    logger.debug('Error while trying to kill processes in directory', { directoryPath, error });
  }
}

/**
 * Spawns a process with automatic tracking for cleanup.
 * This is a wrapper around child_process.spawn that registers the process.
 *
 * @param command - The command to spawn
 * @param args - Arguments for the command
 * @param options - Spawn options
 * @param taskId - Optional task ID for cleanup association
 * @returns The spawned child process
 */
export function spawnTracked(
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
  taskId?: string
): ChildProcess {
  const proc = spawn(command, args, options);
  registerProcess(proc, taskId);
  return proc;
}
