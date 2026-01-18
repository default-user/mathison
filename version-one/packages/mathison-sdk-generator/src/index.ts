/**
 * Mathison SDK Generator
 * Generates client SDKs from the CANONICAL mathison-server OpenAPI spec
 *
 * Source of truth: mathison-server public API (generateOpenAPISpec)
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateOpenAPISpec, ActionMetadata } from 'mathison-server';

export interface SDKTarget {
  language: 'typescript' | 'python' | 'rust' | 'go' | 'java';
  outputPath: string;
}

export interface APIEndpoint {
  method: string;
  path: string;
  body?: string;
  params?: string[];
  pathParams?: string[];
  returns: string;
  action?: ActionMetadata;
  description?: string;
}

/**
 * Extract endpoints from OpenAPI spec
 */
function extractEndpointsFromOpenAPI(): APIEndpoint[] {
  const spec = generateOpenAPISpec();
  const endpoints: APIEndpoint[] = [];

  for (const [apiPath, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      const endpoint: APIEndpoint = {
        method: method.toUpperCase(),
        path: apiPath,
        returns: extractReturnType(operation),
        action: operation['x-mathison-action'],
        description: operation.summary
      };

      // Extract body type if present
      if (operation.requestBody?.content?.['application/json']?.schema) {
        const schema = operation.requestBody.content['application/json'].schema;
        endpoint.body = extractTypeName(schema);
      }

      // Extract parameters
      if (operation.parameters) {
        endpoint.params = operation.parameters
          .filter((p: any) => p.in === 'query')
          .map((p: any) => p.name);
        endpoint.pathParams = operation.parameters
          .filter((p: any) => p.in === 'path')
          .map((p: any) => p.name);
      }

      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

function extractReturnType(operation: any): string {
  const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
  if (successResponse?.content?.['application/json']?.schema) {
    return extractTypeName(successResponse.content['application/json'].schema);
  }
  return 'void';
}

function extractTypeName(schema: any): string {
  if (schema.$ref) {
    return schema.$ref.split('/').pop() || 'unknown';
  }
  if (schema.type === 'object') {
    return 'object';
  }
  return schema.type || 'unknown';
}

export class SDKGenerator {
  async generate(target: SDKTarget): Promise<void> {
    console.log(`🔧 Generating ${target.language} SDK to ${target.outputPath}...`);
    console.log('   Source: mathison-server OpenAPI (canonical product API)');

    switch (target.language) {
      case 'typescript':
        await this.generateTypeScript(target.outputPath);
        break;
      case 'python':
        await this.generatePython(target.outputPath);
        break;
      case 'rust':
        await this.generateRust(target.outputPath);
        break;
      default:
        throw new Error(`Unsupported language: ${target.language}`);
    }
  }

  private async generateTypeScript(outputPath: string): Promise<void> {
    const endpoints = extractEndpointsFromOpenAPI();
    const code = this.generateTypeScriptClient(endpoints);

    // Ensure directory exists
    const srcPath = path.join(outputPath, 'src');
    fs.mkdirSync(srcPath, { recursive: true });

    // Write the client file
    const clientPath = path.join(srcPath, 'index.ts');
    fs.writeFileSync(clientPath, code, 'utf-8');

    console.log(`📝 Generated TypeScript SDK (${code.length} chars)`);
    console.log(`   Output: ${clientPath}`);
    console.log('   Endpoints:', endpoints.map(e => `${e.method} ${e.path}`).join(', '));
    console.log('✅ TypeScript SDK generated from OpenAPI');
  }

  private async generatePython(outputPath: string): Promise<void> {
    const endpoints = extractEndpointsFromOpenAPI();

    // Ensure directories exist
    fs.mkdirSync(path.join(outputPath, 'mathison_sdk'), { recursive: true });

    // Write pyproject.toml
    const pyproject = `[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "mathison-sdk"
version = "1.0.0"
description = "Python SDK for Mathison API"
readme = "README.md"
license = {text = "MIT"}
requires-python = ">=3.8"
dependencies = [
    "httpx>=0.24.0",
    "pydantic>=2.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-asyncio>=0.21.0",
]
`;
    fs.writeFileSync(path.join(outputPath, 'pyproject.toml'), pyproject, 'utf-8');

    // Write README
    const readme = `# Mathison Python SDK

Python client for the Mathison API.

## Installation

\`\`\`bash
pip install mathison-sdk
\`\`\`

Or from source:

\`\`\`bash
pip install -e .
\`\`\`

## Usage

\`\`\`python
from mathison_sdk import MathisonClient

# Initialize client
client = MathisonClient(base_url="http://localhost:3000")

# Health check
health = client.get_health()
print(f"Status: {health.status}")

# Create memory node
node = client.create_node(
    idempotency_key="my-key",
    type="document",
    data={"content": "Hello World"}
)
print(f"Created: {node.id}")

# Search nodes
results = client.search_nodes(query="hello", limit=10)
for result in results.results:
    print(f"Found: {result.id} - {result.type}")

# OI Interpretation
interpretation = client.interpret(text="What is the meaning of life?")
print(f"Response: {interpretation.interpretation}")
\`\`\`

## Async Usage

\`\`\`python
from mathison_sdk import AsyncMathisonClient
import asyncio

async def main():
    async with AsyncMathisonClient(base_url="http://localhost:3000") as client:
        health = await client.get_health()
        print(f"Status: {health.status}")

asyncio.run(main())
\`\`\`

## API Endpoints

${endpoints.map(e => `- \`${e.method} ${e.path}\` - ${e.description || 'No description'}`).join('\n')}

## Generated from

This SDK is generated from the mathison-server OpenAPI specification.
See \`packages/mathison-sdk-generator\` for the generator.
`;
    fs.writeFileSync(path.join(outputPath, 'README.md'), readme, 'utf-8');

    // Write __init__.py
    const initPy = `"""Mathison Python SDK - Generated from OpenAPI Spec"""

from .client import MathisonClient, AsyncMathisonClient
from .models import (
    HealthResponse,
    GenomeMetadata,
    Node,
    Edge,
    SearchResponse,
    JobResult,
    InterpretResponse,
    CreateNodeRequest,
    CreateEdgeRequest,
)

__version__ = "1.0.0"
__all__ = [
    "MathisonClient",
    "AsyncMathisonClient",
    "HealthResponse",
    "GenomeMetadata",
    "Node",
    "Edge",
    "SearchResponse",
    "JobResult",
    "InterpretResponse",
    "CreateNodeRequest",
    "CreateEdgeRequest",
]
`;
    fs.writeFileSync(path.join(outputPath, 'mathison_sdk', '__init__.py'), initPy, 'utf-8');

    // Write models.py
    const modelsPy = `"""Mathison SDK Data Models"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    bootStatus: str
    governance: Optional[Dict[str, Any]] = None
    storage: Optional[Dict[str, Any]] = None
    memory: Optional[Dict[str, Any]] = None


class GenomeMetadata(BaseModel):
    genome_id: str
    name: str
    version: str
    parents: List[str] = []
    created_at: str
    invariants: List[Dict[str, Any]] = []
    capabilities: List[Dict[str, Any]] = []


class Node(BaseModel):
    id: str
    type: str
    data: Dict[str, Any] = {}
    metadata: Optional[Dict[str, Any]] = None


class Edge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    metadata: Optional[Dict[str, Any]] = None


class Receipt(BaseModel):
    timestamp: str
    job_id: str
    stage: str
    action: str
    decision: str
    policy_id: Optional[str] = None
    genome_id: Optional[str] = None
    genome_version: Optional[str] = None


class SearchResponse(BaseModel):
    query: str
    limit: int
    count: int
    results: List[Node]


class JobResult(BaseModel):
    job_id: str
    status: str
    outputs: Optional[Dict[str, Any]] = None
    genome_id: Optional[str] = None
    genome_version: Optional[str] = None


class InterpretResponse(BaseModel):
    interpretation: str
    confidence: float
    citations: List[Dict[str, Any]] = []
    genome: Optional[Dict[str, Any]] = None


class CreateNodeRequest(BaseModel):
    idempotency_key: str
    id: Optional[str] = None
    type: str
    data: Dict[str, Any] = {}
    metadata: Optional[Dict[str, Any]] = None


class CreateEdgeRequest(BaseModel):
    idempotency_key: str
    from_node: str  # 'from' is reserved in Python
    to_node: str
    type: str
    metadata: Optional[Dict[str, Any]] = None


class CreateNodeResponse(BaseModel):
    node: Node
    created: bool
    receipt: Optional[Receipt] = None


class CreateEdgeResponse(BaseModel):
    edge: Edge
    created: bool
    receipt: Optional[Receipt] = None
`;
    fs.writeFileSync(path.join(outputPath, 'mathison_sdk', 'models.py'), modelsPy, 'utf-8');

    // Generate client.py with methods for each endpoint
    const clientMethods = this.generatePythonMethods(endpoints);
    const clientPy = `"""Mathison SDK Client - HTTP Client for Mathison API"""

from typing import Any, Dict, List, Optional
import httpx

from .models import (
    HealthResponse,
    GenomeMetadata,
    Node,
    Edge,
    SearchResponse,
    JobResult,
    InterpretResponse,
    CreateNodeRequest,
    CreateEdgeRequest,
    CreateNodeResponse,
    CreateEdgeResponse,
    Receipt,
)


class MathisonClient:
    """Synchronous Mathison API Client."""

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._client = httpx.Client(timeout=timeout)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def close(self):
        self._client.close()

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        response = self._client.get(
            f"{self.base_url}{path}",
            headers=self._headers(),
            params=params,
        )
        response.raise_for_status()
        return response.json()

    def _post(self, path: str, json: Optional[Dict] = None) -> Any:
        response = self._client.post(
            f"{self.base_url}{path}",
            headers=self._headers(),
            json=json,
        )
        response.raise_for_status()
        return response.json()

${clientMethods.sync}


class AsyncMathisonClient:
    """Asynchronous Mathison API Client."""

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def close(self):
        await self._client.aclose()

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        response = await self._client.get(
            f"{self.base_url}{path}",
            headers=self._headers(),
            params=params,
        )
        response.raise_for_status()
        return response.json()

    async def _post(self, path: str, json: Optional[Dict] = None) -> Any:
        response = await self._client.post(
            f"{self.base_url}{path}",
            headers=self._headers(),
            json=json,
        )
        response.raise_for_status()
        return response.json()

${clientMethods.async}
`;
    fs.writeFileSync(path.join(outputPath, 'mathison_sdk', 'client.py'), clientPy, 'utf-8');

    // Write test file
    const testPy = `"""Tests for Mathison SDK"""

import pytest
from mathison_sdk import MathisonClient, AsyncMathisonClient
from mathison_sdk.models import HealthResponse


class TestMathisonClient:
    """Test synchronous client."""

    def test_client_initialization(self):
        client = MathisonClient(base_url="http://localhost:3000")
        assert client.base_url == "http://localhost:3000"
        client.close()

    def test_client_context_manager(self):
        with MathisonClient() as client:
            assert client is not None


class TestAsyncMathisonClient:
    """Test async client."""

    @pytest.mark.asyncio
    async def test_async_client_initialization(self):
        async with AsyncMathisonClient(base_url="http://localhost:3000") as client:
            assert client is not None
`;
    fs.mkdirSync(path.join(outputPath, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(outputPath, 'tests', '__init__.py'), '', 'utf-8');
    fs.writeFileSync(path.join(outputPath, 'tests', 'test_client.py'), testPy, 'utf-8');

    console.log(`📝 Generated Python SDK`);
    console.log(`   Output: ${outputPath}`);
    console.log('   Files:');
    console.log('     - pyproject.toml');
    console.log('     - mathison_sdk/__init__.py');
    console.log('     - mathison_sdk/models.py');
    console.log('     - mathison_sdk/client.py');
    console.log('     - tests/test_client.py');
    console.log('✅ Python SDK generated from OpenAPI');
  }

  private generatePythonMethods(endpoints: APIEndpoint[]): { sync: string; async: string } {
    const sortedEndpoints = [...endpoints].sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return a.method.localeCompare(b.method);
    });

    const syncMethods: string[] = [];
    const asyncMethods: string[] = [];

    for (const ep of sortedEndpoints) {
      const methodName = this.pythonMethodName(ep.path, ep.method);
      const docstring = ep.description || `${ep.method} ${ep.path}`;
      const returnType = this.pythonReturnType(ep);
      const params = this.pythonParams(ep);
      const body = this.pythonBody(ep);

      // Sync method
      syncMethods.push(`    def ${methodName}(self${params}) -> ${returnType}:
        """${docstring}"""${body}`);

      // Async method
      asyncMethods.push(`    async def ${methodName}(self${params}) -> ${returnType}:
        """${docstring}"""
        ${body.replace('self._get', 'await self._get').replace('self._post', 'await self._post')}`);
    }

    return {
      sync: syncMethods.join('\\n\\n'),
      async: asyncMethods.join('\\n\\n')
    };
  }

  private pythonMethodName(apiPath: string, method: string): string {
    // Convert path to snake_case method name
    if (apiPath === '/health') return 'get_health';
    if (apiPath === '/openapi.json') return 'get_openapi';
    if (apiPath === '/genome') return 'get_genome';
    if (apiPath === '/jobs/run') return 'run_job';
    if (apiPath === '/jobs/status') return 'get_job_status';
    if (apiPath === '/jobs/resume') return 'resume_job';
    if (apiPath === '/jobs/logs') return 'get_job_logs';
    if (apiPath === '/memory/nodes' && method === 'POST') return 'create_node';
    if (apiPath === '/memory/nodes/{id}' && method === 'GET') return 'get_node';
    if (apiPath === '/memory/nodes/{id}' && method === 'POST') return 'update_node';
    if (apiPath === '/memory/nodes/{id}/edges') return 'get_node_edges';
    if (apiPath === '/memory/nodes/{id}/hyperedges') return 'get_node_hyperedges';
    if (apiPath === '/memory/edges' && method === 'POST') return 'create_edge';
    if (apiPath === '/memory/edges/{id}') return 'get_edge';
    if (apiPath === '/memory/hyperedges' && method === 'POST') return 'create_hyperedge';
    if (apiPath === '/memory/hyperedges/{id}') return 'get_hyperedge';
    if (apiPath === '/memory/search') return 'search_nodes';
    if (apiPath === '/oi/interpret') return 'interpret';

    // Fallback
    const parts = apiPath.split('/').filter(p => p && !p.startsWith('{'));
    return `${method.toLowerCase()}_${parts.join('_')}`;
  }

  private pythonReturnType(ep: APIEndpoint): string {
    if (ep.path === '/health') return 'HealthResponse';
    if (ep.path === '/genome') return 'GenomeMetadata';
    if (ep.path === '/memory/search') return 'SearchResponse';
    if (ep.path === '/memory/nodes' && ep.method === 'POST') return 'CreateNodeResponse';
    if (ep.path.match(/\/memory\/nodes\/\{id\}$/) && ep.method === 'GET') return 'Node';
    if (ep.path.match(/\/memory\/edges\/\{id\}$/)) return 'Edge';
    if (ep.path === '/jobs/run') return 'JobResult';
    if (ep.path === '/jobs/status') return 'JobResult';
    if (ep.path === '/oi/interpret') return 'InterpretResponse';
    return 'Dict[str, Any]';
  }

  private pythonParams(ep: APIEndpoint): string {
    const params: string[] = [];

    if (ep.pathParams && ep.pathParams.length > 0) {
      params.push(...ep.pathParams.map(p => `, ${p}: str`));
    }

    if (ep.path === '/memory/nodes' && ep.method === 'POST') {
      params.push(', idempotency_key: str, type: str, data: Optional[Dict] = None, metadata: Optional[Dict] = None, id: Optional[str] = None');
    } else if (ep.path === '/memory/edges' && ep.method === 'POST') {
      params.push(', idempotency_key: str, from_node: str, to_node: str, type: str, metadata: Optional[Dict] = None');
    } else if (ep.path === '/oi/interpret') {
      params.push(', text: str, limit: Optional[int] = None');
    } else if (ep.path === '/jobs/run') {
      params.push(', job_type: str, inputs: Optional[Dict] = None, policy_id: Optional[str] = None');
    } else if (ep.path === '/jobs/status' || ep.path === '/jobs/logs') {
      params.push(', job_id: Optional[str] = None, limit: Optional[int] = None');
    } else if (ep.path === '/memory/search') {
      params.push(', query: str, limit: int = 10');
    }

    return params.join('');
  }

  private pythonBody(ep: APIEndpoint): string {
    if (ep.method === 'GET') {
      if (ep.path === '/memory/search') {
        return `
        data = self._get("/memory/search", params={"q": query, "limit": limit})
        return SearchResponse(**data)`;
      }
      if (ep.path.includes('{id}')) {
        const returnType = this.pythonReturnType(ep);
        return `
        data = self._get(f"/${ep.path.replace('{id}', '{id}').split('/').slice(1).join('/')}")
        return ${returnType}(**data)`;
      }
      if (ep.path === '/jobs/status') {
        return `
        params = {}
        if job_id:
            params["job_id"] = job_id
        if limit:
            params["limit"] = limit
        data = self._get("/jobs/status", params=params if params else None)
        return JobResult(**data) if "job_id" in data else data`;
      }
      const returnType = this.pythonReturnType(ep);
      return `
        data = self._get("${ep.path}")
        return ${returnType}(**data)`;
    }

    if (ep.method === 'POST') {
      if (ep.path === '/memory/nodes') {
        return `
        payload = {"idempotency_key": idempotency_key, "type": type}
        if data:
            payload["data"] = data
        if metadata:
            payload["metadata"] = metadata
        if id:
            payload["id"] = id
        data = self._post("/memory/nodes", json=payload)
        return CreateNodeResponse(**data)`;
      }
      if (ep.path === '/memory/edges') {
        return `
        payload = {"idempotency_key": idempotency_key, "from": from_node, "to": to_node, "type": type}
        if metadata:
            payload["metadata"] = metadata
        data = self._post("/memory/edges", json=payload)
        return CreateEdgeResponse(**data)`;
      }
      if (ep.path === '/oi/interpret') {
        return `
        payload = {"text": text}
        if limit:
            payload["limit"] = limit
        data = self._post("/oi/interpret", json=payload)
        return InterpretResponse(**data)`;
      }
      if (ep.path === '/jobs/run') {
        return `
        payload = {"jobType": job_type}
        if inputs:
            payload["inputs"] = inputs
        if policy_id:
            payload["policyId"] = policy_id
        data = self._post("/jobs/run", json=payload)
        return JobResult(**data)`;
      }
    }

    return `
        return self._${ep.method.toLowerCase()}("${ep.path}")`;
  }

  private async generateRust(outputPath: string): Promise<void> {
    const endpoints = extractEndpointsFromOpenAPI();

    // Ensure directories exist
    fs.mkdirSync(path.join(outputPath, 'src'), { recursive: true });

    // Write Cargo.toml
    const cargoToml = `[package]
name = "mathison-sdk"
version = "1.0.0"
edition = "2021"
description = "Rust SDK for Mathison API"
license = "MIT"

[dependencies]
reqwest = { version = "0.11", features = ["json", "blocking"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
`;
    fs.writeFileSync(path.join(outputPath, 'Cargo.toml'), cargoToml, 'utf-8');

    // Write lib.rs with basic client
    const libRs = `//! Mathison Rust SDK
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
`;
    fs.writeFileSync(path.join(outputPath, 'src/lib.rs'), libRs, 'utf-8');

    // Write README
    const readme = `# Mathison Rust SDK

Rust client for the Mathison API.

## Installation

Add to your \`Cargo.toml\`:

\`\`\`toml
[dependencies]
mathison-sdk = { path = "../path/to/sdks/rust" }
\`\`\`

## Usage

\`\`\`rust
use mathison_sdk::MathisonClient;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = MathisonClient::new("http://localhost:3000");

    // Health check
    let health = client.get_health()?;
    println!("Status: {}", health.status);

    Ok(())
}
\`\`\`

## API Endpoints

${endpoints.map(e => `- \`${e.method} ${e.path}\` - ${e.description || 'No description'}`).join('\n')}

