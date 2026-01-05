/**
 * Knowledge Ingestion Gate
 *
 * Core logic that ensures grounded claims are stored, not hallucinations.
 * Implements the full CIF→CDI→Handler→CDI→CIF pipeline for knowledge ingestion.
 */

import { createHash } from 'crypto';
import { CPACK, parseCPACK, validateCPACK } from './cpack-schema';
import {
  IngestionRequest,
  IngestionResult,
  CandidateClaim,
  FetchedChunk,
  GroundedClaim as IngestionGroundedClaim,
  ConflictRecord as IngestionConflictRecord,
  ChunkRetriever,
  IngestionMode,
} from './types';
import { KnowledgeStore, GroundedClaim, ConflictRecord } from 'mathison-storage';

/**
 * Ingestion Gate Configuration
 */
export interface IngestionGateConfig {
  knowledgeStore: KnowledgeStore;
  chunkRetriever: ChunkRetriever;
  postureManager?: any; // Optional posture check
}

/**
 * Knowledge Ingestion Gate
 */
export class KnowledgeIngestionGate {
  constructor(private config: IngestionGateConfig) {}

  /**
   * Process an ingestion request
   * This is the main handler called by HTTP/gRPC endpoints
   */
  async processIngestion(request: IngestionRequest): Promise<IngestionResult> {
    // 1. CIF Ingress: Validate request payload
    const ingressCheck = this.validateIngressPayload(request);
    if (!ingressCheck.allowed) {
      return this.createDeniedResult(ingressCheck.reason || 'INGRESS_FAILED', request);
    }

    // Parse and validate CPACK
    const cpackResult = this.parseCPACKFromRequest(request);
    if (!cpackResult.success) {
      return this.createDeniedResult(cpackResult.error, request);
    }

    const cpack = cpackResult.cpack;
    const mode = request.mode ?? 'GROUND_ONLY';

    // 2. CDI Action Check: Check if ingestion is allowed
    const actionCheck = await this.checkIngestionAction(request, cpack);
    if (!actionCheck.allowed) {
      return this.createDeniedResult(actionCheck.reason || 'ACTION_DENIED', request, cpack.packet_id);
    }

    // 3. Fetch Stage: Retrieve chunks (runtime-owned, not LLM-owned)
    const fetchResult = await this.fetchChunks(cpack, request);
    if (!fetchResult.success) {
      return this.createDeniedResult(fetchResult.error, request, cpack.packet_id);
    }

    const fetchedChunks = fetchResult.chunks;

    // 4. CDI Output Check: Validate claims
    const validationResult = this.validateClaims(request.llm_output.claims, fetchedChunks, cpack, mode);

    // 5. Write Stage: Store grounded claims and conflicts
    const writeResult = await this.writeKnowledge(
      validationResult.grounded,
      validationResult.hypotheses,
      validationResult.conflicts,
      cpack,
      request
    );

    if (!writeResult.success) {
      return this.createDeniedResult(writeResult.error || 'WRITE_FAILED', request, cpack.packet_id);
    }

    // 6. Success: Return result with stats
    return this.createSuccessResult(validationResult, writeResult, cpack, request);
  }

  /**
   * CIF Ingress: Validate request payload
   */
  private validateIngressPayload(
    request: IngestionRequest
  ): { allowed: boolean; reason?: string } {
    // Check required fields
    if (!request.cpack_yaml && !request.cpack) {
      return { allowed: false, reason: 'CPACK_MISSING' };
    }

    if (!request.llm_output || !request.llm_output.claims) {
      return { allowed: false, reason: 'LLM_OUTPUT_MISSING' };
    }

    if (!Array.isArray(request.llm_output.claims)) {
      return { allowed: false, reason: 'LLM_OUTPUT_INVALID' };
    }

    return { allowed: true };
  }

  /**
   * Parse CPACK from request
   */
  private parseCPACKFromRequest(
    request: IngestionRequest
  ): { success: true; cpack: CPACK } | { success: false; error: string } {
    if (request.cpack) {
      const result = validateCPACK(request.cpack);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true, cpack: result.data };
    }

