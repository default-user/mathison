//! Mathison Rust SDK
//! Client for Mathison API

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Errors that can occur when using the Mathison client
#[derive(Debug)]
pub enum Error {
    HttpError(String),
    ParseError(String),
    ApiError(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::HttpError(msg) => write!(f, "HTTP error: {}", msg),
            Error::ParseError(msg) => write!(f, "Parse error: {}", msg),
            Error::ApiError(msg) => write!(f, "API error: {}", msg),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// Send message response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageResponse {
    pub message: ChatMessage,
    pub stream_id: Option<String>,
}

/// Chat history response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatHistoryResponse {
    pub messages: Vec<ChatMessage>,
    pub total: usize,
    pub limit: usize,
    pub offset: usize,
}

/// Beam
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Beam {
    pub beam_id: String,
    pub kind: String,
    pub title: String,
    pub tags: Vec<String>,
    pub body: String,
    pub status: String,
    pub pinned: bool,
    pub updated_at_ms: i64,
}

/// Beam query response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamQueryResponse {
    pub beams: Vec<Beam>,
    pub total: usize,
}

/// Beam query parameters
#[derive(Debug, Clone, Default, Serialize)]
pub struct BeamQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kinds: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_dead: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

/// Create beam request
#[derive(Debug, Clone, Serialize)]
pub struct CreateBeamRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub beam_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub tags: Vec<String>,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned: Option<bool>,
}

/// Update beam request
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateBeamRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

/// Tombstone beam request
#[derive(Debug, Clone, Serialize)]
pub struct TombstoneBeamRequest {
    pub reason_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_token: Option<String>,
}

/// Mathison API client
pub struct MathisonClient {
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl MathisonClient {
    /// Create a new Mathison client
    pub fn new(base_url: impl Into<String>) -> Result<Self> {
        Self::with_api_key(base_url, None)
    }

    /// Create a new Mathison client with API key
    pub fn with_api_key(base_url: impl Into<String>, api_key: Option<String>) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| Error::HttpError(e.to_string()))?;

        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key,
            client,
        })
    }

    fn build_headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            "application/json".parse().unwrap(),
        );
        if let Some(ref key) = self.api_key {
            headers.insert(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", key).parse().unwrap(),
            );
        }
        headers
    }

    async fn request<T: serde::de::DeserializeOwned>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<serde_json::Value>,
        query: Option<&[(&str, String)]>,
    ) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.request(method, &url).headers(self.build_headers());

        if let Some(q) = query {
            req = req.query(q);
        }

        if let Some(b) = body {
            req = req.json(&b);
        }

        let response = req.send().await.map_err(|e| Error::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(Error::ApiError(format!("HTTP {}: {}", status, error_text)));
        }

        response
            .json()
            .await
            .map_err(|e| Error::ParseError(e.to_string()))
    }

    // ========== Health & Status ==========

    /// Check API health
    pub async fn health(&self) -> Result<HashMap<String, String>> {
        self.request(reqwest::Method::GET, "/health", None, None).await
    }

    /// Get system status
    pub async fn get_status(&self) -> Result<serde_json::Value> {
        self.request(reqwest::Method::GET, "/api/status", None, None).await
    }

    /// Get identity information
    pub async fn get_identity(&self) -> Result<serde_json::Value> {
        self.request(reqwest::Method::GET, "/api/identity", None, None).await
    }

    // ========== Chat ==========

    /// Send a chat message
    pub async fn send_message(&self, content: impl Into<String>) -> Result<SendMessageResponse> {
        let body = serde_json::json!({ "content": content.into() });
        self.request(reqwest::Method::POST, "/api/chat/send", Some(body), None).await
    }

    /// Get chat history
    pub async fn get_chat_history(&self, limit: Option<usize>, offset: Option<usize>) -> Result<ChatHistoryResponse> {
        let mut query = Vec::new();
        if let Some(l) = limit {
            query.push(("limit", l.to_string()));
        }
        if let Some(o) = offset {
            query.push(("offset", o.to_string()));
        }
        let query_ref = if query.is_empty() { None } else { Some(query.as_slice()) };
        self.request(reqwest::Method::GET, "/api/chat/history", None, query_ref).await
    }

    // ========== Beams ==========

    /// Query beams
    pub async fn query_beams(&self, query: Option<BeamQuery>) -> Result<BeamQueryResponse> {
        let query_params = if let Some(q) = query {
            let mut params = Vec::new();
            if let Some(text) = q.text {
                params.push(("text", text));
            }
            if let Some(limit) = q.limit {
                params.push(("limit", limit.to_string()));
            }
            if query_params.is_empty() { None } else { Some(params.as_slice()) }
        } else {
            None
        };

        self.request(reqwest::Method::GET, "/api/beams", None, query_params).await
    }

    /// Get a specific beam
    pub async fn get_beam(&self, beam_id: impl AsRef<str>) -> Result<Beam> {
        let path = format!("/api/beams/{}", beam_id.as_ref());
        self.request(reqwest::Method::GET, &path, None, None).await
    }

    /// Create a new beam
    pub async fn create_beam(&self, request: CreateBeamRequest) -> Result<Beam> {
        let body = serde_json::to_value(request).map_err(|e| Error::ParseError(e.to_string()))?;
        self.request(reqwest::Method::POST, "/api/beams", Some(body), None).await
    }

    /// Update a beam
    pub async fn update_beam(&self, beam_id: impl AsRef<str>, request: UpdateBeamRequest) -> Result<Beam> {
        let path = format!("/api/beams/{}", beam_id.as_ref());
        let body = serde_json::to_value(request).map_err(|e| Error::ParseError(e.to_string()))?;
        self.request(reqwest::Method::PATCH, &path, Some(body), None).await
    }

    /// Pin a beam
    pub async fn pin_beam(&self, beam_id: impl AsRef<str>) -> Result<HashMap<String, bool>> {
        let path = format!("/api/beams/{}/pin", beam_id.as_ref());
        self.request(reqwest::Method::POST, &path, None, None).await
    }

    /// Unpin a beam
    pub async fn unpin_beam(&self, beam_id: impl AsRef<str>) -> Result<HashMap<String, bool>> {
        let path = format!("/api/beams/{}/pin", beam_id.as_ref());
        self.request(reqwest::Method::DELETE, &path, None, None).await
    }

    /// Retire a beam
    pub async fn retire_beam(&self, beam_id: impl AsRef<str>) -> Result<HashMap<String, bool>> {
        let path = format!("/api/beams/{}/retire", beam_id.as_ref());
        self.request(reqwest::Method::POST, &path, None, None).await
    }

    /// Tombstone a beam
    pub async fn tombstone_beam(&self, beam_id: impl AsRef<str>, request: TombstoneBeamRequest) -> Result<serde_json::Value> {
        let path = format!("/api/beams/{}/tombstone", beam_id.as_ref());
        let body = serde_json::to_value(request).map_err(|e| Error::ParseError(e.to_string()))?;
        self.request(reqwest::Method::POST, &path, Some(body), None).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let _client = MathisonClient::new("http://localhost:3000").unwrap();
    }

    #[test]
    fn test_client_with_api_key() {
        let _client = MathisonClient::with_api_key("http://localhost:3000", Some("test-key".to_string())).unwrap();
    }
}
