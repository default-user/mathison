"""Mathison SDK Client - HTTP Client for Mathison API"""

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

    def get_genome(self) -> GenomeMetadata:
        """Get active genome metadata"""
        data = self._get("/genome")
        return GenomeMetadata(**data)\n\n    def get_health(self) -> HealthResponse:
        """Health check"""
        data = self._get("/health")
        return HealthResponse(**data)\n\n    def get_job_logs(self, job_id: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        """Get job logs/receipts"""
        data = self._get("/jobs/logs")
        return Dict[str, Any](**data)\n\n    def resume_job(self) -> Dict[str, Any]:
        """Resume a suspended job"""
        return self._post("/jobs/resume")\n\n    def run_job(self, job_type: str, inputs: Optional[Dict] = None, policy_id: Optional[str] = None) -> JobResult:
        """Run a job"""
        payload = {"jobType": job_type}
        if inputs:
            payload["inputs"] = inputs
        if policy_id:
            payload["policyId"] = policy_id
        data = self._post("/jobs/run", json=payload)
        return JobResult(**data)\n\n    def get_job_status(self, job_id: Optional[str] = None, limit: Optional[int] = None) -> JobResult:
        """Get job status"""
        params = {}
        if job_id:
            params["job_id"] = job_id
        if limit:
            params["limit"] = limit
        data = self._get("/jobs/status", params=params if params else None)
        return JobResult(**data) if "job_id" in data else data\n\n    def create_edge(self, idempotency_key: str, from_node: str, to_node: str, type: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """Create a new edge"""
        payload = {"idempotency_key": idempotency_key, "from": from_node, "to": to_node, "type": type}
        if metadata:
            payload["metadata"] = metadata
        data = self._post("/memory/edges", json=payload)
        return CreateEdgeResponse(**data)\n\n    def get_edge(self, id: str) -> Edge:
        """Get edge by ID"""
        data = self._get(f"/memory/edges/{id}")
        return Edge(**data)\n\n    def create_hyperedge(self) -> Dict[str, Any]:
        """Create a new hyperedge"""
        return self._post("/memory/hyperedges")\n\n    def get_hyperedge(self, id: str) -> Dict[str, Any]:
        """Get hyperedge by ID"""
        data = self._get(f"/memory/hyperedges/{id}")
        return Dict[str, Any](**data)\n\n    def create_node(self, idempotency_key: str, type: str, data: Optional[Dict] = None, metadata: Optional[Dict] = None, id: Optional[str] = None) -> CreateNodeResponse:
        """Create a new node"""
        payload = {"idempotency_key": idempotency_key, "type": type}
        if data:
            payload["data"] = data
        if metadata:
            payload["metadata"] = metadata
        if id:
            payload["id"] = id
        data = self._post("/memory/nodes", json=payload)
        return CreateNodeResponse(**data)\n\n    def get_node(self, id: str) -> Node:
        """Get node by ID"""
        data = self._get(f"/memory/nodes/{id}")
        return Node(**data)\n\n    def update_node(self, id: str) -> Dict[str, Any]:
        """Update node by ID"""
        return self._post("/memory/nodes/{id}")\n\n    def get_node_edges(self, id: str) -> Dict[str, Any]:
        """Get edges for node"""
        data = self._get(f"/memory/nodes/{id}/edges")
        return Dict[str, Any](**data)\n\n    def get_node_hyperedges(self, id: str) -> Dict[str, Any]:
        """Get hyperedges for node"""
        data = self._get(f"/memory/nodes/{id}/hyperedges")
        return Dict[str, Any](**data)\n\n    def search_nodes(self, query: str, limit: int = 10) -> SearchResponse:
        """Search nodes"""
        data = self._get("/memory/search", params={"q": query, "limit": limit})
        return SearchResponse(**data)\n\n    def interpret(self, text: str, limit: Optional[int] = None) -> InterpretResponse:
        """Interpret text using memory context"""
        payload = {"text": text}
        if limit:
            payload["limit"] = limit
        data = self._post("/oi/interpret", json=payload)
        return InterpretResponse(**data)\n\n    def get_openapi(self) -> Dict[str, Any]:
        """OpenAPI specification"""
        data = self._get("/openapi.json")
        return Dict[str, Any](**data)


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

    async def get_genome(self) -> GenomeMetadata:
        """Get active genome metadata"""
        
        data = await self._get("/genome")
        return GenomeMetadata(**data)\n\n    async def get_health(self) -> HealthResponse:
        """Health check"""
        
        data = await self._get("/health")
        return HealthResponse(**data)\n\n    async def get_job_logs(self, job_id: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        """Get job logs/receipts"""
        
        data = await self._get("/jobs/logs")
        return Dict[str, Any](**data)\n\n    async def resume_job(self) -> Dict[str, Any]:
        """Resume a suspended job"""
        
        return await self._post("/jobs/resume")\n\n    async def run_job(self, job_type: str, inputs: Optional[Dict] = None, policy_id: Optional[str] = None) -> JobResult:
        """Run a job"""
        
        payload = {"jobType": job_type}
        if inputs:
            payload["inputs"] = inputs
        if policy_id:
            payload["policyId"] = policy_id
        data = await self._post("/jobs/run", json=payload)
        return JobResult(**data)\n\n    async def get_job_status(self, job_id: Optional[str] = None, limit: Optional[int] = None) -> JobResult:
        """Get job status"""
        
        params = {}
        if job_id:
            params["job_id"] = job_id
        if limit:
            params["limit"] = limit
        data = await self._get("/jobs/status", params=params if params else None)
        return JobResult(**data) if "job_id" in data else data\n\n    async def create_edge(self, idempotency_key: str, from_node: str, to_node: str, type: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """Create a new edge"""
        
        payload = {"idempotency_key": idempotency_key, "from": from_node, "to": to_node, "type": type}
        if metadata:
            payload["metadata"] = metadata
        data = await self._post("/memory/edges", json=payload)
        return CreateEdgeResponse(**data)\n\n    async def get_edge(self, id: str) -> Edge:
        """Get edge by ID"""
        
        data = await self._get(f"/memory/edges/{id}")
        return Edge(**data)\n\n    async def create_hyperedge(self) -> Dict[str, Any]:
        """Create a new hyperedge"""
        
        return await self._post("/memory/hyperedges")\n\n    async def get_hyperedge(self, id: str) -> Dict[str, Any]:
        """Get hyperedge by ID"""
        
        data = await self._get(f"/memory/hyperedges/{id}")
        return Dict[str, Any](**data)\n\n    async def create_node(self, idempotency_key: str, type: str, data: Optional[Dict] = None, metadata: Optional[Dict] = None, id: Optional[str] = None) -> CreateNodeResponse:
        """Create a new node"""
        
        payload = {"idempotency_key": idempotency_key, "type": type}
        if data:
            payload["data"] = data
        if metadata:
            payload["metadata"] = metadata
        if id:
            payload["id"] = id
        data = await self._post("/memory/nodes", json=payload)
        return CreateNodeResponse(**data)\n\n    async def get_node(self, id: str) -> Node:
        """Get node by ID"""
        
        data = await self._get(f"/memory/nodes/{id}")
        return Node(**data)\n\n    async def update_node(self, id: str) -> Dict[str, Any]:
        """Update node by ID"""
        
        return await self._post("/memory/nodes/{id}")\n\n    async def get_node_edges(self, id: str) -> Dict[str, Any]:
        """Get edges for node"""
        
        data = await self._get(f"/memory/nodes/{id}/edges")
        return Dict[str, Any](**data)\n\n    async def get_node_hyperedges(self, id: str) -> Dict[str, Any]:
        """Get hyperedges for node"""
        
        data = await self._get(f"/memory/nodes/{id}/hyperedges")
        return Dict[str, Any](**data)\n\n    async def search_nodes(self, query: str, limit: int = 10) -> SearchResponse:
        """Search nodes"""
        
        data = await self._get("/memory/search", params={"q": query, "limit": limit})
        return SearchResponse(**data)\n\n    async def interpret(self, text: str, limit: Optional[int] = None) -> InterpretResponse:
        """Interpret text using memory context"""
        
        payload = {"text": text}
        if limit:
            payload["limit"] = limit
        data = await self._post("/oi/interpret", json=payload)
        return InterpretResponse(**data)\n\n    async def get_openapi(self) -> Dict[str, Any]:
        """OpenAPI specification"""
        
        data = await self._get("/openapi.json")
        return Dict[str, Any](**data)
