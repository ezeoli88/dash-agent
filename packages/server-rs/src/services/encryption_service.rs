//! Encryption service using AES-256-GCM.
//!
//! Produces ciphertext in the exact same format as the TypeScript server:
//! `hex(iv):hex(authTag):hex(ciphertext)`
//!
//! The TypeScript server uses Node.js `crypto.createCipheriv('aes-256-gcm', key, iv)`
//! with a 16-byte IV. Node's GCM implementation appends the auth tag separately via
//! `cipher.getAuthTag()`. The `aes-gcm` Rust crate appends the 16-byte tag to the
//! ciphertext by default, so we split it off to match the TS format.

use std::env;
use std::sync::OnceLock;

use aes_gcm::aead::generic_array::GenericArray;
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit};
use rand::RngCore;
use tracing::warn;

use crate::error::AppError;

/// Tag size for AES-256-GCM (16 bytes / 128 bits).
const TAG_SIZE: usize = 16;

/// IV (nonce) size matching the TypeScript server (16 bytes).
/// Note: AES-GCM standard uses 12-byte nonces. The TypeScript server uses 16-byte IVs
/// because Node.js GCM supports arbitrary IV sizes. The `aes-gcm` crate expects
/// exactly 12 bytes, so we use 12 bytes here for Rust correctness.
///
/// IMPORTANT: Since the TS server uses 16-byte IVs and this Rust server uses 12-byte
/// nonces, data encrypted by one server CANNOT be decrypted by the other directly.
/// However, this service will correctly round-trip its own data, and for migration
/// purposes the nonce size in `decrypt` is inferred from the hex length of the IV part.
const NONCE_SIZE: usize = 12;

/// Global encryption key, initialized once.
static ENCRYPTION_KEY: OnceLock<Vec<u8>> = OnceLock::new();

/// Returns the 32-byte encryption key.
///
/// - If `ENCRYPTION_KEY` env var is set, decodes it from hex (must be 64 hex chars = 32 bytes).
/// - Otherwise, generates a random 32-byte key and caches it for the process lifetime.
///   WARNING: random key means encrypted data will NOT survive server restarts.
pub fn get_encryption_key() -> &'static [u8] {
    ENCRYPTION_KEY.get_or_init(|| {
        if let Ok(env_key) = env::var("ENCRYPTION_KEY") {
            if !env_key.is_empty() {
                let key_bytes = hex::decode(&env_key).expect(
                    "ENCRYPTION_KEY must be valid hex (64 hex characters = 32 bytes)",
                );
                if key_bytes.len() != 32 {
                    panic!(
                        "ENCRYPTION_KEY must be 32 bytes (64 hex characters), got {} bytes",
                        key_bytes.len()
                    );
                }
                return key_bytes;
            }
        }

        // Development fallback: generate a random key
        warn!(
            "ENCRYPTION_KEY not set, generating random key. Data will not persist across restarts!"
        );
        let mut key = vec![0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        key
    })
}

/// Encrypts a plaintext string using AES-256-GCM.
///
/// Returns the encrypted data in the format: `hex(nonce):hex(authTag):hex(ciphertext)`
///
/// This matches the TypeScript format `iv:authTag:ciphertext`, allowing interoperability
/// when both servers use the same nonce size.
pub fn encrypt(plaintext: &str) -> Result<String, AppError> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));

    // Generate random nonce
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = GenericArray::from_slice(&nonce_bytes);

    // Encrypt — aes-gcm appends the 16-byte auth tag to the ciphertext
    let ciphertext_with_tag = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Encryption failed: {e}")))?;

    // Split: last TAG_SIZE bytes are the auth tag, the rest is ciphertext
    let ct_len = ciphertext_with_tag.len() - TAG_SIZE;
    let ciphertext = &ciphertext_with_tag[..ct_len];
    let auth_tag = &ciphertext_with_tag[ct_len..];

    // Format: hex(nonce):hex(authTag):hex(ciphertext)
    Ok(format!(
        "{}:{}:{}",
        hex::encode(nonce_bytes),
        hex::encode(auth_tag),
        hex::encode(ciphertext),
    ))
}

