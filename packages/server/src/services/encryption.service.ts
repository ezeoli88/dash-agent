import crypto from 'crypto';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('services:encryption');

/**
 * Encryption key for AES-256-GCM.
 * Must be 32 bytes (256 bits) when converted from hex.
 * In production, this MUST be set via environment variable.
 * For development, a random key is generated if not set.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env['ENCRYPTION_KEY'];

  if (envKey) {
    const keyBuffer = Buffer.from(envKey, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    return keyBuffer;
  }

  // Development fallback: generate a random key
  // WARNING: This means encrypted data won't survive server restarts!
  logger.warn('ENCRYPTION_KEY not set, generating random key. Data will not persist across restarts!');
  return crypto.randomBytes(32);
}

// Cache the encryption key
let encryptionKey: Buffer | null = null;

function getKey(): Buffer {
  if (!encryptionKey) {
    encryptionKey = getEncryptionKey();
  }
  return encryptionKey;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param text - The plaintext to encrypt
 * @returns Encrypted string in format "iv:authTag:ciphertext" (all hex encoded)
 */
export function encrypt(text: string): string {
  const key = getKey();

  // Generate a random 16-byte IV (Initialization Vector)
  const iv = crypto.randomBytes(16);

  // Create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // Encrypt the text
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get the authentication tag (16 bytes)
  const authTag = cipher.getAuthTag().toString('hex');

  // Return in format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string that was encrypted with the encrypt() function.
 *
 * @param encryptedData - Encrypted string in format "iv:authTag:ciphertext"
 * @returns The decrypted plaintext string
 * @throws Error if decryption fails (invalid data, tampered, wrong key)
 */
export function decrypt(encryptedData: string): string {
  const key = getKey();

  // Parse the encrypted data
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error('Invalid encrypted data format: missing components');
  }

  // Convert from hex
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // Validate IV length (16 bytes)
  if (iv.length !== 16) {
    throw new Error('Invalid IV length');
  }

  // Validate auth tag length (16 bytes)
  if (authTag.length !== 16) {
    throw new Error('Invalid auth tag length');
  }

  // Create decipher
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a new random encryption key.
 * Useful for initial setup or key rotation.
 *
 * @returns A 64-character hex string (32 bytes)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validates that a string is a valid encryption key format.
 *
 * @param key - The key to validate
 * @returns true if valid, false otherwise
 */
export function isValidEncryptionKey(key: string): boolean {
  // Must be 64 hex characters (32 bytes)
  return /^[0-9a-fA-F]{64}$/.test(key);
}
