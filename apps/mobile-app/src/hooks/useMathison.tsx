/**
 * Mathison React Hook - Connect to Mathison Server
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface HealthResponse {
  status: string;
  bootStatus: string;
  governance?: {
    treaty?: { version: string; authority: string };
    genome?: { name: string; version: string; genome_id: string; initialized: boolean };
  };
  storage?: { backend: string; status: string };
  memory?: { nodeCount: number; edgeCount: number };
}

interface MemoryNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface Job {
  job_id: string;
  status: 'running' | 'completed' | 'failed' | 'suspended';
  type: string;
  created_at: string;
  genome_id?: string;
}

interface MathisonContextValue {
  health: HealthResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  searchNodes: (query: string, limit?: number) => Promise<MemoryNode[]>;
  getJobs: () => Promise<Job[]>;
  serverUrl: string;
  setServerUrl: (url: string) => void;
}

const MathisonContext = createContext<MathisonContextValue | null>(null);

const DEFAULT_SERVER_URL = 'http://localhost:3000';

export function MathisonProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setHealth(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to server';
      setError(message);
      setHealth(null);
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl]);

  const searchNodes = useCallback(async (query: string, limit = 10): Promise<MemoryNode[]> => {
    try {
      const response = await fetch(
        `${serverUrl}/memory/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.results || [];
    } catch {
      return [];
    }
  }, [serverUrl]);

  const getJobs = useCallback(async (): Promise<Job[]> => {
    try {
      const response = await fetch(`${serverUrl}/jobs/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, [serverUrl]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const value: MathisonContextValue = {
    health,
    isLoading,
    error,
    refresh: fetchHealth,
    searchNodes,
    getJobs,
    serverUrl,
    setServerUrl,
  };

  return (
    <MathisonContext.Provider value={value}>
      {children}
    </MathisonContext.Provider>
  );
}

export function useMathison(): MathisonContextValue {
  const context = useContext(MathisonContext);
  if (!context) {
    throw new Error('useMathison must be used within a MathisonProvider');
  }
  return context;
}