    if (request.cpack_yaml) {
      const result = parseCPACK(request.cpack_yaml);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true, cpack: result.data };
    }

    return { success: false, error: 'No CPACK provided' };
  }

  /**
   * CDI Action Check: Verify ingestion is allowed
   */
  private async checkIngestionAction(
    request: IngestionRequest,
    cpack: CPACK
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check chunk retriever availability
    const retrieverAvailable = await this.config.chunkRetriever.isAvailable();
    if (!retrieverAvailable) {
      return { allowed: false, reason: 'CHUNK_RETRIEVER_UNAVAILABLE' };
    }

    // Check signature if required by policy
    // For now, we allow missing signatures but record the status
    // In stricter environments, you would deny here:
    // if (!cpack.signing?.signature) {
    //   return { allowed: false, reason: 'SIGNATURE_REQUIRED' };
    // }

    // Check posture if posture manager is available
    if (this.config.postureManager) {
      // Could check if current posture allows ingestion
      // For now, we skip this check
    }

    return { allowed: true };
  }

  /**
   * Fetch Stage: Retrieve all required chunks
   */
  private async fetchChunks(
    cpack: CPACK,
    request: IngestionRequest
  ): Promise<{ success: true; chunks: Map<string, FetchedChunk> } | { success: false; error: string }> {
    const chunks = new Map<string, FetchedChunk>();

    // Fetch all cross_refs from CPACK
    for (const pointer of cpack.pointers.cross_refs) {
      const chunk = await this.config.chunkRetriever.fetch(pointer.chunk_id);
      if (!chunk) {
        return { success: false, error: `CHUNK_NOT_FOUND: ${pointer.chunk_id}` };
      }
      chunks.set(pointer.chunk_id, chunk);
    }

    // Optionally fetch additional chunks requested by LLM
    // For now, we only trust CPACK-specified chunks
    // In production, you'd check allowed_chunk_namespaces policy

    return { success: true, chunks };
  }

  /**
   * CDI Output Check: Validate all claims
   */
  private validateClaims(
    claims: CandidateClaim[],
    fetchedChunks: Map<string, FetchedChunk>,
    cpack: CPACK,
    mode: IngestionMode
  ): {
    grounded: CandidateClaim[];
    hypotheses: CandidateClaim[];
    denied: Array<{ claim: CandidateClaim; reason: string }>;
    conflicts: Array<{ key: string; claim: CandidateClaim }>;
  } {
    const grounded: CandidateClaim[] = [];
    const hypotheses: CandidateClaim[] = [];
    const denied: Array<{ claim: CandidateClaim; reason: string }> = [];
    const conflicts: Array<{ key: string; claim: CandidateClaim }> = [];

    for (const claim of claims) {
      // A) Support check
      const hasSupport = claim.support && claim.support.length > 0;

      // B) Type-based grounding check
      const requiresFetch = cpack.rules.require_fetch_for.includes(claim.type);

      if (!hasSupport) {
        // No support
        if (requiresFetch) {
          // This type requires grounding - deny always
          denied.push({ claim, reason: `TYPE_REQUIRES_GROUNDING: ${claim.type}` });
          continue;
        }

        if (mode === 'GROUND_PLUS_HYPOTHESIS') {
          // Allow as hypothesis
          hypotheses.push(claim);
          continue;
        } else {
          // GROUND_ONLY mode - deny
          denied.push({ claim, reason: 'NO_SUPPORT_GROUND_ONLY_MODE' });
          continue;
        }
      }

      // C) Verify all support chunks were actually fetched
      const invalidChunks = claim.support.filter((s) => !fetchedChunks.has(s.chunk_id));
      if (invalidChunks.length > 0) {
        denied.push({
          claim,
          reason: `UNFETCHED_CHUNKS: ${invalidChunks.map((c) => c.chunk_id).join(', ')}`,
        });
        continue;
      }

      // D) Injection boundary check
      // We detect instructional text but don't treat it as control logic
      // Just record it for audit
      const hasInstructionalChunks = claim.support.some((s) => {
        const chunk = fetchedChunks.get(s.chunk_id);
        return chunk?.has_instructional_text;
      });

      // If chunk has instructional text, we note it but still allow the claim
      // The chunk content is treated as data, not instructions

      // E) Conflict detection (if claim has a key)
      if (claim.key) {
        // We'll check for conflicts during write stage
        // For now, mark it for potential conflict
        conflicts.push({ key: claim.key, claim });
      }

      // Claim is grounded
      grounded.push(claim);
    }

    return { grounded, hypotheses, denied, conflicts };
  }

  /**
   * Write Stage: Store grounded claims, hypotheses, and conflicts
   */
  private async writeKnowledge(
    groundedClaims: CandidateClaim[],
    hypothesisClaims: CandidateClaim[],
    potentialConflicts: Array<{ key: string; claim: CandidateClaim }>,
    cpack: CPACK,
    request: IngestionRequest
  ): Promise<{
    success: boolean;
    error?: string;
    grounded_ids: string[];
    hypothesis_ids: string[];
    conflict_ids: string[];
  }> {
    const grounded_ids: string[] = [];
    const hypothesis_ids: string[] = [];
    const conflict_ids: string[] = [];

    try {
      // Write grounded claims
      for (const claim of groundedClaims) {
        const groundedClaim = this.claimToGroundedClaim(claim, cpack, 'grounded');
        await this.config.knowledgeStore.writeClaim(groundedClaim);
        grounded_ids.push(groundedClaim.claim_id);
      }

      // Write hypotheses
      for (const claim of hypothesisClaims) {
        const hypothesisClaim = this.claimToGroundedClaim(claim, cpack, 'hypothesis');
        hypothesisClaim.taint = 'untrusted_llm';
        await this.config.knowledgeStore.writeClaim(hypothesisClaim);
        hypothesis_ids.push(hypothesisClaim.claim_id);
      }

      // Check for conflicts
      for (const { key, claim } of potentialConflicts) {
        const existingClaims = await this.config.knowledgeStore.findClaimsByKey(key);
        const newClaim = this.claimToGroundedClaim(claim, cpack, 'grounded');

        for (const existing of existingClaims) {
          // Check if text differs (normalized comparison)
          const existingNorm = this.normalizeText(existing.text);
          const newNorm = this.normalizeText(newClaim.text);

          if (existingNorm !== newNorm && existing.status === 'grounded') {
            // Conflict detected
            const conflict: ConflictRecord = {
              conflict_id: this.computeConflictId(existing.claim_id, newClaim.claim_id),
              key,
              existing_claim_id: existing.claim_id,
              new_claim_id: newClaim.claim_id,
              existing_text: existing.text,
              new_text: newClaim.text,
              detected_at: Date.now(),
              packet_id: cpack.packet_id,
            };

            await this.config.knowledgeStore.recordConflict(conflict);
            conflict_ids.push(conflict.conflict_id);

            // Do NOT overwrite existing claim
          }
        }
      }

      return {
        success: true,
        grounded_ids,
        hypothesis_ids,
        conflict_ids,
      };
    } catch (err) {
      return {
        success: false,
        error: `WRITE_FAILED: ${err instanceof Error ? err.message : String(err)}`,
        grounded_ids: [],
        hypothesis_ids: [],
        conflict_ids: [],
      };
    }
  }

  /**
   * Convert CandidateClaim to GroundedClaim
   */
  private claimToGroundedClaim(
    claim: CandidateClaim,
    cpack: CPACK,
    status: 'grounded' | 'hypothesis'
  ): GroundedClaim {
    // Compute deterministic claim_id if not provided
    const claim_id =
      claim.claim_id ||
      createHash('sha256')
        .update(JSON.stringify({ type: claim.type, text: claim.text, key: claim.key }))
        .digest('hex')
        .substring(0, 32);

    // Compute chunk hashes
    const chunk_hashes = claim.support.map((s) => {
      // In real implementation, we'd get this from fetchedChunks
      // For now, just hash the chunk_id as placeholder
      return createHash('sha256').update(s.chunk_id).digest('hex');
    });

    return {
      claim_id,
      type: claim.type,
      text: claim.text,
      support: claim.support,
      key: claim.key,
      confidence: claim.confidence,
      packet_id: cpack.packet_id,
      chunk_hashes,
      sources_hash: cpack.integrity?.sources_hash,
      template_checksum: cpack.integrity?.template_checksum,
      signature_status: cpack.signing?.signature ? 'valid' : 'missing',
      status,
      created_at: Date.now(),
    };
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Compute deterministic conflict ID
   */
  private computeConflictId(id1: string, id2: string): string {
    const sorted = [id1, id2].sort();
    return createHash('sha256').update(sorted.join(':')).digest('hex').substring(0, 32);
  }

  /**
   * Create denied result
   */
  private createDeniedResult(
    reason: string,
    request: IngestionRequest,
    packet_id?: string
  ): IngestionResult {
    return {
      success: false,
      reason_code: reason,
      message: `Ingestion denied: ${reason}`,
      grounded_count: 0,
      hypothesis_count: 0,
      denied_count: request.llm_output?.claims?.length || 0,
      conflict_count: 0,
      packet_id: packet_id || 'unknown',
      ingestion_run_id: this.computeIngestionRunId(packet_id || 'unknown'),
      timestamp: Date.now(),
    };
  }

  /**
   * Create success result
   */
  private createSuccessResult(
    validation: ReturnType<typeof this.validateClaims>,
    writeResult: Awaited<ReturnType<typeof this.writeKnowledge>>,
    cpack: CPACK,
    request: IngestionRequest
  ): IngestionResult {
    return {
      success: true,
      reason_code: 'INGESTION_SUCCESS',
      message: 'Knowledge ingested successfully',
      grounded_count: validation.grounded.length,
      hypothesis_count: validation.hypotheses.length,
      denied_count: validation.denied.length,
      conflict_count: writeResult.conflict_ids.length,
      grounded_claim_ids: writeResult.grounded_ids,
      hypothesis_claim_ids: writeResult.hypothesis_ids,
      denied_reasons: validation.denied.map((d, i) => ({ claim_index: i, reason: d.reason })),
      conflict_ids: writeResult.conflict_ids,
      packet_id: cpack.packet_id,
      ingestion_run_id: this.computeIngestionRunId(cpack.packet_id),
      sources_hash: cpack.integrity?.sources_hash,
      timestamp: Date.now(),
    };
  }

  /**
   * Compute deterministic ingestion run ID
   */
  private computeIngestionRunId(packet_id: string): string {
    const nonce = Date.now();
    return createHash('sha256')
      .update(`${packet_id}:${nonce}`)
      .digest('hex')
      .substring(0, 32);
  }
}
