/**
 * OpenAPI 3.0 Specification for Mathison Server
 * Phase 4: Deterministic OpenAPI generation
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

export function generateOpenAPISpec(genomeVersion?: string): OpenAPISpec {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Mathison API',
      version: genomeVersion || '1.0.0',
      description: 'Governed memory graph + OI interpretation + job execution API'
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development' }
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Server health status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' }
                }
              }
            }
          }
        }
      },
      '/memory/nodes': {
        post: {
          summary: 'Create a new node',
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
            }
          }
        }
      },
      '/memory/nodes/{id}': {
        get: {
          summary: 'Get node by ID',
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
        }
      },
      '/memory/search': {
        get: {
          summary: 'Search nodes',
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
              schema: { type: 'integer', default: 10 }
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
            }
          }
        }
      },
      '/oi/interpret': {
        post: {
          summary: 'Interpret text using memory context',
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
            }
          }
        }
      },
      '/jobs/run': {
        post: {
          summary: 'Run a job',
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
            }
          }
        }
      },
      '/jobs/status': {
        get: {
          summary: 'Get job status',
          parameters: [
            {
              name: 'job_id',
              in: 'query',
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': { description: 'Job status' }
          }
        }
      }
    },
    components: {
      schemas: {
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            genome: {
              type: 'object',
              properties: {
                verified: { type: 'boolean' },
                name: { type: 'string' },
                version: { type: 'string' }
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
            idempotency_key: { type: 'string' },
            id: { type: 'string' },
            type: { type: 'string' },
            data: { type: 'object' }
          },
          required: ['idempotency_key', 'id', 'type', 'data']
        },
        CreateNodeResponse: {
          type: 'object',
          properties: {
            node: { $ref: '#/components/schemas/Node' },
            receipt: { $ref: '#/components/schemas/Receipt' }
          }
        },
        SearchResponse: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            nodes: {
              type: 'array',
              items: { $ref: '#/components/schemas/Node' }
            },
            total: { type: 'integer' }
          }
        },
        InterpretRequest: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            limit: { type: 'integer' }
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
            jobId: { type: 'string' }
          },
          required: ['jobType']
        },
        JobResult: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
            status: { type: 'string' },
            outputs: { type: 'object' },
            genome_id: { type: 'string' },
            genome_version: { type: 'string' }
          }
        },
        Receipt: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            genome_id: { type: 'string' },
            genome_version: { type: 'string' },
            timestamp: { type: 'integer' },
            content_hash: { type: 'string' },
            reason: { type: 'string' }
          }
        }
      }
    }
  };
}
