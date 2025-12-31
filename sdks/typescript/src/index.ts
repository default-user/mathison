/**
 * Mathison TypeScript SDK
 * Client for Mathison API
 */

export interface SystemStatus {
  kernel_version: string;
  identity: any;
  beamstore: any;
  cdi: any;
  llama_server: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    intents_proposed?: number;
    intents_approved?: number;
    intents_denied?: number;
  };
}

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  message: ChatMessage;
  stream_id?: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  total: number;
  limit: number;
  offset: number;
}

export interface Beam {
  beam_id: string;
  kind: string;
  title: string;
  tags: string[];
  body: string;
  status: string;
  pinned: boolean;
  updated_at_ms: number;
}

export interface BeamQueryRequest {
  text?: string;
  tags?: string[];
  kinds?: string[];
  include_dead?: boolean;
  limit?: number;
}

export interface BeamQueryResponse {
  beams: Beam[];
  total: number;
}

export interface CreateBeamRequest {
  beam_id?: string;
  kind: string;
  title: string;
  tags: string[];
  body: string;
  pinned?: boolean;
}

export interface UpdateBeamRequest {
  title?: string;
  tags?: string[];
  body?: string;
}

export interface TombstoneBeamRequest {
  reason_code: string;
  approval_token?: string;
}

export interface MathisonClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
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
    body?: any,
    queryParams?: Record<string, any>
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    // Add query parameters
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
      headers['Authorization'] = `Bearer ${this.apiKey}`;
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
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /* ========== Health & Status ========== */

  async health(): Promise<{ status: string }> {
    return this.request('GET', '/health');
  }

  async getStatus(): Promise<SystemStatus> {
    return this.request('GET', '/api/status');
  }

  async getIdentity(): Promise<any> {
    return this.request('GET', '/api/identity');
  }

  /* ========== Chat ========== */

  async sendMessage(content: string): Promise<SendMessageResponse> {
    return this.request('POST', '/api/chat/send', { content });
  }

  async getChatHistory(limit?: number, offset?: number): Promise<ChatHistoryResponse> {
    return this.request('GET', '/api/chat/history', undefined, { limit, offset });
  }

  /* ========== Beams ========== */

  async queryBeams(query?: BeamQueryRequest): Promise<BeamQueryResponse> {
    return this.request('GET', '/api/beams', undefined, query);
  }

  async getBeam(beamId: string): Promise<Beam> {
    return this.request('GET', `/api/beams/${beamId}`);
  }

  async createBeam(beam: CreateBeamRequest): Promise<Beam> {
    return this.request('POST', '/api/beams', beam);
  }

  async updateBeam(beamId: string, update: UpdateBeamRequest): Promise<Beam> {
    return this.request('PATCH', `/api/beams/${beamId}`, update);
  }

  async pinBeam(beamId: string): Promise<{ success: boolean }> {
    return this.request('POST', `/api/beams/${beamId}/pin`);
  }

  async unpinBeam(beamId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/beams/${beamId}/pin`);
  }

  async retireBeam(beamId: string): Promise<{ success: boolean }> {
    return this.request('POST', `/api/beams/${beamId}/retire`);
  }

  async tombstoneBeam(beamId: string, request: TombstoneBeamRequest): Promise<any> {
    return this.request('POST', `/api/beams/${beamId}/tombstone`, request);
  }
}

export default MathisonClient;
