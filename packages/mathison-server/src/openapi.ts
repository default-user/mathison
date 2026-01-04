/**
 * OpenAPI 3.0 Specification for Mathison Server
 * CANONICAL PRODUCT API - Source of truth for SDK generation
 *
 * All routes include x-mathison-action metadata for governance tracking
 */

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}

/**
 * Action metadata included in OpenAPI spec via vendor extension
 */
export interface ActionMetadata {
  action: string;
  riskClass: 'READ' | 'WRITE' | 'ADMIN';
  requiresIdempotency?: boolean;
  requiresGenome?: boolean;
}

/**
 * Create operation with standard Mathison action metadata
 */
function createOperation(
  summary: string,
  actionMeta: ActionMetadata,
  config: {
    parameters?: any[];
    requestBody?: any;
    responses: Record<string, any>;
    tags?: string[];
  }
) {
  return {
    summary,
    'x-mathison-action': actionMeta,
    tags: config.tags || ['default'],
    parameters: config.parameters,
    requestBody: config.requestBody,
    responses: config.responses
  };
}

export function generateOpenAPISpec(genomeVersion?: string): OpenAPISpec {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Mathison API',
      version: genomeVersion || '1.0.0',
      description: `Mathison Canonical Product API

## Governance Pipeline
All routes enforce the governance pipeline:
- CIF Ingress -> CDI Action Check -> Handler -> CDI Output Check -> CIF Egress

## Fail-Closed Policy
- Routes without declared action: DENIED
- Persistence failures (strict mode): DENIED
- Invalid genome: DENIED at boot

## Action Metadata
Each operation includes \`x-mathison-action\` with:
- \`action\`: Action identifier for CDI check
- \`riskClass\`: READ | WRITE | ADMIN
- \`requiresIdempotency\`: Whether idempotency_key is required
- \`requiresGenome\`: Whether genome must be loaded`
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development (canonical)' }
    ],
    paths: {
      // Health & Meta (allowlisted - no action required)
      '/health': {
        get: {
          summary: 'Health check',
          description: 'Returns server health status. Allowlisted - bypasses CDI action check.',
          tags: ['System'],
          responses: {
            '200': {
              description: 'Server health status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' }
                }
              }
            },
            '503': {
              description: 'Server unhealthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GovernanceError' }
                }
              }
            }
          }
        }
      },

      '/openapi.json': {
        get: {
          summary: 'OpenAPI specification',
          description: 'Returns this OpenAPI specification. Allowlisted - bypasses CDI action check.',
          tags: ['System'],
          responses: {
            '200': {
              description: 'OpenAPI 3.0 specification'
            }
          }
        }
      },

      // Genome
      '/genome': {
        get: createOperation('Get active genome metadata', {
          action: 'genome_read',
          riskClass: 'READ',
          requiresGenome: true
        }, {
          tags: ['Genome'],
          responses: {
            '200': {
              description: 'Genome metadata',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GenomeMetadata' }
                }
              }
            },
            '503': {
              description: 'Genome not loaded',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GovernanceError' }
                }
              }
            }
          }
        })
      },

      // Jobs
      '/jobs/run': {
        post: createOperation('Run a job', {
          action: 'job_run',
          riskClass: 'WRITE',
          requiresGenome: true
        }, {
          tags: ['Jobs'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/JobRunRequest' }
              }
            }
          },
          responses: {
            '200': {
              description: 'Job result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/JobResult' }
                }
              }
            },
            '403': {
              description: 'Action denied by governance',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GovernanceError' }
                }
              }
            }
          }
        })
      },

      '/jobs/status': {
        get: createOperation('Get job status', {
          action: 'job_status',
          riskClass: 'READ'
        }, {
          tags: ['Jobs'],
          parameters: [
            {
              name: 'job_id',
              in: 'query',
              description: 'Specific job ID (optional - omit to list all)',
              schema: { type: 'string' }
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum jobs to return',
              schema: { type: 'integer', default: 100 }
            }
          ],
          responses: {
            '200': { description: 'Job status or list' },
            '404': { description: 'Job not found' }
          }
        })
      },

      '/jobs/resume': {
        post: createOperation('Resume a suspended job', {
          action: 'job_resume',
          riskClass: 'WRITE'
        }, {
          tags: ['Jobs'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    job_id: { type: 'string' }
                  },
                  required: ['job_id']
                }
              }
            }
          },
          responses: {
            '200': { description: 'Job resumed' },
            '404': { description: 'Job not found' }
          }
        })
      },

      '/jobs/logs': {
        get: createOperation('Get job logs/receipts', {
          action: 'job_logs',
          riskClass: 'READ'
        }, {
          tags: ['Jobs'],
          parameters: [
            {
              name: 'job_id',
              in: 'query',
              required: true,
              schema: { type: 'string' }
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer' }
            }
          ],
          responses: {
            '200': { description: 'Job receipts' },
            '400': { description: 'Missing job_id' }
          }
        })
      },

      // Memory - Read operations
      '/memory/nodes/{id}': {
        get: createOperation('Get node by ID', {
          action: 'memory_read_node',
          riskClass: 'READ'
        }, {
          tags: ['Memory'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Node found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Node' }
                }
              }
            },
            '404': { description: 'Node not found' }
          }
        }),
        post: createOperation('Update node by ID', {
          action: 'memory_update_node',
          riskClass: 'WRITE',
          requiresIdempotency: true
        }, {
          tags: ['Memory'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateNodeRequest' }
              }
            }
          },
          responses: {
            '200': {
              description: 'Node updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/NodeUpdateResponse' }
                }
              }
            },
            '404': { description: 'Node not found' },
            '409': { description: 'Idempotency conflict' }
          }
        })
      },

      '/memory/nodes/{id}/edges': {
        get: createOperation('Get edges for node', {
          action: 'memory_read_edges',
          riskClass: 'READ'
        }, {
          tags: ['Memory'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': { description: 'Node edges' },
            '404': { description: 'Node not found' }
          }
        })
      },

      '/memory/nodes/{id}/hyperedges': {
        get: createOperation('Get hyperedges for node', {
          action: 'memory_read_hyperedges',
          riskClass: 'READ'
        }, {
          tags: ['Memory'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': { description: 'Node hyperedges' },
            '404': { description: 'Node not found' }
          }
        })
      },

      '/memory/edges/{id}': {
        get: createOperation('Get edge by ID', {
          action: 'memory_read_edge',
          riskClass: 'READ'
        }, {
          tags: ['Memory'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': { description: 'Edge found' },
            '404': { description: 'Edge not found' }
          }
        })
      },

      '/memory/hyperedges/{id}': {
        get: createOperation('Get hyperedge by ID', {
          action: 'memory_read_hyperedge',
          riskClass: 'READ'
        }, {
          tags: ['Memory'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': { description: 'Hyperedge found' },
            '404': { description: 'Hyperedge not found' }
          }
        })
      },

      '/memory/search': {
        get: createOperation('Search nodes', {
          action: 'memory_search',
          riskClass: 'READ'
        }, {
          tags: ['Memory'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' }
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10, maximum: 100 }
            }
          ],
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchResponse' }
                }
              }
            },
            '400': { description: 'Invalid query' }
          }
        })
      },

      // Memory - Write operations
      '/memory/nodes': {
        post: createOperation('Create a new node', {
          action: 'memory_create_node',
          riskClass: 'WRITE',
          requiresIdempotency: true
        }, {
          tags: ['Memory'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateNodeRequest' }
              }
            }
          },
          responses: {
            '201': {
              description: 'Node created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateNodeResponse' }
                }
              }
            },
            '409': { description: 'Node already exists with different payload' }
          }
        })
      },

      '/memory/edges': {
        post: createOperation('Create a new edge', {
          action: 'memory_create_edge',
          riskClass: 'WRITE',
          requiresIdempotency: true
        }, {
          tags: ['Memory'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateEdgeRequest' }
              }
            }
          },
          responses: {
            '201': { description: 'Edge created' },
            '404': { description: 'Source or target node not found' }
          }
        })
      },

      '/memory/hyperedges': {
        post: createOperation('Create a new hyperedge', {
          action: 'memory_create_hyperedge',
          riskClass: 'WRITE',
          requiresIdempotency: true
        }, {
          tags: ['Memory'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateHyperedgeRequest' }
              }
            }
          },
          responses: {
            '201': { description: 'Hyperedge created' },
            '404': { description: 'One or more nodes not found' }
          }
        })
      },

      // OI Interpretation
      '/oi/interpret': {
        post: createOperation('Interpret text using memory context', {
          action: 'oi_interpret',
          riskClass: 'READ',
          requiresGenome: true
        }, {
          tags: ['OI'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/InterpretRequest' }
              }
            }
          },
          responses: {
            '200': {
              description: 'Interpretation result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/InterpretResponse' }
                }
              }
            },
            '400': { description: 'Invalid request' },
            '503': { description: 'Interpreter not available' }
          }
        })
      }
    },
    components: {
      schemas: {
        GovernanceError: {
          type: 'object',
          description: 'Standard governance denial response',
          properties: {
            reason_code: {
              type: 'string',
              description: 'Stable error code for programmatic handling'
            },
            message: {
              type: 'string',
              description: 'Human-readable error message'
            },
            details: {
              type: 'object',
              description: 'Additional context'
            }
          },
          required: ['reason_code', 'message']
        },

        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'unhealthy'] },
            bootStatus: { type: 'string', enum: ['booting', 'ready', 'failed'] },
            governance: {
              type: 'object',
              properties: {
                treaty: {
                  type: 'object',
                  properties: {
                    version: { type: 'string' },
                    authority: { type: 'string' }
                  }
                },
                genome: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    version: { type: 'string' },
                    genome_id: { type: 'string' },
                    initialized: { type: 'boolean' },
                    verified: { type: 'boolean' },
                    manifestVerified: { type: 'boolean' }
                  }
                }
              }
            }
          }
        },

        GenomeMetadata: {
          type: 'object',
          properties: {
            genome_id: { type: 'string' },
            name: { type: 'string' },
            version: { type: 'string' },
            parents: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string' },
            invariants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  severity: { type: 'string' },
                  testable_claim: { type: 'string' }
                }
              }
            },
            capabilities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  cap_id: { type: 'string' },
                  risk_class: { type: 'string' },
                  allow_count: { type: 'integer' },
                  deny_count: { type: 'integer' }
                }
              }
            }
          }
        },

        Node: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            data: { type: 'object' },
            metadata: { type: 'object' }
          },
          required: ['id', 'type', 'data']
        },

        CreateNodeRequest: {
          type: 'object',
          properties: {
            idempotency_key: { type: 'string', description: 'Required for write operations' },
            id: { type: 'string', description: 'Optional - generated if not provided' },
            type: { type: 'string' },
            data: { type: 'object' },
            metadata: { type: 'object' }
          },
          required: ['idempotency_key', 'type']
        },

        CreateNodeResponse: {
          type: 'object',
          properties: {
            node: { $ref: '#/components/schemas/Node' },
            created: { type: 'boolean' },
            receipt: { $ref: '#/components/schemas/Receipt' }
          }
        },

        UpdateNodeRequest: {
          type: 'object',
          properties: {
            idempotency_key: { type: 'string' },
            type: { type: 'string' },
            data: { type: 'object' },
            metadata: { type: 'object' }
          },
          required: ['idempotency_key']
        },

        NodeUpdateResponse: {
          type: 'object',
          properties: {
            node: { $ref: '#/components/schemas/Node' },
            updated: { type: 'boolean' },
            receipt: { $ref: '#/components/schemas/Receipt' }
          }
        },

        CreateEdgeRequest: {
          type: 'object',
          properties: {
            idempotency_key: { type: 'string' },
            from: { type: 'string', description: 'Source node ID' },
            to: { type: 'string', description: 'Target node ID' },
            type: { type: 'string' },
            metadata: { type: 'object' }
          },
          required: ['idempotency_key', 'from', 'to', 'type']
        },

        CreateHyperedgeRequest: {
          type: 'object',
          properties: {
            idempotency_key: { type: 'string' },
            id: { type: 'string' },
            nodes: { type: 'array', items: { type: 'string' } },
            type: { type: 'string' },
            metadata: { type: 'object' }
          },
          required: ['idempotency_key', 'nodes', 'type']
        },

        SearchResponse: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'integer' },
            count: { type: 'integer' },
            results: {
              type: 'array',
              items: { $ref: '#/components/schemas/Node' }
            }
          }
        },

        InterpretRequest: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100 }
          },
          required: ['text']
        },

        InterpretResponse: {
          type: 'object',
          properties: {
            interpretation: { type: 'string' },
            confidence: { type: 'number' },
            citations: {
              type: 'array',
              items: { $ref: '#/components/schemas/Citation' }
            },
            genome: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                version: { type: 'string' }
              }
            }
          }
        },

        Citation: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            why: { type: 'string' }
          }
        },

        JobRunRequest: {
          type: 'object',
          properties: {
            jobType: { type: 'string' },
            inputs: { type: 'object' },
            policyId: { type: 'string' },
            jobId: { type: 'string' }
          },
          required: ['jobType']
        },

        JobResult: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
            status: { type: 'string', enum: ['running', 'completed', 'failed', 'suspended'] },
            outputs: { type: 'object' },
            genome_id: { type: 'string' },
            genome_version: { type: 'string' },
            started_at: { type: 'string' },
            completed_at: { type: 'string' }
          }
        },

        Receipt: {
          type: 'object',
          description: 'Audit trail receipt for governance tracking',
          properties: {
            timestamp: { type: 'string' },
            job_id: { type: 'string' },
            stage: { type: 'string' },
            action: { type: 'string' },
            decision: { type: 'string', enum: ['ALLOW', 'DENY'] },
            policy_id: { type: 'string' },
            genome_id: { type: 'string' },
            genome_version: { type: 'string' },
            notes: { type: 'string' }
          }
        }
      }
    }
  };
}
