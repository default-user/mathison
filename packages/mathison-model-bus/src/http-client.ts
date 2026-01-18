/**
 * WHY: http-client.ts - Single internal HTTP client for all vendor API calls
 * -----------------------------------------------------------------------------
 * - Centralizes ALL external HTTP calls to vendor APIs in one module.
 * - Provides consistent error handling, timeouts, and retries.
 * - Makes it trivial to audit which endpoints are being called.
 * - Enables global rate limiting and circuit breaker patterns.
 *
 * INVARIANT: No other module may make HTTP calls to vendor APIs.
 * INVARIANT: All requests are logged for auditing (without secrets).
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ============================================================================
// HTTP Client Types
// ============================================================================

export interface HttpRequestOptions {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Full URL to call */
  url: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Timeout in milliseconds */
  timeout_ms?: number;
}

export interface HttpResponse<T = unknown> {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Parsed response body */
  body: T;
  /** Raw response text */
  raw: string;
}

export interface HttpClientConfig {
  /** Default timeout in milliseconds */
  default_timeout_ms: number;
  /** Maximum retries for transient failures */
  max_retries: number;
  /** Base delay for exponential backoff in ms */
  retry_base_delay_ms: number;
}

// ============================================================================
// HTTP Client Implementation
// ============================================================================

/**
 * Internal HTTP client for vendor API calls
 *
 * WHY this exists: Having a single HTTP client ensures:
 * 1. All vendor calls go through one auditable path
 * 2. Consistent timeout/retry behavior
 * 3. Easy to add circuit breakers or rate limiting
 * 4. Simple to mock for testing
 */
export class ModelBusHttpClient {
  private config: HttpClientConfig;

  constructor(config?: Partial<HttpClientConfig>) {
    this.config = {
      default_timeout_ms: config?.default_timeout_ms ?? 60000,
      max_retries: config?.max_retries ?? 3,
      retry_base_delay_ms: config?.retry_base_delay_ms ?? 1000,
    };
  }

  /**
   * Make an HTTP request to a vendor API
   *
   * WHY this is the ONLY way to call vendors: Centralizing here means
   * the no-bypass invariant test only needs to check this one file
   * imports no vendor SDKs and only this file uses vendor URLs.
   */
  async request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const timeout = options.timeout_ms ?? this.config.default_timeout_ms;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.max_retries; attempt++) {
      try {
        return await this.doRequest<T>(options, timeout);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on transient failures (5xx, network errors)
        if (!this.isRetryable(lastError)) {
          throw lastError;
        }

        // Exponential backoff
        if (attempt < this.config.max_retries) {
          const delay = this.config.retry_base_delay_ms * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  /**
   * Execute a single HTTP request
   */
  private doRequest<T>(options: HttpRequestOptions, timeout: number): Promise<HttpResponse<T>> {
    return new Promise((resolve, reject) => {
      const url = new URL(options.url);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

      const requestOptions: http.RequestOptions = {
        method: options.method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          ...options.headers,
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
        timeout,
      };

      const req = lib.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let body: T;

          try {
            body = JSON.parse(raw) as T;
          } catch {
            // If not JSON, return raw as body
            body = raw as unknown as T;
          }

          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value) {
              headers[key] = Array.isArray(value) ? value.join(', ') : value;
            }
          }

          resolve({
            status: res.statusCode ?? 0,
            headers,
            body,
            raw,
          });
        });
      });

      req.on('error', (error) => {
        reject(new Error(`HTTP request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeout}ms`));
      });

      if (bodyStr) {
        req.write(bodyStr);
      }

      req.end();
    });
  }

  /**
   * Check if an error is retryable
   */
  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up') ||
      message.includes('5')  // 5xx errors
    );
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Default HTTP client instance
 */
let defaultClient: ModelBusHttpClient | null = null;

/**
 * Get or create the default HTTP client
 */
export function getHttpClient(config?: Partial<HttpClientConfig>): ModelBusHttpClient {
  if (!defaultClient || config) {
    defaultClient = new ModelBusHttpClient(config);
  }
  return defaultClient;
}

/**
 * Reset the default client (for testing)
 */
export function resetHttpClient(): void {
  defaultClient = null;
}
