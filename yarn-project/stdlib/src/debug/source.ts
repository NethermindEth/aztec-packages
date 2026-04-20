import { z } from 'zod';

export const SOURCE_REF_SCHEMA_VERSION = 'aztec.source_ref.v1' as const;
export const SOURCE_INDEX_SCHEMA_VERSION = 'aztec.source_index.v1' as const;

export interface SourceSpan {
  start: number;
  end: number;
}

export const SourceSpanSchema: z.ZodType<SourceSpan> = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .refine(span => span.end >= span.start, { message: 'end must be greater than or equal to start' });

export interface SourceRef {
  schemaVersion: typeof SOURCE_REF_SCHEMA_VERSION;
  artifactId: string;
  contractName?: string;
  functionName?: string;
  path?: string;
  fileId?: number;
  span?: SourceSpan;
  line?: number;
  column?: number;
}

export const SourceRefSchema: z.ZodType<SourceRef> = z.object({
  schemaVersion: z.literal(SOURCE_REF_SCHEMA_VERSION),
  artifactId: z.string(),
  contractName: z.string().optional(),
  functionName: z.string().optional(),
  path: z.string().optional(),
  fileId: z.number().int().nonnegative().optional(),
  span: SourceSpanSchema.optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
});

export interface SourceIndexFile {
  fileId: number;
  path: string;
  contentHash?: string;
}

export const SourceIndexFileSchema: z.ZodType<SourceIndexFile> = z.object({
  fileId: z.number().int().nonnegative(),
  path: z.string(),
  contentHash: z.string().optional(),
});

export interface SourceIndexEntry {
  artifactId: string;
  contractName?: string;
  functionName?: string;
  fileId?: number;
  span?: SourceSpan;
  line?: number;
  column?: number;
}

export const SourceIndexEntrySchema: z.ZodType<SourceIndexEntry> = z.object({
  artifactId: z.string(),
  contractName: z.string().optional(),
  functionName: z.string().optional(),
  fileId: z.number().int().nonnegative().optional(),
  span: SourceSpanSchema.optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
});

export interface SourceIndex {
  schemaVersion: typeof SOURCE_INDEX_SCHEMA_VERSION;
  createdAt: string;
  files: SourceIndexFile[];
  entries: SourceIndexEntry[];
  limitations?: string[];
}

export const SourceIndexSchema: z.ZodType<SourceIndex> = z.object({
  schemaVersion: z.literal(SOURCE_INDEX_SCHEMA_VERSION),
  createdAt: z.string(),
  files: z.array(SourceIndexFileSchema),
  entries: z.array(SourceIndexEntrySchema),
  limitations: z.array(z.string()).optional(),
});
