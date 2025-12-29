//! Mathison Rust SDK
//! Auto-generated client for Mathison API

pub struct MathisonClient {
    base_url: String,
}

impl MathisonClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
        }
    }
}

// TODO: Add API client methods
// TODO: Add authentication support
// TODO: Add async streaming support

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let _client = MathisonClient::new("http://localhost:3000");
    }
}
