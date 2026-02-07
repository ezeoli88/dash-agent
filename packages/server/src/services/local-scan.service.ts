import { readdir, access } from 'fs/promises';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';

const logger = createLogger('local-scan');

export interface LocalRepository {
  name: string;
  path: string;
  current_branch: string;
  remote_url: string | null;
  has_package_json: boolean;
  language: string | null;
}

export interface LocalReposResponse {
  repos: LocalRepository[];
  scan_path: string;
  total: number;
}

export class LocalScanService {
  /**
   * Scan a directory for git repositories (1 level deep)
   */
  async scanForRepos(basePath?: string): Promise<LocalReposResponse> {
    const scanPath = basePath || process.env.LOCAL_SCAN_DIR || this.getDefaultScanPath();

    logger.info('Scanning for local repos', { scanPath });

    const repos: LocalRepository[] = [];

    try {
      const entries = await readdir(scanPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const dirPath = join(scanPath, entry.name);
        const gitPath = join(dirPath, '.git');

        try {
          await access(gitPath);
        } catch {
          continue; // No .git directory
        }

        try {
          const repo = await this.inspectRepo(dirPath, entry.name);
          repos.push(repo);
        } catch (error) {
          logger.warn('Failed to inspect repo', { dir: entry.name, error: getErrorMessage(error) });
        }
      }
    } catch (error) {
      logger.errorWithStack('Failed to scan directory', error as Error);
      throw error;
    }

    // Sort alphabetically
    repos.sort((a, b) => a.name.localeCompare(b.name));

    return { repos, scan_path: scanPath, total: repos.length };
  }

  /**
   * Inspect a single git repository
   */
  private async inspectRepo(repoPath: string, name: string): Promise<LocalRepository> {
    // Get current branch
    let currentBranch = 'main';
    try {
      currentBranch = execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf-8' }).trim() || 'main';
    } catch {
      // fallback
    }

    // Get remote URL
    let remoteUrl: string | null = null;
    try {
      remoteUrl = execSync('git remote get-url origin', { cwd: repoPath, encoding: 'utf-8' }).trim() || null;
    } catch {
      // no remote
    }

    // Check for package.json
    let hasPackageJson = false;
    try {
      await access(join(repoPath, 'package.json'));
      hasPackageJson = true;
    } catch {
      // no package.json
    }

    // Detect language hint
    const language = await this.detectLanguage(repoPath, hasPackageJson);

    return {
      name,
      path: repoPath,
      current_branch: currentBranch,
      remote_url: remoteUrl,
      has_package_json: hasPackageJson,
      language,
    };
  }

  /**
   * Simple language detection based on root files
   */
  private async detectLanguage(repoPath: string, hasPackageJson: boolean): Promise<string | null> {
    if (hasPackageJson) {
      // Check if it's TypeScript
      try {
        await access(join(repoPath, 'tsconfig.json'));
        return 'TypeScript';
      } catch {
        return 'JavaScript';
      }
    }

    // Check for other languages
    const languageFiles: [string, string][] = [
      ['Cargo.toml', 'Rust'],
      ['go.mod', 'Go'],
      ['requirements.txt', 'Python'],
      ['pyproject.toml', 'Python'],
      ['Gemfile', 'Ruby'],
      ['pom.xml', 'Java'],
      ['build.gradle', 'Java'],
      ['composer.json', 'PHP'],
    ];

    for (const [file, lang] of languageFiles) {
      try {
        await access(join(repoPath, file));
        return lang;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Get the default scan path by finding the git workspace root and going one level up.
   * This way if the server runs from packages/server/, we scan the parent of the monorepo root.
   */
  private getDefaultScanPath(): string {
    try {
      const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
      // Go one level up from the git root so sibling repos are visible
      return resolve(gitRoot, '..');
    } catch {
      return process.cwd();
    }
  }
}

// Singleton
let instance: LocalScanService | null = null;

export function getLocalScanService(): LocalScanService {
  if (!instance) {
    instance = new LocalScanService();
  }
  return instance;
}
