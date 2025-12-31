/**
 * API Types (mirrored from mathison-kernel-mac/src/api-types.ts)
 *
 * These types are duplicated here to ensure the UI has no runtime dependency
 * on the kernel package. Types are validated at the API boundary using Zod.
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: {
    intents_proposed?: number;
    intents_approved?: number;
    intents_denied?: number;
  };
};

export type SendMessageRequest = {
  content: string;
};

export type SendMessageResponse = {
  message: ChatMessage;
  stream_id?: string;
};

export type WSMessageType =
  | 'stream_start'
  | 'stream_chunk'
  | 'stream_end'
  | 'intent_proposed'
  | 'intent_approved'
  | 'intent_denied'
  | 'error';

export type WSStreamStart = {
  type: 'stream_start';
  stream_id: string;
  message_id: string;
};

export type WSStreamChunk = {
  type: 'stream_chunk';
  stream_id: string;
  content: string;
};

export type WSStreamEnd = {
  type: 'stream_end';
  stream_id: string;
  message: ChatMessage;
};

export type WSIntentProposed = {
  type: 'intent_proposed';
  intent_id: string;
  op: string;
  beam_id: string;
  kind?: string;
  requires_approval: boolean;
  reason?: string;
};

export type WSIntentApproved = {
  type: 'intent_approved';
  intent_id: string;
  beam_id: string;
};

export type WSIntentDenied = {
  type: 'intent_denied';
  intent_id: string;
  reason_code: string;
  human_message?: string;
};

export type WSError = {
  type: 'error';
  error: string;
  code?: string;
};

export type WSMessage =
  | WSStreamStart
  | WSStreamChunk
  | WSStreamEnd
  | WSIntentProposed
  | WSIntentApproved
  | WSIntentDenied
  | WSError;

export type BeamStatus = 'ACTIVE' | 'RETIRED' | 'PENDING_TOMBSTONE' | 'TOMBSTONED';
export type BeamKind = 'SELF' | 'POLICY' | 'CARE' | 'RELATION' | 'PROJECT' | 'SKILL' | 'FACT' | 'NOTE';

export type BeamDTO = {
  beam_id: string;
  kind: BeamKind;
  title: string;
  tags: string[];
  body: string;
  status: BeamStatus;
  pinned: boolean;
  updated_at_ms: number;
};

export type BeamQueryRequest = {
  text?: string;
  tags?: string[];
  kinds?: BeamKind[];
  include_dead?: boolean;
  limit?: number;
};

export type BeamQueryResponse = {
  beams: BeamDTO[];
  total: number;
};

export type CreateBeamRequest = {
  beam_id?: string;
  kind: BeamKind;
  title: string;
  tags: string[];
  body: string;
  pinned?: boolean;
};

export type UpdateBeamRequest = {
  title?: string;
  tags?: string[];
  body?: string;
};

export type TombstoneBeamRequest = {
  reason_code: string;
  approval_token?: string;
};

export type SelfFrameDTO = {
  selfFrame: string;
  hash: string;
  pinned_count: number;
  last_updated_ms: number;
};

export type IdentityStatusDTO = {
  mode: 'NORMAL' | 'AMNESIC_SAFE_MODE';
  selfFrame?: SelfFrameDTO;
  device_id: string;
  device_verified: boolean;
};

export type ModelInfoDTO = {
  name: string;
  path: string;
  size: number;
  is_active: boolean;
};

export type ModelListResponse = {
  models: ModelInfoDTO[];
  active_model?: string;
};

export type ModelInstallProgress = {
  status: 'downloading' | 'complete' | 'error';
  downloaded: number;
  total: number;
  percent: number;
  error?: string;
};

export type CDIIncidentStatusDTO = {
  mode: 'NORMAL' | 'INCIDENT_LOCKED';
  event?: {
    triggered_at_ms: number;
    reason: string;
    tombstone_count: number;
    threshold: number;
  };
};

export type CDIStatsDTO = {
  tombstones_24h: number;
  soft_limit: number;
  hard_limit: number;
  incident_status: CDIIncidentStatusDTO;
};

export type ApprovalRequestDTO = {
  request_id: string;
  beam_id: string;
  kind: BeamKind;
  title: string;
  op: 'TOMBSTONE' | 'PURGE';
  reason_code: string;
  created_at_ms: number;
};

export type ApprovalResponse = {
  approved: boolean;
  approval_token?: string;
};

export type BeamStoreStatsDTO = {
  active: number;
  retired: number;
  tombstoned: number;
  pinned_active: number;
};

export type SystemStatusDTO = {
  kernel_version: string;
  identity: IdentityStatusDTO;
  beamstore: BeamStoreStatsDTO;
  cdi: CDIStatsDTO;
  llama_server: {
    running: boolean;
    port: number;
    model_loaded: boolean;
  };
};

export type APIError = {
  error: string;
  code?: string;
  details?: any;
};
