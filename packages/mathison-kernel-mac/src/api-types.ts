import { z } from 'zod';
import { BeamStatus, BeamKind, ApprovalMethod } from 'mathison-storage';

/**
 * Mathison API Type Definitions
 *
 * Strong typing for HTTP/WebSocket communication to prevent type bleed.
 * All messages are validated at API boundaries using Zod schemas.
 */

/* =========================
 * Message Types (Chat)
 * ========================= */

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: z.number(),
  metadata: z.object({
    intents_proposed: z.number().optional(),
    intents_approved: z.number().optional(),
    intents_denied: z.number().optional(),
  }).optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SendMessageRequestSchema = z.object({
  content: z.string().min(1),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageResponseSchema = z.object({
  message: ChatMessageSchema,
  stream_id: z.string().optional(),
});

export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

/* =========================
 * WebSocket Messages
 * ========================= */

export const WSMessageTypeSchema = z.enum([
  'stream_start',
  'stream_chunk',
  'stream_end',
  'intent_proposed',
  'intent_approved',
  'intent_denied',
  'error',
]);

export type WSMessageType = z.infer<typeof WSMessageTypeSchema>;

export const WSStreamStartSchema = z.object({
  type: z.literal('stream_start'),
  stream_id: z.string(),
  message_id: z.string(),
});

export const WSStreamChunkSchema = z.object({
  type: z.literal('stream_chunk'),
  stream_id: z.string(),
  content: z.string(),
});

export const WSStreamEndSchema = z.object({
  type: z.literal('stream_end'),
  stream_id: z.string(),
  message: ChatMessageSchema,
});

export const WSIntentProposedSchema = z.object({
  type: z.literal('intent_proposed'),
  intent_id: z.string(),
  op: z.string(),
  beam_id: z.string(),
  kind: z.string().optional(),
  requires_approval: z.boolean(),
  reason: z.string().optional(),
});

export const WSIntentApprovedSchema = z.object({
  type: z.literal('intent_approved'),
  intent_id: z.string(),
  beam_id: z.string(),
});

export const WSIntentDeniedSchema = z.object({
  type: z.literal('intent_denied'),
  intent_id: z.string(),
  reason_code: z.string(),
  human_message: z.string().optional(),
});

export const WSErrorSchema = z.object({
  type: z.literal('error'),
  error: z.string(),
  code: z.string().optional(),
});

export const WSMessageSchema = z.discriminatedUnion('type', [
  WSStreamStartSchema,
  WSStreamChunkSchema,
  WSStreamEndSchema,
  WSIntentProposedSchema,
  WSIntentApprovedSchema,
  WSIntentDeniedSchema,
  WSErrorSchema,
]);

export type WSMessage = z.infer<typeof WSMessageSchema>;

/* =========================
 * Beam Types
 * ========================= */

export const BeamStatusSchema = z.enum(['ACTIVE', 'RETIRED', 'PENDING_TOMBSTONE', 'TOMBSTONED']);
export const BeamKindSchema = z.enum(['SELF', 'POLICY', 'CARE', 'RELATION', 'PROJECT', 'SKILL', 'FACT', 'NOTE']);

export const BeamDTOSchema = z.object({
  beam_id: z.string(),
  kind: BeamKindSchema,
  title: z.string(),
  tags: z.array(z.string()),
  body: z.string(),
  status: BeamStatusSchema,
  pinned: z.boolean(),
  updated_at_ms: z.number(),
});

export type BeamDTO = z.infer<typeof BeamDTOSchema>;

export const BeamQueryRequestSchema = z.object({
  text: z.string().optional(),
  tags: z.array(z.string()).optional(),
  kinds: z.array(BeamKindSchema).optional(),
  include_dead: z.boolean().optional(),
  limit: z.number().optional(),
});

export type BeamQueryRequest = z.infer<typeof BeamQueryRequestSchema>;

export const BeamQueryResponseSchema = z.object({
  beams: z.array(BeamDTOSchema),
  total: z.number(),
});

export type BeamQueryResponse = z.infer<typeof BeamQueryResponseSchema>;

export const CreateBeamRequestSchema = z.object({
  beam_id: z.string().optional(),
  kind: BeamKindSchema,
  title: z.string(),
  tags: z.array(z.string()),
  body: z.string(),
  pinned: z.boolean().optional(),
});

export type CreateBeamRequest = z.infer<typeof CreateBeamRequestSchema>;

export const UpdateBeamRequestSchema = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  body: z.string().optional(),
});

