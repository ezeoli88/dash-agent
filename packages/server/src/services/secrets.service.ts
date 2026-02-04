import { randomUUID } from 'crypto';
import { getDatabase, saveDatabase } from '../db/database.js';
import { encrypt, decrypt } from './encryption.service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('services:secrets');

// ============================================================================
// Types
// ============================================================================

/**
 * Key types for stored secrets
 */
export type SecretKeyType = 'ai_api_key' | 'github_token';

/**
 * Provider types for AI keys
 */
export type AIProviderType = 'claude' | 'openai' | 'openrouter';

/**
 * Provider types for GitHub
 */
export type GitHubProviderType = 'github';

/**
 * All provider types
 */
export type ProviderType = AIProviderType | GitHubProviderType;

/**
 * Metadata stored with AI secrets
 */
export interface AISecretMetadata {
  model?: string; // For OpenRouter model selection
  modelName?: string;
  modelDescription?: string;
}

/**
 * Metadata stored with GitHub secrets
 */
export interface GitHubSecretMetadata {
  username: string;
  avatarUrl?: string;
  connectionMethod: 'oauth' | 'pat';
}

/**
 * Generic secret record from database
 */
export interface SecretRecord {
  id: string;
  keyType: SecretKeyType;
  provider: string | null;
  encryptedValue: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a UUID for new secrets
 */
function generateId(): string {
  return randomUUID();
}

/**
 * Parses JSON metadata safely
 */
function parseMetadata(metadataJson: string | null): Record<string, unknown> | null {
  if (!metadataJson) return null;
  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    logger.warn('Failed to parse metadata JSON');
    return null;
  }
}

/**
 * Serializes metadata to JSON
 */
function serializeMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  return JSON.stringify(metadata);
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Saves a secret to the database.
 * If a secret with the same keyType and provider exists, it will be updated.
 *
 * @param keyType - The type of secret ('ai_api_key' or 'github_token')
 * @param provider - The provider (e.g., 'claude', 'openai', 'github')
 * @param value - The plaintext value to encrypt and store
 * @param metadata - Optional metadata to store with the secret
 */
export function saveSecret(
  keyType: SecretKeyType,
  provider: ProviderType | null,
  value: string,
  metadata?: Record<string, unknown>
): void {
  const db = getDatabase();

  logger.info('Saving secret', { keyType, provider });

  // Encrypt the value
  const encryptedValue = encrypt(value);
  const metadataJson = serializeMetadata(metadata);
  const now = new Date().toISOString();

  // Check if secret already exists
  const existing = db.exec(
    'SELECT id FROM user_secrets WHERE key_type = ? AND (provider = ? OR (provider IS NULL AND ? IS NULL))',
    [keyType, provider, provider]
  );

  if (existing.length > 0 && existing[0]?.values.length !== undefined && existing[0].values.length > 0) {
    // Update existing secret
    const existingId = existing[0].values[0]?.[0] as string;
    logger.debug('Updating existing secret', { id: existingId });

    db.run(
      'UPDATE user_secrets SET encrypted_value = ?, metadata = ?, updated_at = ? WHERE id = ?',
      [encryptedValue, metadataJson, now, existingId]
    );
  } else {
    // Insert new secret
    const id = generateId();
    logger.debug('Inserting new secret', { id });

    db.run(
      'INSERT INTO user_secrets (id, key_type, provider, encrypted_value, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, keyType, provider, encryptedValue, metadataJson, now, now]
    );
  }

  saveDatabase();
  logger.info('Secret saved successfully', { keyType, provider });
}

/**
 * Gets a secret from the database and decrypts it.
 *
 * @param keyType - The type of secret to retrieve
 * @param provider - Optional provider filter
 * @returns The secret record with decrypted value, or null if not found
 */
