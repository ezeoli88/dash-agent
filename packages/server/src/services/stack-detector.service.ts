import { Octokit } from 'octokit';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Detected technology stack
 */
export interface DetectedStack {
  framework: string | null;
  state_management: string | null;
  styling: string | null;
  testing: string | null;
}

/**
 * Response from stack detection
 */
export interface StackDetectionResponse {
  detected_stack: DetectedStack;
  confidence: {
    framework: number;
    state_management: number;
    styling: number;
    testing: number;
  };
}

/**
 * Default empty detected stack
 */
export const DEFAULT_DETECTED_STACK: DetectedStack = {
  framework: null,
  state_management: null,
  styling: null,
  testing: null,
};

const logger = createLogger('stack-detector');

/**
 * Configuration for common frameworks and libraries to detect
 */
const FRAMEWORK_PATTERNS: Record<string, string[]> = {
  'Next.js': ['next', '@next/'],
  'React': ['react', 'react-dom'],
  'Vue.js': ['vue', '@vue/'],
  'Angular': ['@angular/core', '@angular/'],
  'Svelte': ['svelte', '@sveltejs/'],
  'Nuxt.js': ['nuxt', '@nuxt/'],
  'Remix': ['@remix-run/'],
  'Astro': ['astro'],
  'Express': ['express'],
  'NestJS': ['@nestjs/core', '@nestjs/'],
  'Fastify': ['fastify'],
  'Hono': ['hono'],
};

const STATE_MANAGEMENT_PATTERNS: Record<string, string[]> = {
  'Zustand': ['zustand'],
  'Redux': ['redux', '@reduxjs/toolkit', 'react-redux'],
  'Jotai': ['jotai'],
  'Recoil': ['recoil'],
  'MobX': ['mobx', 'mobx-react'],
  'Pinia': ['pinia'],
  'Vuex': ['vuex'],
  'TanStack Query': ['@tanstack/react-query', 'react-query'],
  'SWR': ['swr'],
  'XState': ['xstate'],
};

const STYLING_PATTERNS: Record<string, string[]> = {
  'Tailwind CSS': ['tailwindcss', '@tailwindcss/'],
  'styled-components': ['styled-components'],
  'Emotion': ['@emotion/react', '@emotion/styled'],
  'CSS Modules': [], // Detected by file patterns
  'Sass': ['sass', 'node-sass'],
  'Less': ['less'],
  'Chakra UI': ['@chakra-ui/react'],
  'Material UI': ['@mui/material', '@material-ui/'],
  'Ant Design': ['antd'],
  'shadcn/ui': [], // Detected by file patterns
};

const TESTING_PATTERNS: Record<string, string[]> = {
  'Vitest': ['vitest'],
  'Jest': ['jest', '@jest/'],
  'Playwright': ['@playwright/test', 'playwright'],
  'Cypress': ['cypress'],
  'Testing Library': ['@testing-library/'],
  'Mocha': ['mocha'],
  'AVA': ['ava'],
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

/**
 * Service for detecting the technology stack of a repository
 */
export class StackDetectorService {
  private octokit: Octokit;

  constructor(githubToken: string) {
    this.octokit = new Octokit({ auth: githubToken });
  }

  /**
   * Detect the technology stack of a repository
   */
  async detectStack(owner: string, repo: string, branch: string = 'main'): Promise<StackDetectionResponse> {
    logger.info('Detecting stack for repository', { owner, repo, branch });

    try {
      // Get package.json content
      const packageJson = await this.getPackageJson(owner, repo, branch);

      // Get root files for additional detection
      const rootFiles = await this.getRootFiles(owner, repo, branch);

      // Detect each category
      const [framework, frameworkConfidence] = this.detectCategory(packageJson, FRAMEWORK_PATTERNS);
      const [stateManagement, stateConfidence] = this.detectCategory(packageJson, STATE_MANAGEMENT_PATTERNS);
      let [styling, stylingConfidence] = this.detectCategory(packageJson, STYLING_PATTERNS);
      const [testing, testingConfidence] = this.detectCategory(packageJson, TESTING_PATTERNS);

      // Additional file-based detection
      if (!styling && rootFiles.some(f => f.name === 'tailwind.config.js' || f.name === 'tailwind.config.ts')) {
        styling = 'Tailwind CSS';
        stylingConfidence = 0.9;
      }

      // Check for shadcn/ui by looking for components.json
      if (rootFiles.some(f => f.name === 'components.json')) {
        if (styling) {
          styling = `${styling}, shadcn/ui`;
        } else {
          styling = 'shadcn/ui';
          stylingConfidence = 0.9;
        }
      }

      const detectedStack: DetectedStack = {
        framework,
        state_management: stateManagement,
        styling,
        testing,
      };

      const result: StackDetectionResponse = {
        detected_stack: detectedStack,
        confidence: {
          framework: frameworkConfidence,
          state_management: stateConfidence,
          styling: stylingConfidence,
          testing: testingConfidence,
        },
      };

      logger.info('Stack detected successfully', {
        owner,
        repo,
        stack: detectedStack,
      });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to detect stack', { owner, repo, error: errorMessage });

      // Return empty stack on error
      return {
        detected_stack: {
          framework: null,
          state_management: null,
          styling: null,
          testing: null,
        },
        confidence: {
          framework: 0,
          state_management: 0,
          styling: 0,
          testing: 0,
        },
      };
    }
  }

  /**
   * Get package.json from repository
   */
  private async getPackageJson(owner: string, repo: string, branch: string): Promise<PackageJson | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: 'package.json',
        ref: branch,
      });

      if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        return JSON.parse(content) as PackageJson;
      }
    } catch (error) {
      logger.debug('Could not fetch package.json', { owner, repo, error: getErrorMessage(error) });
    }
    return null;
  }

  /**
   * Get list of files in repository root
   */
  private async getRootFiles(owner: string, repo: string, branch: string): Promise<FileInfo[]> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: '',
        ref: branch,
      });

      if (Array.isArray(response.data)) {
        return response.data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type as 'file' | 'dir',
        }));
      }
    } catch (error) {
      logger.debug('Could not fetch root files', { owner, repo, error: getErrorMessage(error) });
    }
    return [];
  }

  /**
   * Detect a category (framework, state management, etc.) from package.json
   */
  private detectCategory(
    packageJson: PackageJson | null,
    patterns: Record<string, string[]>
  ): [string | null, number] {
    if (!packageJson) {
      return [null, 0];
    }

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const depNames = Object.keys(allDeps);

    for (const [name, searchPatterns] of Object.entries(patterns)) {
      if (searchPatterns.length === 0) continue;

      for (const pattern of searchPatterns) {
        const found = depNames.some(dep =>
          dep === pattern || dep.startsWith(pattern)
        );
        if (found) {
          // Higher confidence if it's a direct match
          const confidence = depNames.includes(pattern) ? 1.0 : 0.9;
          return [name, confidence];
        }
      }
    }

    return [null, 0];
  }
}

