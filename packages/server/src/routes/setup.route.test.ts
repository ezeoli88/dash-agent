import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const settingsService = {
    getDefaultAgent: vi.fn(),
    setSetting: vi.fn(),
    deleteSetting: vi.fn(),
  };

  return {
    detectInstalledAgents: vi.fn(),
    validateAPIKey: vi.fn(),
    validateOpenRouterKey: vi.fn(),
    getOpenRouterModels: vi.fn(),
    generateAuthUrl: vi.fn(),
    handleCallback: vi.fn(),
    isOAuthConfigured: vi.fn(),
    getAICredentials: vi.fn(),
    settingsService,
  };
});

vi.mock('../services/agent-detection.service.js', () => ({
  detectInstalledAgents: mocks.detectInstalledAgents,
}));

vi.mock('../services/ai-provider.service.js', () => ({
  validateAPIKey: mocks.validateAPIKey,
  validateOpenRouterKey: mocks.validateOpenRouterKey,
  getOpenRouterModels: mocks.getOpenRouterModels,
}));

vi.mock('../services/github-oauth.service.js', () => ({
  generateAuthUrl: mocks.generateAuthUrl,
  handleCallback: mocks.handleCallback,
  isOAuthConfigured: mocks.isOAuthConfigured,
}));

vi.mock('../services/settings.service.js', () => ({
  settingsService: mocks.settingsService,
}));

vi.mock('../services/secrets.service.js', () => ({
  getAICredentials: mocks.getAICredentials,
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

const { default: setupRouter } = await import('./setup.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/setup', setupRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });
  return app;
}

describe('setup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.detectInstalledAgents.mockResolvedValue([{ type: 'codex', installed: true }]);
    mocks.validateAPIKey.mockResolvedValue({ valid: true, provider: 'openai' });
    mocks.validateOpenRouterKey.mockResolvedValue({ valid: true, models: [] });
    mocks.getOpenRouterModels.mockResolvedValue([]);
    mocks.generateAuthUrl.mockReturnValue({
      authUrl: 'https://github.com/login/oauth/authorize?state=state-1',
      state: 'state-1',
    });
    mocks.handleCallback.mockResolvedValue({ success: true, username: 'octocat', token: 'gho_test' });
    mocks.isOAuthConfigured.mockReturnValue(false);
    mocks.getAICredentials.mockReturnValue(null);
    mocks.settingsService.getDefaultAgent.mockReturnValue({ agentType: null, agentModel: null });
  });

  it('returns detected agents', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/setup/agents');

    expect(response.status).toBe(200);
    expect(response.body.agents).toEqual([{ type: 'codex', installed: true }]);
  });

  it('rejects invalid settings agent type', async () => {
    const app = buildApp();

    const response = await request(app).patch('/api/setup/settings').send({
      default_agent_type: 'bad-agent',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid agent type');
    expect(mocks.settingsService.setSetting).not.toHaveBeenCalled();
  });

  it('updates settings for valid agent type and model', async () => {
    const app = buildApp();
    mocks.settingsService.getDefaultAgent.mockReturnValue({ agentType: 'codex', agentModel: 'gpt-4o-mini' });

    const response = await request(app).patch('/api/setup/settings').send({
      default_agent_type: 'codex',
      default_agent_model: 'gpt-4o-mini',
    });

    expect(response.status).toBe(200);
    expect(mocks.settingsService.setSetting).toHaveBeenCalledWith('default_agent_type', 'codex');
    expect(mocks.settingsService.setSetting).toHaveBeenCalledWith('default_agent_model', 'gpt-4o-mini');
    expect(response.body.settings.default_agent_type).toBe('codex');
  });

  it('deletes settings keys when null is provided', async () => {
    const app = buildApp();

    const response = await request(app).patch('/api/setup/settings').send({
      default_agent_type: null,
      default_agent_model: null,
    });

    expect(response.status).toBe(200);
    expect(mocks.settingsService.deleteSetting).toHaveBeenCalledWith('default_agent_type');
    expect(mocks.settingsService.deleteSetting).toHaveBeenCalledWith('default_agent_model');
  });

  it('validates AI key payload before calling provider', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/setup/validate-ai-key').send({
      provider: 'openai',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(mocks.validateAPIKey).not.toHaveBeenCalled();
  });

  it('returns AI key validation response', async () => {
    const app = buildApp();
    mocks.validateAPIKey.mockResolvedValue({
      valid: false,
      provider: 'openai',
      error: 'Invalid API key',
    });

    const response = await request(app).post('/api/setup/validate-ai-key').send({
      provider: 'openai',
      apiKey: 'bad-key',
    });

    expect(response.status).toBe(200);
    expect(mocks.validateAPIKey).toHaveBeenCalledWith('openai', 'bad-key');
    expect(response.body.valid).toBe(false);
  });

  it('returns 400 for missing OpenRouter credentials', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/setup/openrouter-models');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('OpenRouter credentials not configured');
  });

  it('returns all and free OpenRouter models when configured', async () => {
    const app = buildApp();
    mocks.getAICredentials.mockReturnValue({ provider: 'openrouter', apiKey: 'or-key' });
    mocks.getOpenRouterModels.mockResolvedValue([
      { id: 'free-model', pricing: { prompt: '0', completion: '0' } },
      { id: 'paid-model', pricing: { prompt: '0.0001', completion: '0' } },
    ]);

    const response = await request(app).get('/api/setup/openrouter-models');

    expect(response.status).toBe(200);
    expect(response.body.models).toHaveLength(2);
    expect(response.body.freeModels).toEqual([{ id: 'free-model', pricing: { prompt: '0', completion: '0' } }]);
    expect(mocks.getOpenRouterModels).toHaveBeenCalledWith('or-key', false);
  });

  it('returns simulated OAuth URL when GitHub OAuth is not configured', async () => {
    const app = buildApp();
    mocks.isOAuthConfigured.mockReturnValue(false);

    const response = await request(app).get('/api/setup/github/auth');

    expect(response.status).toBe(200);
    expect(response.body.configured).toBe(false);
    expect(response.body.authUrl).toContain('/setup/github/callback');
  });

  it('returns real OAuth URL when GitHub OAuth is configured', async () => {
    const app = buildApp();
    mocks.isOAuthConfigured.mockReturnValue(true);

    const response = await request(app).get('/api/setup/github/auth');

    expect(response.status).toBe(200);
    expect(response.body.configured).toBe(true);
    expect(response.body.state).toBe('state-1');
    expect(mocks.generateAuthUrl).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when callback body is invalid', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/setup/github/callback').send({
      code: '',
      state: 'abc',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(mocks.handleCallback).not.toHaveBeenCalled();
  });

  it('returns 400 when OAuth callback fails', async () => {
    const app = buildApp();
    mocks.handleCallback.mockResolvedValue({ success: false, error: 'Invalid state' });

    const response = await request(app).post('/api/setup/github/callback').send({
      code: 'code-1',
      state: 'state-1',
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('returns setup status with OAuth configured flag', async () => {
    const app = buildApp();
    mocks.isOAuthConfigured.mockReturnValue(true);

    const response = await request(app).get('/api/setup/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      serverConfigured: true,
      githubOAuthConfigured: true,
    });
  });

  it('returns confirmation messages for disconnect endpoints', async () => {
    const app = buildApp();

    const aiResponse = await request(app).delete('/api/setup/ai-provider');
    const githubResponse = await request(app).delete('/api/setup/github');

    expect(aiResponse.status).toBe(200);
    expect(aiResponse.body.success).toBe(true);
    expect(githubResponse.status).toBe(200);
    expect(githubResponse.body.success).toBe(true);
  });
});
