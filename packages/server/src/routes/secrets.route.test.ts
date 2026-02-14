import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveSecret: vi.fn(),
  deleteSecret: vi.fn(),
  getAIStatus: vi.fn(),
  getGitHubStatus: vi.fn(),
  getGitLabStatus: vi.fn(),
  getAllSecretsStatus: vi.fn(),
  validateAPIKey: vi.fn(),
  validateOpenRouterKey: vi.fn(),
  getModelInfo: vi.fn(),
  resetGitHubClient: vi.fn(),
  clearAgentCache: vi.fn(),
}));

vi.mock('../services/secrets.service.js', () => ({
  saveSecret: mocks.saveSecret,
  deleteSecret: mocks.deleteSecret,
  getAIStatus: mocks.getAIStatus,
  getGitHubStatus: mocks.getGitHubStatus,
  getGitLabStatus: mocks.getGitLabStatus,
  getAllSecretsStatus: mocks.getAllSecretsStatus,
}));

vi.mock('../services/ai-provider.service.js', () => ({
  validateAPIKey: mocks.validateAPIKey,
  validateOpenRouterKey: mocks.validateOpenRouterKey,
  getModelInfo: mocks.getModelInfo,
}));

vi.mock('../github/client.js', () => ({
  resetGitHubClient: mocks.resetGitHubClient,
}));

vi.mock('../services/agent-detection.service.js', () => ({
  clearAgentCache: mocks.clearAgentCache,
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    errorWithStack: vi.fn(),
  }),
}));

const { default: secretsRouter } = await import('./secrets.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/secrets', secretsRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });
  return app;
}

describe('secrets routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    mocks.validateAPIKey.mockResolvedValue({
      valid: true,
      provider: 'openai',
      modelInfo: { name: 'gpt-4.1', description: 'OpenAI model' },
    });
    mocks.validateOpenRouterKey.mockResolvedValue({ valid: true });
    mocks.getModelInfo.mockReturnValue({ name: 'default', description: 'default model' });
    mocks.deleteSecret.mockReturnValue(true);
    mocks.getAllSecretsStatus.mockReturnValue({
      ai: { connected: true, provider: 'openai', model: null, modelInfo: null },
      github: { connected: false, username: null, avatarUrl: null, connectionMethod: null },
      gitlab: { connected: false, username: null, avatarUrl: null },
      isComplete: true,
    });
  });

  it('returns 400 when AI secret payload is invalid', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/secrets/ai').send({
      provider: 'openai',
      apiKey: '',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(mocks.saveSecret).not.toHaveBeenCalled();
  });

  it('rejects invalid OpenRouter key and does not persist secret', async () => {
    const app = buildApp();
    mocks.validateOpenRouterKey.mockResolvedValue({
      valid: false,
      error: 'Invalid OpenRouter API key',
    });

    const response = await request(app).post('/api/secrets/ai').send({
      provider: 'openrouter',
      apiKey: 'bad-key',
      model: 'openrouter/model-x',
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(mocks.saveSecret).not.toHaveBeenCalled();
  });

  it('saves valid OpenRouter key and clears agent cache', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/secrets/ai').send({
      provider: 'openrouter',
      apiKey: 'ok-key',
      model: 'openrouter/model-x',
    });

    expect(response.status).toBe(200);
    expect(mocks.saveSecret).toHaveBeenCalledWith(
      'ai_api_key',
      'openrouter',
      'ok-key',
      expect.objectContaining({
        model: 'openrouter/model-x',
      })
    );
    expect(mocks.clearAgentCache).toHaveBeenCalledTimes(1);
  });

  it('deletes AI secret and returns informative message', async () => {
    const app = buildApp();
    mocks.deleteSecret.mockReturnValue(false);

    const response = await request(app).delete('/api/secrets/ai');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('No AI API key was stored');
    expect(mocks.clearAgentCache).toHaveBeenCalledTimes(1);
  });

  it('saves GitHub token with pre-validated user info', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/secrets/github').send({
      token: 'ghp_token',
      connectionMethod: 'pat',
      username: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
    });

    expect(response.status).toBe(200);
    expect(mocks.saveSecret).toHaveBeenCalledWith(
      'github_token',
      'github',
      'ghp_token',
      expect.objectContaining({
        username: 'octocat',
        connectionMethod: 'pat',
      })
    );
    expect(mocks.resetGitHubClient).toHaveBeenCalledTimes(1);
  });

  it('returns valid=false on GitHub PAT validation when upstream auth fails', async () => {
    const app = buildApp();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app).post('/api/secrets/github/validate-pat').send({
      token: 'bad-token',
    });

    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(false);
    expect(response.body.error).toContain('Invalid token');
  });

  it('returns combined secret status without exposing token values', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/secrets/status');

    expect(response.status).toBe(200);
    expect(response.body.isComplete).toBe(true);
    expect(response.body.ai.connected).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('ghp_');
    expect(JSON.stringify(response.body)).not.toContain('apiKey');
  });

  it('deletes GitHub token and resets cached GitHub client', async () => {
    const app = buildApp();
    mocks.deleteSecret.mockReturnValue(true);

    const response = await request(app).delete('/api/secrets/github');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mocks.deleteSecret).toHaveBeenCalledWith('github_token', 'github');
    expect(mocks.resetGitHubClient).toHaveBeenCalledTimes(1);
  });
});
