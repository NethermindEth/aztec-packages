import { z } from 'zod';

export const REDACTION_MANIFEST_SCHEMA_VERSION = 'aztec.redaction.v1' as const;

export const RedactionPolicies = ['strict', 'balanced', 'local_full'] as const;
export type RedactionPolicy = (typeof RedactionPolicies)[number];
export const RedactionPolicySchema = z.enum(RedactionPolicies);

export const RedactionDigestAlgorithms = ['HMAC-SHA256'] as const;
export type RedactionDigestAlgorithm = (typeof RedactionDigestAlgorithms)[number];
export const RedactionDigestAlgorithmSchema = z.enum(RedactionDigestAlgorithms);

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/** 64-char hex salt without a 0x prefix. */
export const SaltHexSchema = z.string().regex(HEX_64, {
  message: 'saltHex must be 64 hex chars, no 0x prefix',
});

export interface RedactionManifest {
  schemaVersion: typeof REDACTION_MANIFEST_SCHEMA_VERSION;
  policy: RedactionPolicy;
  saltHex: string;
  digestAlgorithm: RedactionDigestAlgorithm;
  redactedFields: string[];
  preservedFields: string[];
  createdAt: string;
}

export const RedactionManifestSchema: z.ZodType<RedactionManifest> = z.object({
  schemaVersion: z.literal(REDACTION_MANIFEST_SCHEMA_VERSION),
  policy: RedactionPolicySchema,
  saltHex: SaltHexSchema,
  digestAlgorithm: RedactionDigestAlgorithmSchema,
  redactedFields: z.array(z.string()),
  preservedFields: z.array(z.string()),
  createdAt: z.string(),
});