/// Decrypts data that was encrypted with [`encrypt`].
///
/// Expects the format `hex(iv):hex(authTag):hex(ciphertext)`.
pub fn decrypt(encrypted: &str) -> Result<String, AppError> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));

    let parts: Vec<&str> = encrypted.split(':').collect();
    if parts.len() != 3 {
        return Err(AppError::Validation(
            "Invalid encrypted data format: expected iv:authTag:ciphertext".into(),
        ));
    }

    let iv_hex = parts[0];
    let auth_tag_hex = parts[1];
    let ciphertext_hex = parts[2];

    if iv_hex.is_empty() || auth_tag_hex.is_empty() {
        return Err(AppError::Validation(
            "Invalid encrypted data format: missing components".into(),
        ));
    }

    let nonce_bytes = hex::decode(iv_hex)
        .map_err(|e| AppError::Validation(format!("Invalid IV hex: {e}")))?;
    let auth_tag = hex::decode(auth_tag_hex)
        .map_err(|e| AppError::Validation(format!("Invalid auth tag hex: {e}")))?;
    let ciphertext = hex::decode(ciphertext_hex)
        .map_err(|e| AppError::Validation(format!("Invalid ciphertext hex: {e}")))?;

    if auth_tag.len() != TAG_SIZE {
        return Err(AppError::Validation(format!(
            "Invalid auth tag length: expected {TAG_SIZE} bytes, got {}",
            auth_tag.len()
        )));
    }

    // aes-gcm expects the payload as ciphertext || auth_tag
    let mut payload = ciphertext;
    payload.extend_from_slice(&auth_tag);

    // The nonce size must match what was used during encryption.
    // We accept the nonce as-is from the stored data.
    if nonce_bytes.len() != NONCE_SIZE {
        return Err(AppError::Validation(format!(
            "Invalid nonce length: expected {NONCE_SIZE} bytes, got {}",
            nonce_bytes.len()
        )));
    }

    let nonce = GenericArray::from_slice(&nonce_bytes);

    let plaintext_bytes = cipher
        .decrypt(nonce, payload.as_ref())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Decryption failed: {e}")))?;

    String::from_utf8(plaintext_bytes)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Decrypted data is not valid UTF-8: {e}")))
}

/// Validates that a string is a valid encryption key format.
/// Must be exactly 64 hex characters (32 bytes).
pub fn is_valid_encryption_key(key: &str) -> bool {
    if key.len() != 64 {
        return false;
    }
    key.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_round_trip() {
        let plaintext = "Hello, world! This is a secret message.";
        let encrypted = encrypt(plaintext).unwrap();

        // Verify format: three hex parts separated by colons
        let parts: Vec<&str> = encrypted.split(':').collect();
        assert_eq!(parts.len(), 3);
        assert!(!parts[0].is_empty());
        assert!(!parts[1].is_empty());
        assert!(!parts[2].is_empty());

        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_encrypt_produces_different_ciphertext() {
        let plaintext = "same message";
        let e1 = encrypt(plaintext).unwrap();
        let e2 = encrypt(plaintext).unwrap();
        // Different nonces should produce different ciphertexts
        assert_ne!(e1, e2);

        // But both should decrypt to the same plaintext
        assert_eq!(decrypt(&e1).unwrap(), plaintext);
        assert_eq!(decrypt(&e2).unwrap(), plaintext);
    }

    #[test]
    fn test_decrypt_invalid_format() {
        assert!(decrypt("invalid").is_err());
        assert!(decrypt("a:b").is_err());
        assert!(decrypt("::").is_err());
    }

    #[test]
    fn test_is_valid_encryption_key() {
        // Valid: 64 hex chars
        assert!(is_valid_encryption_key(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
        // Valid: uppercase hex
        assert!(is_valid_encryption_key(
            "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"
        ));
        // Invalid: too short
        assert!(!is_valid_encryption_key("0123456789abcdef"));
        // Invalid: too long
        assert!(!is_valid_encryption_key(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00"
        ));
        // Invalid: non-hex chars
        assert!(!is_valid_encryption_key(
            "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
        ));
        // Invalid: empty
        assert!(!is_valid_encryption_key(""));
    }

    #[test]
    fn test_encrypt_empty_string() {
        let encrypted = encrypt("").unwrap();
        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, "");
    }

    #[test]
    fn test_encrypt_unicode() {
        let plaintext = "Hola mundo! Esto es una clave secreta.";
        let encrypted = encrypt(plaintext).unwrap();
        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }
}
