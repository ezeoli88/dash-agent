import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '../utils/logger.js';
import {
  saveSecret,
  deleteSecret,
  getAIStatus,
  getGitHubStatus,
  getGitLabStatus,
  getAllSecretsStatus,
} from '../services/secrets.service.js';
import { validateAPIKey, validateOpenRouterKey, getModelInfo } from '../services/ai-provider.service.js';
import { resetGitHubClient } from '../github/client.js';
import { clearAgentCache } from '../services/agent-detection.service.js';
import {
  SaveAISecretRequestSchema,
  SaveGitHubSecretRequestSchema,
  ValidateGitHubPATRequestSchema,
  SaveGitLabSecretRequestSchema,
  ValidateGitLabPATRequestSchema,
} from '@dash-agent/shared';

const logger = createLogger('routes:secrets');
const router = Router();

/**
 * Formats Zod errors into a consistent response format.
 */
function formatZodError(error: ZodError) {
  return {
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

// =============================================================================
// AI Secret Endpoints
// =============================================================================

/**
 * POST /secrets/ai - Save an AI API key
 *
 * Validates the key first, then encrypts and stores it.
 *
 * Request body:
 * - provider: 'claude' | 'openai' | 'openrouter'
 * - apiKey: string
 * - model?: string (for OpenRouter)
 *
 * Response:
 * - success: boolean
 * - provider: string
 * - modelInfo?: { name: string, description: string }
 * - error?: string
 */
router.post('/ai', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /secrets/ai');

    // Validate request body
    const parseResult = SaveAISecretRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(formatZodError(parseResult.error));
      return;
    }

    const { provider, apiKey, model } = parseResult.data;

    // Validate the API key first
    let validationResult;
    if (provider === 'openrouter') {
      const openRouterResult = await validateOpenRouterKey(apiKey);
      if (!openRouterResult.valid) {
        res.status(400).json({
          success: false,
          provider,
          error: openRouterResult.error ?? 'Invalid OpenRouter API key',
        });
        return;
      }
      validationResult = {
        valid: true,
        provider,
        modelInfo: model
          ? { name: model, description: 'OpenRouter model' }
          : { name: 'OpenRouter', description: 'Access to multiple AI models' },
      };
    } else {
      validationResult = await validateAPIKey(provider, apiKey);
      if (!validationResult.valid) {
        res.status(400).json({
          success: false,
          provider,
          error: validationResult.error ?? 'Invalid API key',
        });
        return;
      }
    }

    // Get model info for storage
    const modelInfo = validationResult.modelInfo ?? getModelInfo(provider);

    // Save the secret
    const metadata: Record<string, unknown> = {
      modelName: modelInfo.name,
      modelDescription: modelInfo.description,
    };

    if (model) {
      metadata['model'] = model;
    }

    saveSecret('ai_api_key', provider, apiKey, metadata);

    // Clear agent detection cache so next request picks up new auth/models
    if (provider === 'openrouter') {
      clearAgentCache();
    }

    logger.info('AI secret saved successfully', { provider });

    res.json({
      success: true,
      provider,
      modelInfo,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /secrets/ai - Delete the stored AI API key
 *
 * Response:
 * - success: boolean
 * - message?: string
 */
router.delete('/ai', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('DELETE /secrets/ai');

    const deleted = deleteSecret('ai_api_key');

    // Clear agent detection cache so stale auth/models are removed
    clearAgentCache();

    res.json({
      success: deleted,
      message: deleted ? 'AI API key deleted' : 'No AI API key was stored',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /secrets/ai/status - Get AI connection status
 *
 * Returns connection status without exposing the API key.
 *
 * Response:
 * - connected: boolean
 * - provider: string | null
 * - model: string | null
 * - modelInfo: { name: string, description: string } | null
 */
router.get('/ai/status', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('GET /secrets/ai/status');

    const status = getAIStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GitHub Secret Endpoints
// =============================================================================

/**
 * POST /secrets/github - Save a GitHub token
 *
 * Validates the token first (optional if pre-validated), then encrypts and stores it.
 *
 * Request body:
 * - token: string
 * - connectionMethod: 'oauth' | 'pat'
 * - username?: string (pre-validated from PAT flow)
 * - avatarUrl?: string (pre-validated from PAT flow)
 *
 * Response:
 * - success: boolean
 * - username?: string
 * - avatarUrl?: string
 * - error?: string
 */
router.post('/github', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /secrets/github');

    // Validate request body
    const parseResult = SaveGitHubSecretRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(formatZodError(parseResult.error));
      return;
    }

    const { token, connectionMethod, username, avatarUrl } = parseResult.data;

    // If username not provided, validate the token and fetch user info
    let finalUsername = username;
    let finalAvatarUrl = avatarUrl;

    if (!finalUsername) {
      const userInfo = await fetchGitHubUserInfo(token);
      if (!userInfo) {
        res.status(400).json({
          success: false,
          error: 'Invalid GitHub token or failed to fetch user info',
        });
        return;
      }
      finalUsername = userInfo.login;
      finalAvatarUrl = userInfo.avatar_url;
    }

    // Save the secret
    const metadata: Record<string, unknown> = {
      username: finalUsername,
      connectionMethod,
    };

    if (finalAvatarUrl) {
      metadata['avatarUrl'] = finalAvatarUrl;
    }

    saveSecret('github_token', 'github', token, metadata);

    // Reset the GitHub client singleton so it uses the new token
    resetGitHubClient();

    logger.info('GitHub secret saved successfully', { username: finalUsername, connectionMethod });

    res.json({
      success: true,
      username: finalUsername,
      avatarUrl: finalAvatarUrl,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /secrets/github - Delete the stored GitHub token
 *
 * Response:
 * - success: boolean
 * - message?: string
 */
router.delete('/github', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('DELETE /secrets/github');

    const deleted = deleteSecret('github_token', 'github');

    // Reset the GitHub client singleton
    resetGitHubClient();

    res.json({
      success: deleted,
      message: deleted ? 'GitHub token deleted' : 'No GitHub token was stored',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /secrets/github/status - Get GitHub connection status
 *
 * Returns connection status without exposing the token.
 *
 * Response:
 * - connected: boolean
 * - username: string | null
 * - avatarUrl: string | null
 * - connectionMethod: 'oauth' | 'pat' | null
 */
router.get('/github/status', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('GET /secrets/github/status');

    const status = getGitHubStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /secrets/github/validate-pat - Validate a GitHub Personal Access Token
 *
 * Validates the token and returns user info without storing it.
 * Use this to preview the user before saving.
 *
 * Request body:
 * - token: string
 *
 * Response:
 * - valid: boolean
 * - username?: string
 * - avatarUrl?: string
 * - scopes?: string[]
 * - error?: string
 */
router.post('/github/validate-pat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /secrets/github/validate-pat');

    // Validate request body
    const parseResult = ValidateGitHubPATRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(formatZodError(parseResult.error));
      return;
    }

    const { token } = parseResult.data;

    // Fetch user info to validate the token
    const userInfo = await fetchGitHubUserInfo(token);

    if (!userInfo) {
      res.json({
        valid: false,
        error: 'Invalid token or unable to authenticate with GitHub',
      });
      return;
    }

    res.json({
      valid: true,
      username: userInfo.login,
      avatarUrl: userInfo.avatar_url,
      // Note: Scopes are in response headers, would need custom fetch to get them
      scopes: [],
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GitLab Secret Endpoints
// =============================================================================

/**
 * POST /secrets/gitlab - Save a GitLab token
 */
router.post('/gitlab', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /secrets/gitlab');

    const parseResult = SaveGitLabSecretRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(formatZodError(parseResult.error));
      return;
    }

    const { token, username, avatarUrl } = parseResult.data;

    // If username not provided, validate the token and fetch user info
    let finalUsername = username;
    let finalAvatarUrl = avatarUrl;

    if (!finalUsername) {
      const userInfo = await fetchGitLabUserInfo(token);
      if (!userInfo) {
        res.status(400).json({
          success: false,
          error: 'Invalid GitLab token or failed to fetch user info',
        });
        return;
      }
      finalUsername = userInfo.username;
      finalAvatarUrl = userInfo.avatar_url;
    }

    const metadata: Record<string, unknown> = {
      username: finalUsername,
    };

    if (finalAvatarUrl) {
      metadata['avatarUrl'] = finalAvatarUrl;
    }

    saveSecret('gitlab_token', 'gitlab', token, metadata);

    logger.info('GitLab secret saved successfully', { username: finalUsername });

    res.json({
      success: true,
      username: finalUsername,
      avatarUrl: finalAvatarUrl,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /secrets/gitlab - Delete the stored GitLab token
 */
router.delete('/gitlab', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('DELETE /secrets/gitlab');

    const deleted = deleteSecret('gitlab_token', 'gitlab');

    res.json({
      success: deleted,
      message: deleted ? 'GitLab token deleted' : 'No GitLab token was stored',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /secrets/gitlab/status - Get GitLab connection status
 */
router.get('/gitlab/status', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('GET /secrets/gitlab/status');

    const status = getGitLabStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /secrets/gitlab/validate-pat - Validate a GitLab Personal Access Token
 */
router.post('/gitlab/validate-pat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /secrets/gitlab/validate-pat');

    const parseResult = ValidateGitLabPATRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(formatZodError(parseResult.error));
      return;
    }

    const { token } = parseResult.data;

    const userInfo = await fetchGitLabUserInfo(token);

    if (!userInfo) {
      res.json({
        valid: false,
        error: 'Invalid token or unable to authenticate with GitLab',
      });
      return;
    }

    res.json({
      valid: true,
      username: userInfo.username,
      avatarUrl: userInfo.avatar_url,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Combined Status Endpoint
// =============================================================================

/**
 * GET /secrets/status - Get status of all connections
 *
 * Response:
 * - ai: { connected, provider, model, modelInfo }
 * - github: { connected, username, avatarUrl, connectionMethod }
 * - isComplete: boolean
 */
router.get('/status', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('GET /secrets/status');

    const status = getAllSecretsStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Fetches GitHub user info using a token
 */
async function fetchGitHubUserInfo(token: string): Promise<{ login: string; avatar_url: string } | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'dash-agent',
      },
    });

    if (!response.ok) {
      logger.warn('GitHub user info fetch failed', { status: response.status });
      return null;
    }

    const data = await response.json() as { login: string; avatar_url: string };
    return { login: data.login, avatar_url: data.avatar_url };
  } catch (error) {
    logger.error('GitHub user info fetch error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Fetches GitLab user info using a token
 */
async function fetchGitLabUserInfo(token: string): Promise<{ username: string; avatar_url: string } | null> {
  try {
    const response = await fetch('https://gitlab.com/api/v4/user', {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    });

    if (!response.ok) {
      logger.warn('GitLab user info fetch failed', { status: response.status });
      return null;
    }

    const data = await response.json() as { username: string; avatar_url: string };
    return { username: data.username, avatar_url: data.avatar_url };
  } catch (error) {
    logger.error('GitLab user info fetch error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export default router;
