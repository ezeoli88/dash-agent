import { Router, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { execSync } from 'child_process';
import { platform, tmpdir } from 'os';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { getRepoService } from '../services/repo.service.js';
import { createGitHubService } from '../services/github.service.js';
import { getGitHubCredentials } from '../services/secrets.service.js';
import { getLocalScanService } from '../services/local-scan.service.js';
import { createLocalStackDetector } from '../services/stack-detector.service.js';

const logger = createLogger('repos-router');
const router = Router();

/**
 * Zod schemas for validation
 */
const CreateRepositorySchema = z.object({
  name: z.string().min(1, 'Repository name is required'),
  url: z.string().url('Invalid repository URL'),
  default_branch: z.string().default('main'),
});

const UpdateRepositorySchema = z.object({
  default_branch: z.string().optional(),
  conventions: z.string().optional(),
});

/**
 * Get GitHub token from request header OR from stored secrets
 */
function getGitHubToken(req: Request): string | null {
  // First check header (for backwards compatibility)
  const authHeader = req.headers['x-github-token'];
  if (typeof authHeader === 'string' && authHeader.length > 0) {
    return authHeader;
  }

  // Then check stored secrets
  const credentials = getGitHubCredentials();
  if (credentials) {
    return credentials.token;
  }

  return null;
}

/**
 * GET /repos - List all repositories
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const repoService = getRepoService();
    const repositories = await repoService.getRepositories();

    logger.info('Repositories listed', { count: repositories.length });

    res.json(repositories);
  } catch (error) {
    logger.errorWithStack('Failed to list repositories', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list repositories',
    });
  }
});

/**
 * GET /github/repos - List GitHub repositories for the authenticated user
 * Note: This route must come before /:id to avoid matching 'github' as an id
 */
router.get('/github/repos', async (req: Request, res: Response) => {
  try {
    const githubToken = getGitHubToken(req);

    if (!githubToken) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'GitHub token required',
      });
      return;
    }

    const page = parseInt(req.query['page'] as string) || 1;
    const perPage = parseInt(req.query['per_page'] as string) || 30;
    const search = req.query['search'] as string | undefined;

    const githubService = createGitHubService(githubToken);

    let result;
    if (search && search.trim().length > 0) {
      result = await githubService.searchRepos(search, { page, perPage });
    } else {
      result = await githubService.listUserRepos({ page, perPage });
    }

    logger.info('GitHub repos listed', { count: result.repos.length, search });

    res.json(result);
  } catch (error) {
    logger.errorWithStack('Failed to list GitHub repos', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list GitHub repositories',
    });
  }
});

/**
 * POST /github/repos/validate - Validate a repository URL
 */
router.post('/github/repos/validate', async (req: Request, res: Response) => {
  try {
    const githubToken = getGitHubToken(req);

    if (!githubToken) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'GitHub token required',
      });
      return;
    }

    const { url } = req.body as { url?: string };

    if (!url) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'url is required',
      });
      return;
    }

    const githubService = createGitHubService(githubToken);
    const result = await githubService.validateRepoUrl(url);

    res.json(result);
  } catch (error) {
    logger.errorWithStack('Failed to validate repository URL', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate repository URL',
    });
  }
});

/**
 * GET /repos/local/pick-folder - Open native OS folder picker dialog
 */
