import { z } from 'zod';

import { AztecAttributeMapSchema, type AztecAttributeValue } from './common.js';
import { type AztecTraceError, AztecTraceErrorSchema } from './errors.js';
import { type RedactionManifest, RedactionManifestSchema } from './redaction.js';
import { type SourceRef, SourceRefSchema } from './source.js';

export const AZTEC_TRACE_SCHEMA_VERSION = 'aztec.trace.v1' as const;

export const AztecTracePhases = ['pxe_execution', 'proving', 'node_submission', 'settlement'] as const;
export type AztecTracePhase = (typeof AztecTracePhases)[number];
export const AztecTracePhaseSchema = z.enum(AztecTracePhases);

export const AztecExecKinds = ['private', 'public', 'utility', 'kernel', 'avm', 'l1'] as const;
export type AztecExecKind = (typeof AztecExecKinds)[number];
export const AztecExecKindSchema = z.enum(AztecExecKinds);

export const AztecTraceComponents = [
  'wallet',
  'pxe',
  'simulator',
  'aztec_node',
  'sequencer',
  'prover_node',
  'prover_broker',
  'prover_agent',
  'l1_client',
] as const;
export type AztecTraceComponent = (typeof AztecTraceComponents)[number];
export const AztecTraceComponentSchema = z.enum(AztecTraceComponents);

export const AztecSensitivities = ['public', 'redacted', 'secret_local'] as const;
export type AztecSensitivity = (typeof AztecSensitivities)[number];
export const AztecSensitivitySchema = z.enum(AztecSensitivities);

export const AztecTraceStatuses = ['ok', 'error', 'partial', 'awaiting_settlement'] as const;
export type AztecTraceStatus = (typeof AztecTraceStatuses)[number];
export const AztecTraceStatusSchema = z.enum(AztecTraceStatuses);

export const AztecSpanStatuses = ['ok', 'error', 'cancelled'] as const;
export type AztecSpanStatus = (typeof AztecSpanStatuses)[number];
export const AztecSpanStatusSchema = z.enum(AztecSpanStatuses);

export const AztecLifecycleStates = [
  'simulated',
  'proven_locally',
  'submitted',
  'pending_in_mempool',
  'proposed_l2',
  'checkpointed',
  'proven_on_l1',
  'finalized',
  'dropped',
] as const;
export type AztecLifecycleState = (typeof AztecLifecycleStates)[number];
export const AztecLifecycleStateSchema = z.enum(AztecLifecycleStates);

export interface AztecSpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, AztecAttributeValue>;
}

export const AztecSpanEventSchema: z.ZodType<AztecSpanEvent> = z.object({
  name: z.string(),
  timestamp: z.string(),
  attributes: AztecAttributeMapSchema.optional(),
});

export interface AztecSpanLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, AztecAttributeValue>;
}

export const AztecSpanLinkSchema: z.ZodType<AztecSpanLink> = z.object({
  traceId: z.string(),
  spanId: z.string(),
  attributes: AztecAttributeMapSchema.optional(),
});

export interface AztecSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  component: AztecTraceComponent;
  phase: AztecTracePhase;
  kind?: AztecExecKind;
  sensitivity: AztecSensitivity;
  status: AztecSpanStatus;
  startedAt: string;
  endedAt?: string;
  attributes?: Record<string, AztecAttributeValue>;
  events?: AztecSpanEvent[];
  links?: AztecSpanLink[];
  sourceRef?: SourceRef;
  callFrameId?: string;
}

export const AztecSpanSchema: z.ZodType<AztecSpan> = z.object({
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  component: AztecTraceComponentSchema,
  phase: AztecTracePhaseSchema,
  kind: AztecExecKindSchema.optional(),
  sensitivity: AztecSensitivitySchema,
  status: AztecSpanStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().optional(),
  attributes: AztecAttributeMapSchema.optional(),
  events: z.array(AztecSpanEventSchema).optional(),
  links: z.array(AztecSpanLinkSchema).optional(),
  sourceRef: SourceRefSchema.optional(),
  callFrameId: z.string().optional(),
});

export interface AztecCallFrame {
  callFrameId: string;
  parentCallFrameId?: string;
  kind: AztecExecKind;
  sensitivity: AztecSensitivity;
  contractAddress?: string;
  functionSelector?: string;
  sourceRef?: SourceRef;
  argsDigest?: string;
  returnDigest?: string;
  attributes?: Record<string, AztecAttributeValue>;
}

