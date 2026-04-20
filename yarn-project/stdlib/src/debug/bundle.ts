import { z } from 'zod';

import { type RedactionPolicy, RedactionPolicySchema } from './redaction.js';

export const TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION = 'aztec.bundle.v1' as const;
export const TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION = 'aztec.bundle_export_request.v1' as const;
export const TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION = 'aztec.bundle_export_result.v1' as const;
export const REDACTION_PREVIEW_REQUEST_SCHEMA_VERSION = 'aztec.redaction_preview_request.v1' as const;
export const REDACTION_PREVIEW_SCHEMA_VERSION = 'aztec.redaction_preview.v1' as const;

/** Schema constants describing the future bundle layout. Plan 1 does not write any files. */
export const TraceBundlePaths = {
  manifest: 'manifest.json',
  trace: 'trace.json',
  spans: 'spans.ndjson',
  callFrames: 'callframes.json',
  errors: 'errors.json',
  redaction: 'redaction.json',
  sourceIndex: 'source-index.json',
  artifactsDir: 'artifacts/',
} as const;

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/** 64-char hex content hash without an 0x prefix. */
export const ContentHashSchema = z.string().regex(HEX_64, {
  message: 'contentHash must be 64 hex chars, no 0x prefix',
});

export interface TraceBundleFileEntry {
  path: string;
  contentHash: string;
  byteLength: number;
}

export const TraceBundleFileEntrySchema: z.ZodType<TraceBundleFileEntry> = z.object({
  path: z.string(),
  contentHash: ContentHashSchema,
  byteLength: z.number().int().nonnegative(),
});

export interface TraceBundleManifest {
  schemaVersion: typeof TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION;
  bundleId: string;
  traceId: string;
  createdAt: string;
  policy: RedactionPolicy;
  files: TraceBundleFileEntry[];
}

export const TraceBundleManifestSchema: z.ZodType<TraceBundleManifest> = z.object({
  schemaVersion: z.literal(TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION),
  bundleId: z.string(),
  traceId: z.string(),
  createdAt: z.string(),
  policy: RedactionPolicySchema,
  files: z.array(TraceBundleFileEntrySchema),
});

export interface TraceBundleExportRequest {
  schemaVersion: typeof TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION;
  traceId: string;
  policy: RedactionPolicy;
  outputPath?: string;
  includeArtifacts?: boolean;
}

export const TraceBundleExportRequestSchema: z.ZodType<TraceBundleExportRequest> = z.object({
  schemaVersion: z.literal(TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION),
  traceId: z.string(),
  policy: RedactionPolicySchema,
  outputPath: z.string().optional(),
  includeArtifacts: z.boolean().optional(),
});

export interface TraceBundleExportResult {
  schemaVersion: typeof TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION;
  bundleId: string;
  traceId: string;
  outputPath: string;
  manifest: TraceBundleManifest;
}

export const TraceBundleExportResultSchema: z.ZodType<TraceBundleExportResult> = z.object({
  schemaVersion: z.literal(TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION),
  bundleId: z.string(),
  traceId: z.string(),
  outputPath: z.string(),
  manifest: TraceBundleManifestSchema,
});

export interface RedactionPreviewRequest {
  schemaVersion: typeof REDACTION_PREVIEW_REQUEST_SCHEMA_VERSION;
  traceId: string;
  policy: RedactionPolicy;
}

export const RedactionPreviewRequestSchema: z.ZodType<RedactionPreviewRequest> = z.object({
  schemaVersion: z.literal(REDACTION_PREVIEW_REQUEST_SCHEMA_VERSION),
  traceId: z.string(),
  policy: RedactionPolicySchema,
});

export interface RedactionPreview {
  schemaVersion: typeof REDACTION_PREVIEW_SCHEMA_VERSION;
  traceId: string;
  policy: RedactionPolicy;
  redactedFields: string[];
  preservedFields: string[];
}

export const RedactionPreviewSchema: z.ZodType<RedactionPreview> = z.object({
  schemaVersion: z.literal(REDACTION_PREVIEW_SCHEMA_VERSION),
  traceId: z.string(),
  policy: RedactionPolicySchema,
  redactedFields: z.array(z.string()),
  preservedFields: z.array(z.string()),
});
