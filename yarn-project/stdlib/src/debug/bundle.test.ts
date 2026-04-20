import {
  REDACTION_PREVIEW_REQUEST_SCHEMA_VERSION,
  REDACTION_PREVIEW_SCHEMA_VERSION,
  type RedactionPreview,
  type RedactionPreviewRequest,
  RedactionPreviewRequestSchema,
  RedactionPreviewSchema,
  TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION,
  TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
  TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
  type TraceBundleExportRequest,
  TraceBundleExportRequestSchema,
  type TraceBundleExportResult,
  TraceBundleExportResultSchema,
  type TraceBundleManifest,
  TraceBundleManifestSchema,
} from './bundle.js';

const hash64 = 'c'.repeat(64);

const manifest: TraceBundleManifest = {
  schemaVersion: TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
  bundleId: 'bundle-1',
  traceId: 'trace-1',
  createdAt: '2026-04-20T00:00:00Z',
  policy: 'strict',
  files: [{ path: 'trace.json', contentHash: hash64, byteLength: 10 }],
};

const exportRequest: TraceBundleExportRequest = {
  schemaVersion: TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION,
  traceId: 'trace-1',
  policy: 'balanced',
  outputPath: '/tmp/out',
  includeArtifacts: false,
};

const exportResult: TraceBundleExportResult = {
  schemaVersion: TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
  bundleId: 'bundle-1',
  traceId: 'trace-1',
  outputPath: '/tmp/out',
  manifest,
};

const previewRequest: RedactionPreviewRequest = {
  schemaVersion: REDACTION_PREVIEW_REQUEST_SCHEMA_VERSION,
  traceId: 'trace-1',
  policy: 'strict',
};

const preview: RedactionPreview = {
  schemaVersion: REDACTION_PREVIEW_SCHEMA_VERSION,
  traceId: 'trace-1',
  policy: 'strict',
  redactedFields: ['args'],
  preservedFields: ['txHash'],
};

describe('Trace bundle schemas', () => {
  it('round-trips a manifest', () => {
    expect(TraceBundleManifestSchema.parse(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  });

  it('round-trips an export request', () => {
    expect(TraceBundleExportRequestSchema.parse(JSON.parse(JSON.stringify(exportRequest)))).toEqual(exportRequest);
  });

  it('round-trips an export result', () => {
    expect(TraceBundleExportResultSchema.parse(JSON.parse(JSON.stringify(exportResult)))).toEqual(exportResult);
  });

  it('round-trips a redaction preview request', () => {
    expect(RedactionPreviewRequestSchema.parse(JSON.parse(JSON.stringify(previewRequest)))).toEqual(previewRequest);
  });

  it('round-trips a redaction preview', () => {
    expect(RedactionPreviewSchema.parse(JSON.parse(JSON.stringify(preview)))).toEqual(preview);
  });

  it('rejects a non-hex contentHash', () => {
    const bad = { ...manifest, files: [{ path: 'trace.json', contentHash: 'zz', byteLength: 10 }] };
    expect(() => TraceBundleManifestSchema.parse(bad)).toThrow();
  });

  it('rejects a contentHash with a 0x prefix', () => {
    const bad = { ...manifest, files: [{ path: 'trace.json', contentHash: '0x' + 'a'.repeat(62), byteLength: 10 }] };
    expect(() => TraceBundleManifestSchema.parse(bad)).toThrow();
  });

  it('rejects unknown schemaVersion on every top-level schema', () => {
    expect(() => TraceBundleManifestSchema.parse({ ...manifest, schemaVersion: 'aztec.bundle.v2' })).toThrow();
    expect(() =>
      TraceBundleExportRequestSchema.parse({ ...exportRequest, schemaVersion: 'aztec.bundle_export_request.v2' }),
    ).toThrow();
    expect(() =>
      TraceBundleExportResultSchema.parse({ ...exportResult, schemaVersion: 'aztec.bundle_export_result.v2' }),
    ).toThrow();
    expect(() =>
      RedactionPreviewRequestSchema.parse({
        ...previewRequest,
        schemaVersion: 'aztec.redaction_preview_request.v2',
      }),
    ).toThrow();
    expect(() =>
      RedactionPreviewSchema.parse({ ...preview, schemaVersion: 'aztec.redaction_preview.v2' }),
    ).toThrow();
  });
});
