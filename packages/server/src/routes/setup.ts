import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '../utils/logger.js';
import { validateAPIKey, validateOpenRouterKey } from '../services/ai-provider.service.js';
import {
  generateAuthUrl,
  handleCallback,
  isOAuthConfigured,
} from '../services/github-oauth.service.js';
import {
  ValidateAIKeyRequestSchema,
  GitHubCallbackRequestSchema,
  ValidateOpenRouterKeyRequestSchema,
} from '@dash-agent/shared';

const logger = createLogger('routes:setup');
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
// AI Provider Endpoints
// =============================================================================

/**
 * POST /setup/validate-ai-key - Validate an AI provider API key
 *
 * Request body:
 * - provider: 'claude' | 'openai'
 * - apiKey: string
 *
 * Response:
 * - valid: boolean
 * - provider: string
 * - modelInfo?: { name: string, description: string }
 * - error?: string
 */
router.post('/validate-ai-key', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /setup/validate-ai-key');

    // Validate request body
    const result = ValidateAIKeyRequestSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }

    const { provider, apiKey } = result.data;

    // Validate the API key
    const validationResult = await validateAPIKey(provider, apiKey);

    // Return 200 even if key is invalid (it's a validation endpoint)
    res.json(validationResult);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /setup/validate-openrouter-key - Validate an OpenRouter API key and get available models
 *
 * Request body:
 * - apiKey: string
 *
 * Response:
 * - valid: boolean
 * - models?: OpenRouterModel[] (all models)
 * - freeModels?: OpenRouterModel[] (only free models)
 * - error?: string
 */
router.post('/validate-openrouter-key', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /setup/validate-openrouter-key');

    // Validate request body
    const result = ValidateOpenRouterKeyRequestSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }

    const { apiKey } = result.data;

    // Validate the OpenRouter API key and get models
    const validationResult = await validateOpenRouterKey(apiKey);

    // Return 200 even if key is invalid (it's a validation endpoint)
    res.json(validationResult);
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GitHub OAuth Endpoints
// =============================================================================

/**
 * GET /setup/github/auth - Get GitHub OAuth authorization URL
 *
 * Response:
 * - authUrl: string (redirect URL for GitHub OAuth)
 * - state: string (state token for validation)
 */
router.get('/github/auth', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('GET /setup/github/auth');

    // Check if OAuth is configured
    if (!isOAuthConfigured()) {
      logger.warn('GitHub OAuth not configured, returning simulated URL');
      // Return a simulated URL for development
      res.json({
        authUrl: 'http://localhost:3003/setup/github/callback?code=demo&state=demo-state',
        state: 'demo-state',
        configured: false,
      });
      return;
    }

    const result = generateAuthUrl();
    res.json({ ...result, configured: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /setup/github/callback - Handle GitHub OAuth callback
 *
 * Request body:
 * - code: string (authorization code from GitHub)
 * - state: string (state token for validation)
 *
 * Response:
 * - success: boolean
 * - username?: string
 * - avatarUrl?: string
 * - token?: string (access token for API calls)
 * - error?: string
 */
router.post('/github/callback', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /setup/github/callback');

    // Validate request body
    const result = GitHubCallbackRequestSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }

    const { code, state } = result.data;

    // Handle the callback
    const callbackResult = await handleCallback(code, state);

    if (!callbackResult.success) {
      res.status(400).json(callbackResult);
      return;
    }

    res.json(callbackResult);
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Setup Status Endpoints
// =============================================================================

/**
 * GET /setup/status - Get current setup status
 *
 * Note: Since setup config is stored in localStorage (frontend),
 * this endpoint is mainly for checking if the server has valid credentials
 * configured from environment variables.
 *
 * Response:
 * - serverConfigured: boolean
 * - githubOAuthConfigured: boolean
 */
router.get('/status', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('GET /setup/status');

    res.json({
      serverConfigured: true,
      githubOAuthConfigured: isOAuthConfigured(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /setup/ai-provider - Disconnect AI provider
 *
 * Note: This is mainly a confirmation endpoint since the actual
 * config is stored in localStorage. The backend doesn't persist
 * setup configuration.
 *
 * Response:
 * - success: boolean
 * - message: string
 */
router.delete('/ai-provider', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('DELETE /setup/ai-provider');

    res.json({
      success: true,
      message: 'AI provider disconnected. Please clear your local storage.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /setup/github - Disconnect GitHub
 *
 * Note: This is mainly a confirmation endpoint since the actual
 * config is stored in localStorage. The backend doesn't persist
 * setup configuration.
 *
 * Response:
 * - success: boolean
 * - message: string
 */
router.delete('/github', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('DELETE /setup/github');

    res.json({
      success: true,
      message: 'GitHub disconnected. Please clear your local storage.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