export type UpdateBeamRequest = z.infer<typeof UpdateBeamRequestSchema>;

export const TombstoneBeamRequestSchema = z.object({
  reason_code: z.string().min(1),
  approval_token: z.string().optional(),
});

export type TombstoneBeamRequest = z.infer<typeof TombstoneBeamRequestSchema>;

/* =========================
 * Identity Types
 * ========================= */

export const SelfFrameDTOSchema = z.object({
  selfFrame: z.string(),
  hash: z.string(),
  pinned_count: z.number(),
  last_updated_ms: z.number(),
});

export type SelfFrameDTO = z.infer<typeof SelfFrameDTOSchema>;

export const IdentityStatusDTOSchema = z.object({
  mode: z.enum(['NORMAL', 'AMNESIC_SAFE_MODE']),
  selfFrame: SelfFrameDTOSchema.optional(),
  device_id: z.string(),
  device_verified: z.boolean(),
});

export type IdentityStatusDTO = z.infer<typeof IdentityStatusDTOSchema>;

/* =========================
 * Model Types
 * ========================= */

export const ModelInfoDTOSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  is_active: z.boolean(),
});

export type ModelInfoDTO = z.infer<typeof ModelInfoDTOSchema>;

export const ModelListResponseSchema = z.object({
  models: z.array(ModelInfoDTOSchema),
  active_model: z.string().optional(),
});

export type ModelListResponse = z.infer<typeof ModelListResponseSchema>;

export const ModelInstallProgressSchema = z.object({
  status: z.enum(['downloading', 'complete', 'error']),
  downloaded: z.number(),
  total: z.number(),
  percent: z.number(),
  error: z.string().optional(),
});

export type ModelInstallProgress = z.infer<typeof ModelInstallProgressSchema>;

/* =========================
 * CDI Types
 * ========================= */

export const CDIIncidentStatusDTOSchema = z.object({
  mode: z.enum(['NORMAL', 'INCIDENT_LOCKED']),
  event: z.object({
    triggered_at_ms: z.number(),
    reason: z.string(),
    tombstone_count: z.number(),
    threshold: z.number(),
  }).optional(),
});

export type CDIIncidentStatusDTO = z.infer<typeof CDIIncidentStatusDTOSchema>;

export const CDIStatsDTOSchema = z.object({
  tombstones_24h: z.number(),
  soft_limit: z.number(),
  hard_limit: z.number(),
  incident_status: CDIIncidentStatusDTOSchema,
});

export type CDIStatsDTO = z.infer<typeof CDIStatsDTOSchema>;

export const ApprovalRequestDTOSchema = z.object({
  request_id: z.string(),
  beam_id: z.string(),
  kind: BeamKindSchema,
  title: z.string(),
  op: z.enum(['TOMBSTONE', 'PURGE']),
  reason_code: z.string(),
  created_at_ms: z.number(),
});

export type ApprovalRequestDTO = z.infer<typeof ApprovalRequestDTOSchema>;

export const ApprovalResponseSchema = z.object({
  approved: z.boolean(),
  approval_token: z.string().optional(),
});

export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

/* =========================
 * Stats Types
 * ========================= */

export const BeamStoreStatsDTOSchema = z.object({
  active: z.number(),
  retired: z.number(),
  tombstoned: z.number(),
  pinned_active: z.number(),
});

export type BeamStoreStatsDTO = z.infer<typeof BeamStoreStatsDTOSchema>;

export const SystemStatusDTOSchema = z.object({
  kernel_version: z.string(),
  identity: IdentityStatusDTOSchema,
  beamstore: BeamStoreStatsDTOSchema,
  cdi: CDIStatsDTOSchema,
  llama_server: z.object({
    running: z.boolean(),
    port: z.number(),
    model_loaded: z.boolean(),
  }),
});

export type SystemStatusDTO = z.infer<typeof SystemStatusDTOSchema>;

/* =========================
 * Error Types
 * ========================= */

export const APIErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.any().optional(),
});

export type APIError = z.infer<typeof APIErrorSchema>;

/* =========================
 * Helpers
 * ========================= */

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