router.get('/local/pick-folder', async (_req: Request, res: Response) => {
  try {
    const os = platform();

    if (os === 'win32') {
      // Windows: Write PS1 script to temp file to avoid escaping issues
      const scriptPath = join(tmpdir(), `pick-folder-${Date.now()}.ps1`);
      const psScript = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        "$dialog.Description = 'Select a folder to scan for repositories'",
        '$dialog.ShowNewFolderButton = $false',
        '$result = $dialog.ShowDialog()',
        'if ($result -eq [System.Windows.Forms.DialogResult]::OK) {',
        '  Write-Output $dialog.SelectedPath',
        '} else {',
        "  Write-Output '::CANCELLED::'",
        '}',
      ].join('\r\n');

      writeFileSync(scriptPath, psScript, 'utf-8');

      try {
        const { execFile } = await import('child_process');
        const result = await new Promise<string>((resolve, reject) => {
          execFile(
            'powershell',
            ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
            { encoding: 'utf-8', timeout: 120000 },
            (error, stdout, stderr) => {
              if (error) {
                reject(error);
              } else {
                resolve(stdout.trim());
              }
            }
          );
        });

        if (result && result !== '::CANCELLED::') {
          logger.info('Folder picked', { path: result });
          res.json({ path: result, cancelled: false });
        } else {
          res.json({ path: null, cancelled: true });
        }
      } finally {
        try { unlinkSync(scriptPath); } catch { /* ignore cleanup errors */ }
      }
    } else if (os === 'darwin') {
      // macOS: Use osascript
      try {
        const result = execSync(
          'osascript -e \'POSIX path of (choose folder with prompt "Select a folder to scan for repositories")\'',
          { encoding: 'utf-8', timeout: 120000 }
        ).trim();
        if (result) {
          logger.info('Folder picked', { path: result });
          res.json({ path: result, cancelled: false });
        } else {
          res.json({ path: null, cancelled: true });
        }
      } catch {
        // User cancelled
        res.json({ path: null, cancelled: true });
      }
    } else {
      // Linux: Use zenity
      try {
        const result = execSync(
          'zenity --file-selection --directory --title="Select a folder to scan for repositories"',
          { encoding: 'utf-8', timeout: 120000 }
        ).trim();
        if (result) {
          logger.info('Folder picked', { path: result });
          res.json({ path: result, cancelled: false });
        } else {
          res.json({ path: null, cancelled: true });
        }
      } catch {
        // User cancelled
        res.json({ path: null, cancelled: true });
      }
    }
  } catch (error) {
    logger.errorWithStack('Failed to open folder picker', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to open folder picker dialog',
    });
  }
});

/**
 * GET /repos/local/scan - Scan local filesystem for git repositories
 */
router.get('/local/scan', async (req: Request, res: Response) => {
  try {
    const scanPath = req.query['path'] as string | undefined;
    const localScanService = getLocalScanService();
    const result = await localScanService.scanForRepos(scanPath || undefined);

    logger.info('Local repos scanned', { count: result.total, scanPath: result.scan_path });

    res.json(result);
  } catch (error) {
    logger.errorWithStack('Failed to scan local repos', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to scan local repositories',
    });
  }
});

/**
 * POST /repos/local/add - Add a local repository
 */
router.post('/local/add', async (req: Request, res: Response) => {
  try {
    const { name, path, default_branch, remote_url } = req.body as {
      name?: string;
      path?: string;
      default_branch?: string;
      remote_url?: string | null;
    };

    if (!name || !path) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'name and path are required',
      });
      return;
    }

    // Always use file:// for local repos - clone from local filesystem.
    // Push/PR operations read the actual remote from the worktree's git config.
    const url = `file://${path}`;

    const repoService = getRepoService();

    // Check if repository already exists
    const existing = await repoService.getRepositoryByUrl(url);
    if (existing) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Repository already exists',
        code: 'REPO_EXISTS',
      });
      return;
    }

    // Detect stack from local filesystem
    const localDetector = createLocalStackDetector();
    const stackResult = await localDetector.detectStack(path);

    const repository = await repoService.createRepositoryWithStack(
      {
        name,
        url,
        default_branch: default_branch || 'main',
      },
      stackResult.detected_stack
    );

    logger.info('Local repository added', { id: repository.id, name, path });

    res.status(201).json(repository);
  } catch (error) {
    logger.errorWithStack('Failed to add local repository', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add local repository',
    });
  }
});

