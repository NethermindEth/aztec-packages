import { randomBytes } from '@aztec/foundation/crypto/random';
import {
  AZTEC_TRACE_SCHEMA_VERSION,
  AztecCallFrameSchema,
  AztecSpanSchema,
  type AztecTrace,
  AztecTraceErrorSchema,
  AztecTraceSchema,
  RedactionManifestSchema,
  SOURCE_INDEX_SCHEMA_VERSION,
  type SourceIndex,
  type SourceIndexEntry,
  SourceIndexSchema,
  TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
  type TraceBundleExportRequest,
  type TraceBundleExportResult,
  TraceBundleManifestSchema,
  TraceBundlePaths,
} from '@aztec/stdlib/debug';

import { deterministicStringify } from './deterministic_json.js';
import { buildManifest } from './manifest.js';
import { redactTrace } from './redaction.js';

/** The wallet-facing return value from `pxe.debug.exportBundle`. */
export type LocalTraceBundleExport = {
  result: TraceBundleExportResult;
  attachments: Map<string, Buffer>;
};

export type BuildLocalBundleOptions = {
  /** Test-only: supply a pre-computed 32-byte salt. Default: randomBytes(32). */
  salt?: Buffer;
  /** Test-only: fixed clock. Default: new Date().toISOString(). */
  now?: () => string;
};

/**
 * Assembles a redacted, deterministic in-memory bundle from an `AztecTrace`.
 * Refuses any policy other than `strict` with an `AZSEC_UNSAFE_EXPORT_CONTEXT`
 * error. `request.outputPath` is treated as a label only; nothing is written
 * to disk.
 */
export function buildLocalBundle(
  trace: AztecTrace,
  request: TraceBundleExportRequest,
  options: BuildLocalBundleOptions = {},
): LocalTraceBundleExport {
  if (request.policy !== 'strict') {
    const err = new Error(
      `Export policy '${request.policy}' is not reachable through pxe.debug.exportBundle; only 'strict' is allowed.`,
    );
    (err as Error & { code?: string }).code = 'AZSEC_UNSAFE_EXPORT_CONTEXT';
    throw err;
  }

  if (trace.schemaVersion !== AZTEC_TRACE_SCHEMA_VERSION) {
    throw new Error(
      `buildLocalBundle: unexpected trace schema version ${trace.schemaVersion}, want ${AZTEC_TRACE_SCHEMA_VERSION}`,
    );
  }

  const salt = options.salt ?? randomBytes(32);
  const now = options.now?.() ?? new Date().toISOString();

  const { trace: redactedTrace, manifest: redactionManifest } = redactTrace(trace, 'strict', salt, { now: () => now });
  if (!redactedTrace) {
    throw new Error('buildLocalBundle: redactTrace did not return a redacted trace');
  }

  // Sort spans, frames, errors deterministically.
  const sortedSpans = [...redactedTrace.spans].sort((a, b) => (a.spanId < b.spanId ? -1 : a.spanId > b.spanId ? 1 : 0));
  const sortedCallFrames = [...redactedTrace.callFrames].sort((a, b) =>
    a.callFrameId < b.callFrameId ? -1 : a.callFrameId > b.callFrameId ? 1 : 0,
  );
  const sortedErrors = [...redactedTrace.errors].sort((a, b) =>
    a.errorId < b.errorId ? -1 : a.errorId > b.errorId ? 1 : 0,
  );

  // Validate every payload through its schema.
  sortedSpans.forEach(span => AztecSpanSchema.parse(span));
  sortedCallFrames.forEach(frame => AztecCallFrameSchema.parse(frame));
  sortedErrors.forEach(err => AztecTraceErrorSchema.parse(err));
  RedactionManifestSchema.parse(redactionManifest);

  // Build source-index from frame sourceRefs.
  const sourceEntries: SourceIndexEntry[] = [];
  for (const frame of sortedCallFrames) {
    const ref = frame.sourceRef;
    if (!ref) {
      continue;
    }
    const entry: SourceIndexEntry = { artifactId: ref.artifactId };
    if (ref.contractName !== undefined) {
      entry.contractName = ref.contractName;
    }
    if (ref.functionName !== undefined) {
      entry.functionName = ref.functionName;
    }
    if (ref.fileId !== undefined) {
      entry.fileId = ref.fileId;
    }
    if (ref.span !== undefined) {
      entry.span = ref.span;
    }
    if (ref.line !== undefined) {
      entry.line = ref.line;
    }
    if (ref.column !== undefined) {
      entry.column = ref.column;
    }
    sourceEntries.push(entry);
  }
  const sourceIndex: SourceIndex = {
    schemaVersion: SOURCE_INDEX_SCHEMA_VERSION,
    createdAt: now,
    files: [],
    entries: sourceEntries,
  };
  SourceIndexSchema.parse(sourceIndex);

  // Encode every payload file as deterministic JSON (UTF-8).
  const files = new Map<string, Buffer>();

  const traceBytes = Buffer.from(deterministicStringify(redactedTrace) + '\n', 'utf8');
  // Round-trip validate the serialized bytes.
  AztecTraceSchema.parse(JSON.parse(traceBytes.toString('utf8')));
  files.set(TraceBundlePaths.trace, traceBytes);

  const spansNdjson =
    sortedSpans.map(span => deterministicStringify(span)).join('\n') + (sortedSpans.length > 0 ? '\n' : '');
  const spansBytes = Buffer.from(spansNdjson, 'utf8');
  if (sortedSpans.length > 0) {
    for (const line of spansBytes
      .toString('utf8')
      .split('\n')
      .filter(l => l.length > 0)) {
      AztecSpanSchema.parse(JSON.parse(line));
    }
  }
  files.set(TraceBundlePaths.spans, spansBytes);

  const callFramesBytes = Buffer.from(deterministicStringify(sortedCallFrames) + '\n', 'utf8');
  files.set(TraceBundlePaths.callFrames, callFramesBytes);

  const errorsBytes = Buffer.from(deterministicStringify(sortedErrors) + '\n', 'utf8');
  files.set(TraceBundlePaths.errors, errorsBytes);

  const redactionBytes = Buffer.from(deterministicStringify(redactionManifest) + '\n', 'utf8');
  files.set(TraceBundlePaths.redaction, redactionBytes);

  const sourceIndexBytes = Buffer.from(deterministicStringify(sourceIndex) + '\n', 'utf8');
  files.set(TraceBundlePaths.sourceIndex, sourceIndexBytes);

  const manifest = buildManifest({
    traceId: redactedTrace.traceId,
    policy: 'strict',
    createdAt: now,
    files,
  });
  TraceBundleManifestSchema.parse(manifest);

  // Assemble attachments (manifest.json is part of attachments only).
  const manifestBytes = Buffer.from(deterministicStringify(manifest) + '\n', 'utf8');
  const attachments = new Map<string, Buffer>(files);
  attachments.set(TraceBundlePaths.manifest, manifestBytes);

  const outputPath = request.outputPath ?? `memory://${manifest.bundleId}`;
  const result: TraceBundleExportResult = {
    schemaVersion: TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
    bundleId: manifest.bundleId,
    traceId: manifest.traceId,
    outputPath,
    manifest,
  };

  return { result, attachments };
}