export const AztecCallFrameSchema: z.ZodType<AztecCallFrame> = z.object({
  callFrameId: z.string(),
  parentCallFrameId: z.string().optional(),
  kind: AztecExecKindSchema,
  sensitivity: AztecSensitivitySchema,
  contractAddress: z.string().optional(),
  functionSelector: z.string().optional(),
  sourceRef: SourceRefSchema.optional(),
  argsDigest: z.string().optional(),
  returnDigest: z.string().optional(),
  attributes: AztecAttributeMapSchema.optional(),
});

export interface AztecTraceAnchors {
  txHash?: string;
  provisionalTraceId?: string;
  l2BlockNumber?: number;
  l2BlockHash?: string;
  l1BlockNumber?: number;
  l1TxHash?: string;
  proverJobId?: string;
  epochNumber?: number;
  slotNumber?: number;
  attributes?: Record<string, AztecAttributeValue>;
}

export const AztecTraceAnchorsSchema: z.ZodType<AztecTraceAnchors> = z.object({
  txHash: z.string().optional(),
  provisionalTraceId: z.string().optional(),
  l2BlockNumber: z.number().int().nonnegative().optional(),
  l2BlockHash: z.string().optional(),
  l1BlockNumber: z.number().int().nonnegative().optional(),
  l1TxHash: z.string().optional(),
  proverJobId: z.string().optional(),
  epochNumber: z.number().int().nonnegative().optional(),
  slotNumber: z.number().int().nonnegative().optional(),
  attributes: AztecAttributeMapSchema.optional(),
});

export interface AztecTraceNetwork {
  chainId: number;
  rollupVersion?: number;
  nodeVersion?: string;
}

export const AztecTraceNetworkSchema: z.ZodType<AztecTraceNetwork> = z.object({
  chainId: z.number().int().nonnegative(),
  rollupVersion: z.number().int().nonnegative().optional(),
  nodeVersion: z.string().optional(),
});

export interface AztecTraceArtifact {
  artifactId: string;
  name?: string;
  contentHash?: string;
  byteLength?: number;
  attributes?: Record<string, AztecAttributeValue>;
}

export const AztecTraceArtifactSchema: z.ZodType<AztecTraceArtifact> = z.object({
  artifactId: z.string(),
  name: z.string().optional(),
  contentHash: z.string().optional(),
  byteLength: z.number().int().nonnegative().optional(),
  attributes: AztecAttributeMapSchema.optional(),
});

export interface AztecTraceFingerprints {
  argsDigest?: string;
  bytecodeDigest?: string;
  pxeVersion?: string;
  nodeVersion?: string;
}

export const AztecTraceFingerprintsSchema: z.ZodType<AztecTraceFingerprints> = z.object({
  argsDigest: z.string().optional(),
  bytecodeDigest: z.string().optional(),
  pxeVersion: z.string().optional(),
  nodeVersion: z.string().optional(),
});

export interface AztecTrace {
  schemaVersion: typeof AZTEC_TRACE_SCHEMA_VERSION;
  traceId: string;
  provisionalTraceId?: string;
  txHash?: string;
  network: AztecTraceNetwork;
  createdAt: string;
  completedAt?: string;
  status: AztecTraceStatus;
  lifecycleState?: AztecLifecycleState;
  fingerprints?: AztecTraceFingerprints;
  anchors: AztecTraceAnchors;
  spans: AztecSpan[];
  callFrames: AztecCallFrame[];
  errors: AztecTraceError[];
  artifacts: AztecTraceArtifact[];
  redaction: RedactionManifest;
}

export const AztecTraceSchema: z.ZodType<AztecTrace> = z.object({
  schemaVersion: z.literal(AZTEC_TRACE_SCHEMA_VERSION),
  traceId: z.string(),
  provisionalTraceId: z.string().optional(),
  txHash: z.string().optional(),
  network: AztecTraceNetworkSchema,
  createdAt: z.string(),
  completedAt: z.string().optional(),
  status: AztecTraceStatusSchema,
  lifecycleState: AztecLifecycleStateSchema.optional(),
  fingerprints: AztecTraceFingerprintsSchema.optional(),
  anchors: AztecTraceAnchorsSchema,
  spans: z.array(AztecSpanSchema),
  callFrames: z.array(AztecCallFrameSchema),
  errors: z.array(AztecTraceErrorSchema),
  artifacts: z.array(AztecTraceArtifactSchema),
  redaction: RedactionManifestSchema,
});
