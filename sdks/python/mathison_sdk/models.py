"""Mathison SDK Data Models"""

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
