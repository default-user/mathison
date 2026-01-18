import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import * as crypto from 'crypto';
import { KernelState, bootKernel } from './kernel';
import { complete } from './llama';
import { getModelPath, listModels, installDefaultModel } from './model';
import { loadConfig, saveConfig } from './config';
import { getDeviceId } from './device';
import { SQLiteBeamStore, Beam, StoreBeamIntent, applyIntentGoverned } from 'mathison-storage';
import { BEAMSTORE_PATH } from './config';
import * as API from './api-types';

/**
 * Mathison HTTP + WebSocket Server
 *
 * Type-safe API for browser UI:
 * - HTTP endpoints for CRUD operations
 * - WebSocket for streaming chat + real-time updates
 * - Zod validation at all boundaries
 */

export type ServerConfig = {
  port: number;
  host: string;
  cors_origin: string;
};

/**
 * DEPRECATED: kernel-mac is legacy/dev tooling only.
 * The canonical product API is mathison-server (port 3000).
 * kernel-mac uses port 3001 to avoid conflicts.
 */
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3001,
  host: '0.0.0.0',
  cors_origin: '*',
};

export class MathisonServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private kernelState: KernelState | null = null;
  private activeStreams = new Map<string, { ws: WebSocket; buffer: string }>();
  private pendingApprovals = new Map<string, API.ApprovalRequestDTO>();
  private chatHistory: API.ChatMessage[] = [];
  private readonly CHAT_HISTORY_PATH = BEAMSTORE_PATH.replace('.db', '_chat_history.json');
  private readonly MAX_HISTORY_SIZE = 1000;

  constructor(private config: ServerConfig) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.loadChatHistory();
  }

  private setupMiddleware(): void {
    this.app.use(cors({ origin: this.config.cors_origin }));
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });

    // Error handler
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      console.error('[API ERROR]', err);
      const error: API.APIError = {
        error: err.message || 'Internal server error',
        code: err.code,
      };
      res.status(err.status || 500).json(error);
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // System status
    this.app.get('/api/status', this.handleGetStatus.bind(this));

    // Identity
    this.app.get('/api/identity', this.handleGetIdentity.bind(this));

    // Chat
    this.app.post('/api/chat/send', this.handleSendMessage.bind(this));
    this.app.get('/api/chat/history', this.handleGetHistory.bind(this));

    // Beams
    this.app.get('/api/beams', this.handleQueryBeams.bind(this));
    this.app.get('/api/beams/:id', this.handleGetBeam.bind(this));
    this.app.post('/api/beams', this.handleCreateBeam.bind(this));
    this.app.patch('/api/beams/:id', this.handleUpdateBeam.bind(this));
    this.app.post('/api/beams/:id/pin', this.handlePinBeam.bind(this));
    this.app.delete('/api/beams/:id/pin', this.handleUnpinBeam.bind(this));
    this.app.post('/api/beams/:id/retire', this.handleRetireBeam.bind(this));
    this.app.post('/api/beams/:id/tombstone', this.handleTombstoneBeam.bind(this));

    // Models
    this.app.get('/api/models', this.handleListModels.bind(this));
    this.app.post('/api/models/install', this.handleInstallModel.bind(this));
    this.app.post('/api/models/activate', this.handleActivateModel.bind(this));

    // CDI
    this.app.get('/api/cdi/stats', this.handleGetCDIStats.bind(this));
    this.app.get('/api/cdi/approvals', this.handleGetPendingApprovals.bind(this));
    this.app.post('/api/cdi/approvals/:id', this.handleApproveRequest.bind(this));

    // Stats
    this.app.get('/api/stats', this.handleGetStats.bind(this));
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WS] Client connected');

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWSMessage(ws, message);
        } catch (e: any) {
          this.sendWSError(ws, e.message);
        }
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        // Clean up any active streams for this ws
        for (const [streamId, stream] of this.activeStreams.entries()) {
          if (stream.ws === ws) {
            this.activeStreams.delete(streamId);
          }
        }
      });
    });
  }

  private async handleWSMessage(ws: WebSocket, message: any): Promise<void> {
    // WebSocket currently only used for receiving streamed responses
    // Client-to-server messages via HTTP POST /api/chat/send
    console.log('[WS] Received message:', message);
  }

  private sendWS(ws: WebSocket, message: API.WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendWSError(ws: WebSocket, error: string, code?: string): void {
    const msg: API.WSMessage = {
      type: 'error',
      error,
      code,
    };
    this.sendWS(ws, msg);
  }

  private broadcastWS(message: API.WSMessage): void {
    this.wss.clients.forEach((client) => {
      this.sendWS(client, message);
    });
  }

  /* ========== Chat History Persistence ========== */

  private loadChatHistory(): void {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.CHAT_HISTORY_PATH)) {
        const data = fs.readFileSync(this.CHAT_HISTORY_PATH, 'utf-8');
        const parsed = JSON.parse(data);

        // Validate each message
        this.chatHistory = parsed.filter((msg: any) => {
          const result = API.ChatMessageSchema.safeParse(msg);
          return result.success;
        });

        console.log(`[CHAT] Loaded ${this.chatHistory.length} messages from history`);
      }
    } catch (e: any) {
      console.error('[CHAT] Failed to load chat history:', e.message);
      this.chatHistory = [];
    }
  }

  private saveChatHistory(): void {
    try {
      const fs = require('fs');
      const path = require('path');

      // Ensure directory exists
      const dir = path.dirname(this.CHAT_HISTORY_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Keep only last MAX_HISTORY_SIZE messages
      const toSave = this.chatHistory.slice(-this.MAX_HISTORY_SIZE);

      fs.writeFileSync(this.CHAT_HISTORY_PATH, JSON.stringify(toSave, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('[CHAT] Failed to save chat history:', e.message);
    }
  }

  private addToChatHistory(message: API.ChatMessage): void {
    this.chatHistory.push(message);

    // Trim if exceeds max size
    if (this.chatHistory.length > this.MAX_HISTORY_SIZE) {
      this.chatHistory = this.chatHistory.slice(-this.MAX_HISTORY_SIZE);
    }

    // Persist to disk asynchronously
    setImmediate(() => this.saveChatHistory());
  }

  /* ========== HTTP Handlers ========== */

  private async handleGetStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const cfg = loadConfig();
      const status: API.SystemStatusDTO = {
        kernel_version: '1.0.0',
        identity: {
          mode: this.kernelState.bootResult.mode,
          selfFrame: this.kernelState.bootResult.selfFrame ? {
            selfFrame: this.kernelState.bootResult.selfFrame.selfFrame,
            hash: this.kernelState.bootResult.selfFrame.hash,
            pinned_count: (await this.kernelState.store.listPinnedActive()).length,
            last_updated_ms: Date.now(),
          } : undefined,
          device_id: this.kernelState.deviceId,
          device_verified: getDeviceId() === this.kernelState.deviceId,
        },
        beamstore: await this.kernelState.store.stats(),
        cdi: {
          tombstones_24h: 0, // CDI doesn't expose this yet
          soft_limit: 20,
          hard_limit: 100,
          incident_status: {
            mode: this.kernelState.cdi.getIncidentStatus().mode,
            event: this.kernelState.cdi.getIncidentStatus().event ?? undefined,
          },
        },
        llama_server: {
          running: true, // Assume running if kernel booted
          port: this.kernelState.serverPort,
          model_loaded: true,
        },
      };

      res.json(status);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleGetIdentity(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const identity: API.IdentityStatusDTO = {
        mode: this.kernelState.bootResult.mode,
        selfFrame: this.kernelState.bootResult.selfFrame ? {
          selfFrame: this.kernelState.bootResult.selfFrame.selfFrame,
          hash: this.kernelState.bootResult.selfFrame.hash,
          pinned_count: (await this.kernelState.store.listPinnedActive()).length,
          last_updated_ms: Date.now(),
        } : undefined,
        device_id: this.kernelState.deviceId,
        device_verified: getDeviceId() === this.kernelState.deviceId,
      };

      res.json(identity);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleSendMessage(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const reqData = API.validateRequest(API.SendMessageRequestSchema, req.body);

      const messageId = crypto.randomUUID();
      const streamId = crypto.randomUUID();

      // Add user message to chat history
      const userMessage: API.ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: reqData.content,
        timestamp: Date.now(),
      };
      this.addToChatHistory(userMessage);

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(this.kernelState);
      const fullPrompt = `${systemPrompt}\n\nUser: ${reqData.content}\n\nAssistant:`;

      // Start streaming response via WebSocket
      const broadcastStream = (msg: API.WSMessage) => {
        this.broadcastWS(msg);
      };

      broadcastStream({
        type: 'stream_start',
        stream_id: streamId,
        message_id: messageId,
      });

      // Query model
      const response = await complete(this.kernelState.serverPort, {
        prompt: fullPrompt,
        max_tokens: 1024,
        temperature: 0.7,
        stop: ['User:', '\n\n'],
      });

      // Stream chunks (simulate for now; real streaming would use llama-server stream mode)
      const chunks = this.chunkText(response.content, 20);
      for (const chunk of chunks) {
        broadcastStream({
          type: 'stream_chunk',
          stream_id: streamId,
          content: chunk,
        });
        await this.sleep(50); // Simulate streaming delay
      }

      // Parse intents
      const intents = this.parseIntents(response.content);
      let intentsApproved = 0;
      let intentsDenied = 0;

      for (const intent of intents) {
        const result = await this.applyIntent(intent);
        if (result.approved) {
          intentsApproved++;
          broadcastStream({
            type: 'intent_approved',
            intent_id: crypto.randomUUID(),
            beam_id: intent.beam.beam_id,
          });
        } else {
          intentsDenied++;
          broadcastStream({
            type: 'intent_denied',
            intent_id: crypto.randomUUID(),
            reason_code: result.reason_code || 'UNKNOWN',
            human_message: result.human_message,
          });
        }
      }

      const assistantMessage: API.ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        metadata: {
          intents_proposed: intents.length,
          intents_approved: intentsApproved,
          intents_denied: intentsDenied,
        },
      };

      broadcastStream({
        type: 'stream_end',
        stream_id: streamId,
        message: assistantMessage,
      });

      // Add assistant message to chat history
      this.addToChatHistory(assistantMessage);

      res.json({
        message: assistantMessage,
        stream_id: streamId,
      });
    } catch (e: any) {
      console.error('[CHAT ERROR]', e);
      res.status(500).json({ error: e.message });
    }
  }

  private async handleGetHistory(req: Request, res: Response): Promise<void> {
    try {
      // Parse optional query parameters for pagination
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      // Return messages in reverse chronological order (newest first), with pagination
      const messages = this.chatHistory
        .slice()
        .reverse()
        .slice(offset, offset + limit);

      res.json({
        messages,
        total: this.chatHistory.length,
        limit,
        offset,
      });
    } catch (e: any) {
      console.error('[CHAT HISTORY ERROR]', e);
      res.status(500).json({ error: e.message });
    }
  }

  private async handleQueryBeams(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const query = API.safeValidate(API.BeamQueryRequestSchema, req.query);
      if (!query.success) {
        res.status(400).json({ error: query.error });
        return;
      }

      const beams = await this.kernelState.store.query(query.data);
      const dtos: API.BeamDTO[] = beams.map(this.beamToDTO);

      res.json({ beams: dtos, total: dtos.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleGetBeam(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const beam = await this.kernelState.store.get(req.params.id);
      if (!beam) {
        res.status(404).json({ error: 'Beam not found' });
        return;
      }

      res.json(this.beamToDTO(beam));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleCreateBeam(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const data = API.validateRequest(API.CreateBeamRequestSchema, req.body);

      const beam: Beam = {
        beam_id: data.beam_id || crypto.randomUUID(),
        kind: data.kind,
        title: data.title,
        tags: data.tags,
        body: data.body,
        status: 'ACTIVE',
        pinned: data.pinned || false,
        updated_at_ms: Date.now(),
      };

      await this.kernelState.store.put(beam);

      res.status(201).json(this.beamToDTO(beam));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleUpdateBeam(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const data = API.validateRequest(API.UpdateBeamRequestSchema, req.body);
      const beam = await this.kernelState.store.get(req.params.id);

      if (!beam) {
        res.status(404).json({ error: 'Beam not found' });
        return;
      }

      if (data.title !== undefined) beam.title = data.title;
      if (data.tags !== undefined) beam.tags = data.tags;
      if (data.body !== undefined) beam.body = data.body;
      beam.updated_at_ms = Date.now();

      await this.kernelState.store.put(beam);

      res.json(this.beamToDTO(beam));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handlePinBeam(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      await this.kernelState.store.pin(req.params.id);
      const beam = await this.kernelState.store.get(req.params.id);

      if (!beam) {
        res.status(404).json({ error: 'Beam not found' });
        return;
      }

      res.json(this.beamToDTO(beam));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleUnpinBeam(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      await this.kernelState.store.unpin(req.params.id);
      const beam = await this.kernelState.store.get(req.params.id);

      if (!beam) {
        res.status(404).json({ error: 'Beam not found' });
        return;
      }

      res.json(this.beamToDTO(beam));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleRetireBeam(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      await this.kernelState.store.retire(req.params.id, { reason_code: 'user_request' });
      const beam = await this.kernelState.store.get(req.params.id);

      if (!beam) {
        res.status(404).json({ error: 'Beam not found' });
        return;
      }

      res.json(this.beamToDTO(beam));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleTombstoneBeam(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const data = API.validateRequest(API.TombstoneBeamRequestSchema, req.body);
      const beam = await this.kernelState.store.get(req.params.id);

      if (!beam) {
        res.status(404).json({ error: 'Beam not found' });
        return;
      }

      const intent: StoreBeamIntent = {
        op: 'TOMBSTONE',
        beam: { beam_id: req.params.id },
        reason_code: data.reason_code,
        approval_ref: data.approval_token ? { method: 'human_confirm', ref: data.approval_token } : undefined,
      };

      const result = await applyIntentGoverned({
        store: this.kernelState.store,
        cdi: this.kernelState.cdi,
        intent,
      });

      if (!result.ok) {
        res.status(403).json({
          error: result.human_message || 'Tombstone denied',
          code: result.reason_code,
        });
        return;
      }

      const updated = await this.kernelState.store.get(req.params.id);
      if (!updated) {
        res.status(404).json({ error: 'Beam not found' });
        return;
      }

      res.json(this.beamToDTO(updated));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleListModels(req: Request, res: Response): Promise<void> {
    try {
      const models = listModels();
      const cfg = loadConfig();

      const dtos: API.ModelInfoDTO[] = models.map((m) => ({
        name: m.name,
        path: m.path,
        size: m.size,
        is_active: cfg.model_path === m.path,
      }));

      res.json({ models: dtos, active_model: cfg.model_path });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleInstallModel(req: Request, res: Response): Promise<void> {
    try {
      // Stream progress to all connected WebSocket clients
      const onProgress = (downloaded: number, total: number) => {
        const percent = total > 0 ? ((downloaded / total) * 100).toFixed(1) : '0.0';
        const mb_downloaded = (downloaded / 1e6).toFixed(1);
        const mb_total = (total / 1e6).toFixed(1);

        const progressMessage = {
          type: 'model_install_progress',
          downloaded,
          total,
          percent: parseFloat(percent),
          message: `Downloading: ${mb_downloaded}MB / ${mb_total}MB (${percent}%)`,
        };

        // Broadcast to all connected WebSocket clients
        this.wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(progressMessage));
          }
        });
      };

      const modelPath = await installDefaultModel(onProgress);
      const cfg = loadConfig();
      cfg.model_path = modelPath;
      saveConfig(cfg);

      // Send completion message via WebSocket
      const completeMessage = {
        type: 'model_install_complete',
        path: modelPath,
      };
      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(completeMessage));
        }
      });

      res.json({ path: modelPath });
    } catch (e: any) {
      // Send error message via WebSocket
      const errorMessage = {
        type: 'model_install_error',
        error: e.message,
      };
      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(errorMessage));
        }
      });

      res.status(500).json({ error: e.message });
    }
  }

  private async handleActivateModel(req: Request, res: Response): Promise<void> {
    try {
      const { path } = req.body;
      const resolvedPath = getModelPath(path);

      if (!resolvedPath) {
        res.status(404).json({ error: 'Model not found' });
        return;
      }

      const cfg = loadConfig();
      cfg.model_path = resolvedPath;
      saveConfig(cfg);

      res.json({ path: resolvedPath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleGetCDIStats(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const incidentStatus = this.kernelState.cdi.getIncidentStatus();
      const stats: API.CDIStatsDTO = {
        tombstones_24h: 0, // CDI doesn't expose this yet
        soft_limit: 20,
        hard_limit: 100,
        incident_status: {
          mode: incidentStatus.mode,
          event: incidentStatus.event ?? undefined,
        },
      };

      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleGetPendingApprovals(req: Request, res: Response): Promise<void> {
    try {
      const approvals = Array.from(this.pendingApprovals.values());
      res.json({ approvals });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleApproveRequest(req: Request, res: Response): Promise<void> {
    try {
      const { approved } = req.body;
      const request = this.pendingApprovals.get(req.params.id);

      if (!request) {
        res.status(404).json({ error: 'Approval request not found' });
        return;
      }

      if (approved) {
        const token = crypto.randomUUID();
        this.pendingApprovals.delete(req.params.id);
        res.json({ approved: true, approval_token: token });
      } else {
        this.pendingApprovals.delete(req.params.id);
        res.json({ approved: false });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async handleGetStats(req: Request, res: Response): Promise<void> {
    try {
      if (!this.kernelState) {
        throw new Error('Kernel not initialized');
      }

      const stats = await this.kernelState.store.stats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /* ========== Helpers ========== */

  private beamToDTO(beam: Beam): API.BeamDTO {
    return {
      beam_id: beam.beam_id,
      kind: beam.kind,
      title: beam.title,
      tags: beam.tags,
      body: beam.body,
      status: beam.status,
      pinned: beam.pinned,
      updated_at_ms: beam.updated_at_ms,
    };
  }

  private buildSystemPrompt(state: KernelState): string {
    const selfFrame = state.bootResult.selfFrame?.selfFrame || '';
    const hash = state.bootResult.selfFrame?.hash || '';

    return `You are Mathison, an OI system. Your identity is defined by your SelfFrame (hash: ${hash.slice(0, 16)}...).

${selfFrame}

You cannot write to BeamStore directly. To store or modify memory, output a JSON block with:
STORE_BEAM_INTENT {
  "op": "PUT" | "RETIRE" | "PIN" | "UNPIN" | "TOMBSTONE" | "PURGE",
  "beam": { "beam_id": "...", "kind": "...", "title": "...", "tags": [...], "body": "..." },
  "reason_code": "..."
}

The kernel will apply CDI governance before committing.`;
  }

  private parseIntents(text: string): StoreBeamIntent[] {
    const intents: StoreBeamIntent[] = [];
    const regex = /STORE_BEAM_INTENT\s*(\{[^}]+\})/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      try {
        const intent = JSON.parse(match[1]) as StoreBeamIntent;
        intents.push(intent);
      } catch (e) {
        console.warn('[INTENT PARSE] Failed:', match[1]);
      }
    }

    return intents;
  }

  private async applyIntent(intent: StoreBeamIntent): Promise<{ approved: boolean; reason_code?: string; human_message?: string }> {
    if (!this.kernelState) {
      return { approved: false, reason_code: 'KERNEL_NOT_INITIALIZED' };
    }

    const result = await applyIntentGoverned({
      store: this.kernelState.store,
      cdi: this.kernelState.cdi,
      intent,
    });

    if (result.ok) {
      return { approved: true };
    } else {
      return {
        approved: false,
        reason_code: result.reason_code,
        human_message: result.human_message,
      };
    }
  }

  private chunkText(text: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ========== Lifecycle ========== */

  async start(): Promise<void> {
    console.log('[SERVER] Booting kernel...');
    this.kernelState = await bootKernel();

    console.log(`[SERVER] Starting HTTP server on ${this.config.host}:${this.config.port}...`);
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        console.log(`[SERVER] Listening on http://${this.config.host}:${this.config.port}`);
        console.log(`[SERVER] WebSocket ready for connections`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    console.log('[SERVER] Shutting down...');
    this.wss.close();
    this.httpServer.close();
  }
}

export async function startServer(config: Partial<ServerConfig> = {}): Promise<MathisonServer> {
  const finalConfig = { ...DEFAULT_SERVER_CONFIG, ...config };
  const server = new MathisonServer(finalConfig);
  await server.start();
  return server;
}
