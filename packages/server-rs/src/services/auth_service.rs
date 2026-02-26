use rand::Rng;

/// Generates a cryptographically secure startup token.
/// Returns a 64-character hex string (32 random bytes, hex-encoded).
pub fn generate_startup_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: [u8; 32] = rng.gen();
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_startup_token_length() {
        let token = generate_startup_token();
        assert_eq!(token.len(), 64);
    }

    #[test]
    fn test_generate_startup_token_is_hex() {
        let token = generate_startup_token();
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_generate_startup_token_uniqueness() {
        let t1 = generate_startup_token();
        let t2 = generate_startup_token();
        assert_ne!(t1, t2);
    }
}