## Generated from

This SDK is generated from the mathison-server OpenAPI specification.
See \`packages/mathison-sdk-generator\` for the generator.
`;
    fs.writeFileSync(path.join(outputPath, 'README.md'), readme, 'utf-8');

    console.log(`📝 Generated Rust SDK`);
    console.log(`   Output: ${outputPath}`);
    console.log('   Files:');
    console.log('     - Cargo.toml');
    console.log('     - src/lib.rs');
    console.log('     - README.md');
    console.log('✅ Rust SDK generated from OpenAPI');
  }

  // Generate TypeScript client code - DETERMINISTIC output (sorted endpoints)
  private generateTypeScriptClient(endpoints: APIEndpoint[]): string {
    // Sort endpoints for deterministic output
    const sortedEndpoints = [...endpoints].sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return a.method.localeCompare(b.method);
    });

    const methods = sortedEndpoints.map(ep => {
      const methodName = this.endpointToMethodName(ep.path, ep.method);
      const params = this.getMethodParams(ep);
      const returnType = this.mapReturnType(ep.returns);
      const actionComment = ep.action ? `  // Action: ${ep.action.action} (${ep.action.riskClass})` : '';
      const descComment = ep.description ? `  // ${ep.description}` : '';
      const impl = this.generateMethodImpl(ep);

      return `${descComment}
${actionComment}
  async ${methodName}(${params}): Promise<${returnType}> {
${impl}
  }`;
    });

    return `/**
 * Mathison TypeScript SDK
 * Generated from mathison-server OpenAPI (canonical product API)
 *
 * IMPORTANT: This client targets mathison-server (port 3000), NOT kernel-mac.
 */

export interface MathisonClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  bootStatus: 'booting' | 'ready' | 'failed';
  governance: {
    treaty: { version: string; authority: string };
    genome: { name: string; version: string; genome_id: string; initialized: boolean };
  };
}

export interface GenomeMetadata {
  genome_id: string;
  name: string;
  version: string;
  parents: string[];
  created_at: string;
  invariants: Array<{ id: string; severity: string; testable_claim: string }>;
  capabilities: Array<{ cap_id: string; risk_class: string; allow_count: number; deny_count: number }>;
}

export interface JobRunRequest {
  jobType: string;
  inputs?: Record<string, unknown>;
  policyId?: string;
  jobId?: string;
}

export interface JobResult {
  job_id: string;
  status: 'running' | 'completed' | 'failed' | 'suspended';
  outputs?: Record<string, unknown>;
  genome_id?: string;
  genome_version?: string;
}

export interface JobLogsResponse {
  job_id: string;
  count: number;
  receipts: Receipt[];
}

export interface Receipt {
  timestamp: string;
  job_id: string;
  stage: string;
  action: string;
  decision: 'ALLOW' | 'DENY';
  policy_id?: string;
  genome_id?: string;
  genome_version?: string;
}

export interface Node {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateNodeRequest {
  idempotency_key: string;
  id?: string;
  type: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateEdgeRequest {
  idempotency_key: string;
  from: string;
  to: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface CreateHyperedgeRequest {
  idempotency_key: string;
  id?: string;
  nodes: string[];
  type: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  query: string;
  limit: number;
  count: number;
  results: Node[];
}

export interface InterpretRequest {
  text: string;
  limit?: number;
}

export interface InterpretResponse {
  interpretation: string;
  confidence: number;
  citations: Array<{ node_id: string; why: string }>;
  genome: { id: string; version: string };
}

export class MathisonClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(options: MathisonClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = \`Bearer \${this.apiKey}\`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
        throw new Error(error.error || \`HTTP \${response.status}: \${response.statusText}\`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

${methods.join('\n\n')}
}

export default MathisonClient;
`;
  }

  private generateMethodImpl(ep: APIEndpoint): string {
    const pathWithParams = ep.path.replace(/\{(\w+)\}/g, '${$1}');
    const hasPathParams = ep.path.includes('{');
    const pathExpr = hasPathParams ? `\`${pathWithParams}\`` : `'${ep.path}'`;

    if (ep.method === 'GET') {
      if (ep.params && ep.params.length > 0) {
        const queryObj = ep.params.map(p => `${p}`).join(', ');
        return `    return this.request('GET', ${pathExpr}, undefined, { ${queryObj} });`;
      }
      return `    return this.request('GET', ${pathExpr});`;
    } else if (ep.method === 'POST') {
      if (ep.body) {
        return `    return this.request('POST', ${pathExpr}, body);`;
      }
      return `    return this.request('POST', ${pathExpr});`;
    }
    return `    return this.request('${ep.method}', ${pathExpr});`;
  }

  // Convert endpoint to method name (for mathison-server routes)
  private endpointToMethodName(apiPath: string, method: string): string {
    // Mathison-server specific mappings
    if (apiPath === '/health') return 'getHealth';
    if (apiPath === '/openapi.json') return 'getOpenAPI';
    if (apiPath === '/genome') return 'getGenome';

    // Jobs
    if (apiPath === '/jobs/run') return 'runJob';
    if (apiPath === '/jobs/status') return 'getJobStatus';
    if (apiPath === '/jobs/resume') return 'resumeJob';
    if (apiPath === '/jobs/logs') return 'getJobLogs';

    // Memory
    if (apiPath === '/memory/nodes' && method === 'POST') return 'createNode';
    if (apiPath === '/memory/nodes/{id}' && method === 'GET') return 'getNode';
    if (apiPath === '/memory/nodes/{id}' && method === 'POST') return 'updateNode';
    if (apiPath === '/memory/nodes/{id}/edges') return 'getNodeEdges';
    if (apiPath === '/memory/nodes/{id}/hyperedges') return 'getNodeHyperedges';
    if (apiPath === '/memory/edges' && method === 'POST') return 'createEdge';
    if (apiPath === '/memory/edges/{id}') return 'getEdge';
    if (apiPath === '/memory/hyperedges' && method === 'POST') return 'createHyperedge';
    if (apiPath === '/memory/hyperedges/{id}') return 'getHyperedge';
    if (apiPath === '/memory/search') return 'searchNodes';

    // OI
    if (apiPath === '/oi/interpret') return 'interpret';

    // Fallback
    const parts = apiPath.split('/').filter(p => p && !p.startsWith('{'));
    const resource = parts[parts.length - 1];
    const action = method.toLowerCase() === 'get' ? 'get' : method.toLowerCase();
    return `${action}${this.capitalize(resource)}`;
  }

  // Get method parameters
  private getMethodParams(ep: APIEndpoint): string {
    const params: string[] = [];

    if (ep.pathParams && ep.pathParams.length > 0) {
      params.push(...ep.pathParams.map(p => `${p}: string`));
    }
    if (ep.body) {
      params.push(`body: ${this.mapBodyType(ep)}`);
    }
    if (ep.params && ep.params.length > 0) {
      params.push(...ep.params.map(p => `${p}?: string`));
    }

    return params.join(', ');
  }

  private mapBodyType(ep: APIEndpoint): string {
    if (ep.path === '/jobs/run') return 'JobRunRequest';
    if (ep.path === '/jobs/resume') return '{ job_id: string }';
    if (ep.path === '/memory/nodes' && ep.method === 'POST') return 'CreateNodeRequest';
    if (ep.path.startsWith('/memory/nodes/') && ep.method === 'POST') return 'Partial<CreateNodeRequest>';
    if (ep.path === '/memory/edges') return 'CreateEdgeRequest';
    if (ep.path === '/memory/hyperedges') return 'CreateHyperedgeRequest';
    if (ep.path === '/oi/interpret') return 'InterpretRequest';
    return 'unknown';
  }

  private mapReturnType(returnType: string): string {
    if (returnType === 'HealthResponse') return 'HealthResponse';
    if (returnType === 'GenomeMetadata') return 'GenomeMetadata';
    if (returnType === 'JobResult') return 'JobResult';
    if (returnType === 'Node') return 'Node';
    if (returnType === 'CreateNodeResponse') return '{ node: Node; created: boolean }';
    if (returnType === 'NodeUpdateResponse') return '{ node: Node; updated: boolean }';
    if (returnType === 'SearchResponse') return 'SearchResponse';
    if (returnType === 'InterpretResponse') return 'InterpretResponse';
    if (returnType === 'void') return 'void';
    return 'unknown';
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

export default SDKGenerator;