/**
 * Create a stack detector service with the given GitHub token
 */
export function createStackDetector(githubToken: string): StackDetectorService {
  return new StackDetectorService(githubToken);
}

/**
 * Service for detecting the technology stack of a LOCAL repository (filesystem-based, no GitHub API)
 */
export class LocalStackDetectorService {
  /**
   * Detect the technology stack from a local repository path
   */
  async detectStack(repoPath: string): Promise<StackDetectionResponse> {
    logger.info('Detecting stack for local repository', { repoPath });

    try {
      const packageJson = await this.getPackageJson(repoPath);
      const rootFiles = await this.getRootFiles(repoPath);

      // Reuse the same detection logic pattern
      const [framework, frameworkConfidence] = this.detectCategory(packageJson, FRAMEWORK_PATTERNS);
      const [stateManagement, stateConfidence] = this.detectCategory(packageJson, STATE_MANAGEMENT_PATTERNS);
      let [styling, stylingConfidence] = this.detectCategory(packageJson, STYLING_PATTERNS);
      const [testing, testingConfidence] = this.detectCategory(packageJson, TESTING_PATTERNS);

      // Additional file-based detection
      if (!styling && rootFiles.some(f => f === 'tailwind.config.js' || f === 'tailwind.config.ts')) {
        styling = 'Tailwind CSS';
        stylingConfidence = 0.9;
      }

      if (rootFiles.some(f => f === 'components.json')) {
        if (styling) {
          styling = `${styling}, shadcn/ui`;
        } else {
          styling = 'shadcn/ui';
          stylingConfidence = 0.9;
        }
      }

      const detectedStack: DetectedStack = {
        framework,
        state_management: stateManagement,
        styling,
        testing,
      };

      return {
        detected_stack: detectedStack,
        confidence: {
          framework: frameworkConfidence,
          state_management: stateConfidence,
          styling: stylingConfidence,
          testing: testingConfidence,
        },
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to detect local stack', { repoPath, error: errorMessage });
      return {
        detected_stack: DEFAULT_DETECTED_STACK,
        confidence: { framework: 0, state_management: 0, styling: 0, testing: 0 },
      };
    }
  }

  private async getPackageJson(repoPath: string): Promise<PackageJson | null> {
    try {
      const { readFile } = await import('fs/promises');
      const content = await readFile(join(repoPath, 'package.json'), 'utf-8');
      return JSON.parse(content) as PackageJson;
    } catch {
      return null;
    }
  }

  private async getRootFiles(repoPath: string): Promise<string[]> {
    try {
      const { readdir } = await import('fs/promises');
      const entries = await readdir(repoPath);
      return entries;
    } catch {
      return [];
    }
  }

  private detectCategory(
    packageJson: PackageJson | null,
    patterns: Record<string, string[]>
  ): [string | null, number] {
    if (!packageJson) return [null, 0];

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const depNames = Object.keys(allDeps);

    for (const [name, searchPatterns] of Object.entries(patterns)) {
      if (searchPatterns.length === 0) continue;
      for (const pattern of searchPatterns) {
        const found = depNames.some(dep => dep === pattern || dep.startsWith(pattern));
        if (found) {
          const confidence = depNames.includes(pattern) ? 1.0 : 0.9;
          return [name, confidence];
        }
      }
    }
    return [null, 0];
  }
}

export function createLocalStackDetector(): LocalStackDetectorService {
  return new LocalStackDetectorService();
}