export function getSecret(
  keyType: SecretKeyType,
  provider?: ProviderType | null
): (SecretRecord & { decryptedValue: string }) | null {
  const db = getDatabase();

  logger.debug('Getting secret', { keyType, provider });

  let query: string;
  let params: (string | null)[];

  if (provider !== undefined) {
    query = 'SELECT * FROM user_secrets WHERE key_type = ? AND (provider = ? OR (provider IS NULL AND ? IS NULL))';
    params = [keyType, provider ?? null, provider ?? null];
  } else {
    query = 'SELECT * FROM user_secrets WHERE key_type = ? LIMIT 1';
    params = [keyType];
  }

  const result = db.exec(query, params);

  if (result.length === 0 || !result[0]?.values.length) {
    logger.debug('Secret not found', { keyType, provider });
    return null;
  }

  const columns = result[0].columns;
  const row = result[0].values[0];

  if (!row) {
    return null;
  }

  // Map columns to object
  const record: Record<string, unknown> = {};
  columns.forEach((col, idx) => {
    record[col] = row[idx];
  });

  try {
    const decryptedValue = decrypt(record['encrypted_value'] as string);

    return {
      id: record['id'] as string,
      keyType: record['key_type'] as SecretKeyType,
      provider: record['provider'] as string | null,
      encryptedValue: record['encrypted_value'] as string,
      metadata: parseMetadata(record['metadata'] as string | null),
      createdAt: record['created_at'] as string,
      updatedAt: record['updated_at'] as string,
      decryptedValue,
    };
  } catch (error) {
    logger.error('Failed to decrypt secret', {
      keyType,
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Deletes a secret from the database.
 *
 * @param keyType - The type of secret to delete
 * @param provider - Optional provider filter
 * @returns true if a secret was deleted, false if not found
 */
export function deleteSecret(keyType: SecretKeyType, provider?: ProviderType | null): boolean {
  const db = getDatabase();

  logger.info('Deleting secret', { keyType, provider });

  let query: string;
  let params: (string | null)[];

  if (provider !== undefined) {
    query = 'DELETE FROM user_secrets WHERE key_type = ? AND (provider = ? OR (provider IS NULL AND ? IS NULL))';
    params = [keyType, provider ?? null, provider ?? null];
  } else {
    query = 'DELETE FROM user_secrets WHERE key_type = ?';
    params = [keyType];
  }

  db.run(query, params);
  const changes = db.getRowsModified();
  saveDatabase();

  logger.info('Secret deletion result', { keyType, provider, deleted: changes > 0 });
  return changes > 0;
}

/**
 * Checks if a secret exists in the database.
 *
 * @param keyType - The type of secret to check
 * @param provider - Optional provider filter
 * @returns true if the secret exists, false otherwise
 */
export function hasSecret(keyType: SecretKeyType, provider?: ProviderType | null): boolean {
  const db = getDatabase();

  let query: string;
  let params: (string | null)[];

  if (provider !== undefined) {
    query = 'SELECT 1 FROM user_secrets WHERE key_type = ? AND (provider = ? OR (provider IS NULL AND ? IS NULL)) LIMIT 1';
    params = [keyType, provider ?? null, provider ?? null];
  } else {
    query = 'SELECT 1 FROM user_secrets WHERE key_type = ? LIMIT 1';
    params = [keyType];
  }

  const result = db.exec(query, params);
  return result.length > 0 && result[0]?.values !== undefined && result[0].values.length > 0;
}

/**
 * Gets the metadata for a secret WITHOUT decrypting the value.
 * Safe to expose to frontend.
 *
 * @param keyType - The type of secret
 * @param provider - Optional provider filter
 * @returns The metadata object, or null if secret not found
 */
export function getSecretMetadata(
  keyType: SecretKeyType,
  provider?: ProviderType | null
): { provider: string | null; metadata: Record<string, unknown> | null } | null {
  const db = getDatabase();

  let query: string;
  let params: (string | null)[];

  if (provider !== undefined) {
    query = 'SELECT provider, metadata FROM user_secrets WHERE key_type = ? AND (provider = ? OR (provider IS NULL AND ? IS NULL))';
    params = [keyType, provider ?? null, provider ?? null];
  } else {
    query = 'SELECT provider, metadata FROM user_secrets WHERE key_type = ? LIMIT 1';
    params = [keyType];
  }

  const result = db.exec(query, params);

  if (result.length === 0 || !result[0]?.values.length) {
    return null;
  }

  const row = result[0].values[0];
  if (!row) {
    return null;
  }

  return {
    provider: row[0] as string | null,
    metadata: parseMetadata(row[1] as string | null),
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Gets the stored AI API key credentials.
 * Returns null if not configured.
 */
export function getAICredentials(): { provider: AIProviderType; apiKey: string; model?: string } | null {
  const secret = getSecret('ai_api_key');
  if (!secret) return null;

  const metadata = secret.metadata as AISecretMetadata | null;
  const model = metadata?.model;

  // Build result with optional model only if it exists
  const result: { provider: AIProviderType; apiKey: string; model?: string } = {
    provider: secret.provider as AIProviderType,
    apiKey: secret.decryptedValue,
  };

  if (model) {
    result.model = model;
  }

  return result;
}

/**
 * Gets the stored GitHub token.
 * Returns null if not configured.
 */
export function getGitHubCredentials(): { token: string; metadata: GitHubSecretMetadata } | null {
  const secret = getSecret('github_token', 'github');
  if (!secret || !secret.metadata) return null;

  const metadata = secret.metadata as Record<string, unknown>;

  // Validate required fields exist
  if (typeof metadata['username'] !== 'string' || typeof metadata['connectionMethod'] !== 'string') {
    return null;
  }

  const result: { token: string; metadata: GitHubSecretMetadata } = {
    token: secret.decryptedValue,
    metadata: {
      username: metadata['username'] as string,
      connectionMethod: metadata['connectionMethod'] as 'oauth' | 'pat',
    },
  };

  if (typeof metadata['avatarUrl'] === 'string') {
    result.metadata.avatarUrl = metadata['avatarUrl'];
  }

  return result;
}

/**
 * Gets the AI connection status without exposing the key.
 */
export function getAIStatus(): {
  connected: boolean;
  provider: AIProviderType | null;
  model: string | null;
  modelInfo: { name: string; description: string } | null;
} {
  const metadata = getSecretMetadata('ai_api_key');

  if (!metadata) {
    return {
      connected: false,
      provider: null,
      model: null,
      modelInfo: null,
    };
  }

  const meta = metadata.metadata as AISecretMetadata | null;

  return {
    connected: true,
    provider: metadata.provider as AIProviderType,
    model: meta?.model ?? null,
    modelInfo: meta?.modelName
      ? { name: meta.modelName, description: meta.modelDescription ?? '' }
      : null,
  };
}

/**
 * Gets the GitHub connection status without exposing the token.
 */
export function getGitHubStatus(): {
  connected: boolean;
  username: string | null;
  avatarUrl: string | null;
  connectionMethod: 'oauth' | 'pat' | null;
} {
  const metadata = getSecretMetadata('github_token', 'github');

  if (!metadata) {
    return {
      connected: false,
      username: null,
      avatarUrl: null,
      connectionMethod: null,
    };
  }

  const meta = metadata.metadata as GitHubSecretMetadata | null;

  return {
    connected: true,
    username: meta?.username ?? null,
    avatarUrl: meta?.avatarUrl ?? null,
    connectionMethod: meta?.connectionMethod ?? null,
  };
}

/**
 * Gets the status of all secrets.
 */
export function getAllSecretsStatus(): {
  ai: ReturnType<typeof getAIStatus>;
  github: ReturnType<typeof getGitHubStatus>;
  isComplete: boolean;
} {
  const ai = getAIStatus();
  const github = getGitHubStatus();

  return {
    ai,
    github,
    isComplete: ai.connected && github.connected,
  };
}
