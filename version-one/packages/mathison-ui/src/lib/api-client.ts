import type * as API from '../types/api';

/**
 * Type-safe API client for Mathison kernel-mac
 *
 * NOTE: This client targets kernel-mac (port 3001), NOT mathison-server.
 * These endpoints (beams, chat, models, identity) are kernel-mac specific.
 *
 * For the canonical product API (jobs, memory, governance), use
 * mathison-server (port 3000) via the SDK generator.
 *
 * All methods return properly typed responses with error handling.
 */

const API_BASE = '/api';

class APIClient {
  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error: API.APIError = await response.json().catch(() => ({
        error: response.statusText,
      }));
      throw new Error(error.error);
    }

    return response.json();
  }

  // System
  async getStatus(): Promise<API.SystemStatusDTO> {
    return this.request('/status');
  }

  async getStats(): Promise<API.BeamStoreStatsDTO> {
    return this.request('/stats');
  }

  // Identity
  async getIdentity(): Promise<API.IdentityStatusDTO> {
    return this.request('/identity');
  }

  // Chat
  async sendMessage(content: string): Promise<API.SendMessageResponse> {
    return this.request('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ content } as API.SendMessageRequest),
    });
  }

  async getHistory(): Promise<{ messages: API.ChatMessage[] }> {
    return this.request('/chat/history');
  }

  // Beams
  async queryBeams(query: API.BeamQueryRequest): Promise<API.BeamQueryResponse> {
    const params = new URLSearchParams();
    if (query.text) params.set('text', query.text);
    if (query.tags) params.set('tags', query.tags.join(','));
    if (query.kinds) params.set('kinds', query.kinds.join(','));
    if (query.include_dead !== undefined) params.set('include_dead', String(query.include_dead));
    if (query.limit) params.set('limit', String(query.limit));

    return this.request(`/beams?${params}`);
  }

  async getBeam(id: string): Promise<API.BeamDTO> {
    return this.request(`/beams/${id}`);
  }

  async createBeam(data: API.CreateBeamRequest): Promise<API.BeamDTO> {
    return this.request('/beams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBeam(id: string, data: API.UpdateBeamRequest): Promise<API.BeamDTO> {
    return this.request(`/beams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async pinBeam(id: string): Promise<API.BeamDTO> {
    return this.request(`/beams/${id}/pin`, { method: 'POST' });
  }

  async unpinBeam(id: string): Promise<API.BeamDTO> {
    return this.request(`/beams/${id}/pin`, { method: 'DELETE' });
  }

  async retireBeam(id: string): Promise<API.BeamDTO> {
    return this.request(`/beams/${id}/retire`, { method: 'POST' });
  }

  async tombstoneBeam(id: string, data: API.TombstoneBeamRequest): Promise<API.BeamDTO> {
    return this.request(`/beams/${id}/tombstone`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Models
  async listModels(): Promise<API.ModelListResponse> {
    return this.request('/models');
  }

  async installModel(): Promise<{ path: string }> {
    return this.request('/models/install', { method: 'POST' });
  }

  async activateModel(path: string): Promise<{ path: string }> {
    return this.request('/models/activate', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  // CDI
  async getCDIStats(): Promise<API.CDIStatsDTO> {
    return this.request('/cdi/stats');
  }

  async getPendingApprovals(): Promise<{ approvals: API.ApprovalRequestDTO[] }> {
    return this.request('/cdi/approvals');
  }

  async approveRequest(id: string, approved: boolean): Promise<API.ApprovalResponse> {
    return this.request(`/cdi/approvals/${id}`, {
      method: 'POST',
      body: JSON.stringify({ approved }),
    });
  }
}

export const apiClient = new APIClient();
