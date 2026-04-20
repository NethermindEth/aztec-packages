import { z } from 'zod';

import { AztecAttributeMapSchema, type AztecAttributeValue } from './common.js';
import { type SourceRef, SourceRefSchema } from './source.js';

export const AZTEC_TRACE_ERROR_SCHEMA_VERSION = 'aztec.error.v1' as const;

/** Stable v1 error codes. */
export const AztecErrorCodes = [
  'AZPXE_ORACLE_VERSION_MISMATCH',
  'AZPXE_SCOPE_DENIED',
  'AZPXE_REORG_DIVERGENCE',
  'AZNODE_PUBLIC_REVERT',
  'AZNODE_SIMULATION_INCLUSION_MISMATCH',
  'AZPROVE_JOB_FAILED',
  'AZSETTLE_NOT_YET_PROVEN',
  'AZSETTLE_DROPPED',
  'AZSEC_UNSAFE_EXPORT_CONTEXT',
  'AZDBG_UNKNOWN',
] as const;
export type AztecErrorCode = (typeof AztecErrorCodes)[number];
export const AztecErrorCodeSchema = z.enum(AztecErrorCodes);

export const AztecTraceErrorCategories = [
  'pxe',
  'proving',
  'node',
  'settlement',
  'config',
  'security',
  'unknown',
] as const;
export type AztecTraceErrorCategory = (typeof AztecTraceErrorCategories)[number];
export const AztecTraceErrorCategorySchema = z.enum(AztecTraceErrorCategories);

export const AztecTraceErrorSeverities = ['info', 'warn', 'error', 'fatal'] as const;
export type AztecTraceErrorSeverity = (typeof AztecTraceErrorSeverities)[number];
export const AztecTraceErrorSeveritySchema = z.enum(AztecTraceErrorSeverities);

export interface AztecTraceError {
  schemaVersion: typeof AZTEC_TRACE_ERROR_SCHEMA_VERSION;
  errorId: string;
  code: AztecErrorCode;
  message: string;
  category: AztecTraceErrorCategory;
  severity: AztecTraceErrorSeverity;
  retryable: boolean;
  errorType?: string;
  spanId?: string;
  callFrameId?: string;
  remediationHint?: string;
  sourceRef?: SourceRef;
  evidence?: Record<string, AztecAttributeValue>;
  attributes?: Record<string, AztecAttributeValue>;
}

export const AztecTraceErrorSchema: z.ZodType<AztecTraceError> = z.object({
  schemaVersion: z.literal(AZTEC_TRACE_ERROR_SCHEMA_VERSION),
  errorId: z.string(),
  code: AztecErrorCodeSchema,
  message: z.string(),
  category: AztecTraceErrorCategorySchema,
  severity: AztecTraceErrorSeveritySchema,
  retryable: z.boolean(),
  errorType: z.string().optional(),
  spanId: z.string().optional(),
  callFrameId: z.string().optional(),
  remediationHint: z.string().optional(),
  sourceRef: SourceRefSchema.optional(),
  evidence: AztecAttributeMapSchema.optional(),
  attributes: AztecAttributeMapSchema.optional(),
});
