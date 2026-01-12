//! Mathison Rust SDK
//! Generated from mathison-server OpenAPI specification

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug)]
pub enum Error {
    HttpError(String),
    ParseError(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::HttpError(msg) => write!(f, "HTTP error: {}", msg),
            Error::ParseError(msg) => write!(f, "Parse error: {}", msg),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

/// Health response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    #[serde(rename = "bootStatus")]
    pub boot_status: String,
}

/// Node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub data: HashMap<String, serde_json::Value>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// Mathison API Client
pub struct MathisonClient {
    base_url: String,
    client: reqwest::blocking::Client,
}

impl MathisonClient {
    /// Create a new Mathison client
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::blocking::Client::new(),
        }
    }

    /// Get server health
    pub fn get_health(&self) -> Result<HealthResponse> {
        let url = format!("{}/health", self.base_url);
        let resp = self.client
            .get(&url)
            .send()
            .map_err(|e| Error::HttpError(e.to_string()))?;

        resp.json::<HealthResponse>()
            .map_err(|e| Error::ParseError(e.to_string()))
    }

    /// Get node by ID
    pub fn get_node(&self, id: &str) -> Result<Node> {
        let url = format!("{}/memory/nodes/{}", self.base_url, id);
        let resp = self.client
            .get(&url)
            .send()
            .map_err(|e| Error::HttpError(e.to_string()))?;

        resp.json::<Node>()
            .map_err(|e| Error::ParseError(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = MathisonClient::new("http://localhost:3000");
        assert_eq!(client.base_url, "http://localhost:3000");
    }
}
