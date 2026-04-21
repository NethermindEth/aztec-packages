import { z } from 'zod';

import { type AztecTraceError, AztecTraceErrorSchema } from './errors.js';
import {
  type AztecCallFrame,
  AztecCallFrameSchema,
  type AztecLifecycleState,
  AztecLifecycleStateSchema,
  type AztecSpan,
  AztecSpanSchema,
  type AztecTraceAnchors,
  AztecTraceAnchorsSchema,
  type AztecTraceStatus,
  AztecTraceStatusSchema,
} from './trace.js';

export const NODE_TRACE_SEGMENT_SCHEMA_VERSION = 'aztec.node_segment.v1' as const;
export const NODE_TRACE_SEGMENT_REQUEST_SCHEMA_VERSION = 'aztec.node_segment_request.v1' as const;
export const NODE_TRACE_STATUS_SCHEMA_VERSION = 'aztec.node_trace_status.v1' as const;

export const NodeTraceSegmentPhases = ['node_submission', 'public_execution', 'settlement'] as const;
export type NodeTraceSegmentPhase = (typeof NodeTraceSegmentPhases)[number];
export const NodeTraceSegmentPhaseSchema = z.enum(NodeTraceSegmentPhases);

/** Request arguments for the admin-only `exportTraceSegment` RPC. */
export interface NodeTraceSegmentRequest {
  schemaVersion: typeof NODE_TRACE_SEGMENT_REQUEST_SCHEMA_VERSION;
  txHash: string;
  traceId?: string;
  phases?: NodeTraceSegmentPhase[];
  /** Only `'strict'` is accepted at the admin boundary. */
  policy: 'strict';
  includeDebugLogs?: boolean;
  includePublicCallStack?: boolean;
}

export const NodeTraceSegmentRequestSchema: z.ZodType<NodeTraceSegmentRequest> = z.object({
  schemaVersion: z.literal(NODE_TRACE_SEGMENT_REQUEST_SCHEMA_VERSION),
  txHash: z.string(),
  traceId: z.string().optional(),
  phases: z.array(NodeTraceSegmentPhaseSchema).optional(),
  policy: z.literal('strict'),
  includeDebugLogs: z.boolean().optional(),
  includePublicCallStack: z.boolean().optional(),
});

/**
 * Bounded, public-safe subset of `AztecTrace` produced by the node for a single tx.
 * Callers merge this into a wallet/PXE-side `AztecTrace` via `txHash` (or `traceId`).
 */
export interface NodeTraceSegment {
  schemaVersion: typeof NODE_TRACE_SEGMENT_SCHEMA_VERSION;
  txHash: string;
  traceId?: string;
  anchors: AztecTraceAnchors;
  status: AztecTraceStatus;
  lifecycleState: AztecLifecycleState;
  spans: AztecSpan[];
  callFrames: AztecCallFrame[];
  errors: AztecTraceError[];
  createdAt: string;
  /** Per-segment HMAC salt (32-byte hex) used for digesting calldata/log fields. */
  segmentRedactionSalt: string;
}

export const NodeTraceSegmentSchema: z.ZodType<NodeTraceSegment> = z.object({
  schemaVersion: z.literal(NODE_TRACE_SEGMENT_SCHEMA_VERSION),
  txHash: z.string(),
  traceId: z.string().optional(),
  anchors: AztecTraceAnchorsSchema,
  status: AztecTraceStatusSchema,
  lifecycleState: AztecLifecycleStateSchema,
  spans: z.array(AztecSpanSchema),
  callFrames: z.array(AztecCallFrameSchema),
  errors: z.array(AztecTraceErrorSchema),
  createdAt: z.string(),
  segmentRedactionSalt: z.string().regex(/^[0-9a-f]{64}$/),
});

/** Lightweight "has this tx made it to L2/L1?" probe response. */
export interface NodeTraceStatus {
  schemaVersion: typeof NODE_TRACE_STATUS_SCHEMA_VERSION;
  txHash: string;
  status: AztecTraceStatus;
  lifecycleState: AztecLifecycleState;
  anchors: AztecTraceAnchors;
}

export const NodeTraceStatusSchema: z.ZodType<NodeTraceStatus> = z.object({
  schemaVersion: z.literal(NODE_TRACE_STATUS_SCHEMA_VERSION),
  txHash: z.string(),
  status: AztecTraceStatusSchema,
  lifecycleState: AztecLifecycleStateSchema,
  anchors: AztecTraceAnchorsSchema,
});