/**
 * POST /repos - Create a new repository
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const input = CreateRepositorySchema.parse(req.body);
    const githubToken = getGitHubToken(req);

    const repoService = getRepoService();

    // Check if repository already exists
    const existing = await repoService.getRepositoryByUrl(input.url);
    if (existing) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Repository already exists',
        code: 'REPO_EXISTS',
      });
      return;
    }

    const repository = await repoService.createRepository(
      input,
      githubToken ?? undefined
    );

    logger.info('Repository created', { id: repository.id, name: repository.name });

    res.status(201).json(repository);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request body',
        details: error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    logger.errorWithStack('Failed to create repository', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create repository',
    });
  }
});

/**
 * GET /repos/:id - Get a repository by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Bad Request', message: 'Repository ID is required' });
      return;
    }

    const repoService = getRepoService();
    const repository = await repoService.getRepositoryById(id);

    if (!repository) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Repository not found',
      });
      return;
    }

    res.json(repository);
  } catch (error) {
    logger.errorWithStack('Failed to get repository', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get repository',
    });
  }
});

/**
 * PATCH /repos/:id - Update a repository
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Bad Request', message: 'Repository ID is required' });
      return;
    }

    const input = UpdateRepositorySchema.parse(req.body);

    const repoService = getRepoService();
    const repository = await repoService.updateRepository(id, input);

    if (!repository) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Repository not found',
      });
      return;
    }

    logger.info('Repository updated', { id });

    res.json(repository);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request body',
        details: error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    logger.errorWithStack('Failed to update repository', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update repository',
    });
  }
});

/**
 * DELETE /repos/:id - Delete a repository
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Bad Request', message: 'Repository ID is required' });
      return;
    }

    const repoService = getRepoService();
    const success = await repoService.deleteRepository(id);

    if (!success) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Repository not found',
      });
      return;
    }

    logger.info('Repository deleted', { id });

    res.status(204).send();
  } catch (error) {
    logger.errorWithStack('Failed to delete repository', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete repository',
    });
  }
});

/**
 * POST /repos/:id/detect-stack - Re-detect the stack for a repository
 */
router.post('/:id/detect-stack', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Bad Request', message: 'Repository ID is required' });
      return;
    }

    const githubToken = getGitHubToken(req);

    if (!githubToken) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'GitHub token required for stack detection',
      });
      return;
    }

    const repoService = getRepoService();
    const repository = await repoService.detectStack(id, githubToken);

    if (!repository) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Repository not found',
      });
      return;
    }

    logger.info('Stack re-detected', { id, stack: repository.detected_stack });

    res.json(repository);
  } catch (error) {
    logger.errorWithStack('Failed to detect stack', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to detect stack',
    });
  }
});

/**
 * POST /repos/:id/patterns - Add a learned pattern
 */
router.post('/:id/patterns', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Bad Request', message: 'Repository ID is required' });
      return;
    }

    const { pattern, taskId } = req.body as { pattern?: string; taskId?: string };

    if (!pattern || !taskId) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'pattern and taskId are required',
      });
      return;
    }

    const repoService = getRepoService();
    const repository = await repoService.addLearnedPattern(id, pattern, taskId);

    if (!repository) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Repository not found',
      });
      return;
    }

    logger.info('Learned pattern added', { repoId: id, pattern });

    res.json(repository);
  } catch (error) {
    logger.errorWithStack('Failed to add learned pattern', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add learned pattern',
    });
  }
});

/**
 * DELETE /repos/:id/patterns - Clear all learned patterns
 */
router.delete('/:id/patterns', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Bad Request', message: 'Repository ID is required' });
      return;
    }

    const repoService = getRepoService();
    const result = await repoService.clearLearnedPatterns(id);

    if (!result.success) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Repository not found',
      });
      return;
    }

    logger.info('Learned patterns cleared', { repoId: id, count: result.cleared_count });

    res.json(result);
  } catch (error) {
    logger.errorWithStack('Failed to clear learned patterns', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to clear learned patterns',
    });
  }
});

/**
 * DELETE /repos/:id/patterns/:patternId - Delete a specific learned pattern
 */
router.delete('/:id/patterns/:patternId', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    const patternId = req.params['patternId'];

    if (!id) {
      res.status(400).json({ error: 'Bad Request', message: 'Repository ID is required' });
      return;
    }

    if (!patternId) {
      res.status(400).json({ error: 'Bad Request', message: 'Pattern ID is required' });
      return;
    }

    const repoService = getRepoService();
    const result = await repoService.deleteLearnedPattern(id, patternId);

    if (!result.success) {
      if (result.notFound === 'repo') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Repository not found',
        });
      } else if (result.notFound === 'pattern') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Pattern not found',
        });
      }
      return;
    }

    logger.info('Learned pattern deleted', { repoId: id, patternId });

    res.json({ success: true });
  } catch (error) {
    logger.errorWithStack('Failed to delete learned pattern', error as Error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete learned pattern',
    });
  }
});

export default router;
