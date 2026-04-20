import {
  AZTEC_TRACE_ERROR_SCHEMA_VERSION,
  AZTEC_TRACE_SCHEMA_VERSION,
  type AztecCallFrame,
  type AztecSpan,
  AztecSpanSchema,
  type AztecTrace,
  type AztecTraceError,
  AztecTraceSchema,
  REDACTION_MANIFEST_SCHEMA_VERSION,
  SOURCE_REF_SCHEMA_VERSION,
  TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION,
  type TraceBundleExportRequest,
  TraceBundleExportResultSchema,
  TraceBundlePaths,
} from '@aztec/stdlib/debug';

import { buildLocalBundle } from './bundle_exporter.js';

const FIXED_SALT = Buffer.alloc(32, 0x42);
const FIXED_NOW = () => '2026-04-21T00:00:00.000Z';

function strictReq(overrides: Partial<TraceBundleExportRequest> = {}): TraceBundleExportRequest {
  return {
    schemaVersion: TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION,
    traceId: overrides.traceId ?? 't1',
    policy: overrides.policy ?? 'strict',
    outputPath: overrides.outputPath,
    includeArtifacts: overrides.includeArtifacts,
  };
}

function makeSpan(partial: Partial<AztecSpan> = {}): AztecSpan {
  return {
    spanId: partial.spanId ?? 'span-a',
    name: partial.name ?? 'pxe.simulate_tx',
    component: partial.component ?? 'pxe',
    phase: partial.phase ?? 'pxe_execution',
    kind: partial.kind ?? 'private',
    sensitivity: partial.sensitivity ?? 'secret_local',
    status: partial.status ?? 'ok',
    startedAt: partial.startedAt ?? '2026-04-21T00:00:00.000Z',
    endedAt: partial.endedAt,
    attributes: partial.attributes,
    events: partial.events,
    parentSpanId: partial.parentSpanId,
    links: partial.links,
    sourceRef: partial.sourceRef,
    callFrameId: partial.callFrameId,
  };
}

function makeFrame(partial: Partial<AztecCallFrame> = {}): AztecCallFrame {
  return {
    callFrameId: partial.callFrameId ?? 'frame-1',
    kind: partial.kind ?? 'private',
    sensitivity: partial.sensitivity ?? 'secret_local',
    contractAddress: partial.contractAddress,
    functionSelector: partial.functionSelector,
    parentCallFrameId: partial.parentCallFrameId,
    attributes: partial.attributes,
    sourceRef: partial.sourceRef,
    argsDigest: partial.argsDigest,
    returnDigest: partial.returnDigest,
  };
}

function makeError(partial: Partial<AztecTraceError> = {}): AztecTraceError {
  return {
    schemaVersion: AZTEC_TRACE_ERROR_SCHEMA_VERSION,
    errorId: partial.errorId ?? 'err-1',
    code: partial.code ?? 'AZDBG_UNKNOWN',
    message: partial.message ?? 'boom',
    category: partial.category ?? 'unknown',
    severity: partial.severity ?? 'error',
    retryable: partial.retryable ?? false,
    errorType: partial.errorType,
    spanId: partial.spanId,
    callFrameId: partial.callFrameId,
    remediationHint: partial.remediationHint,
    sourceRef: partial.sourceRef,
    evidence: partial.evidence,
    attributes: partial.attributes,
  };
}

function makeTrace(overrides: Partial<AztecTrace> = {}): AztecTrace {
  return {
    schemaVersion: AZTEC_TRACE_SCHEMA_VERSION,
    traceId: 't1',
    provisionalTraceId: 'pt1',
    network: { chainId: 1 },
    createdAt: '2026-04-21T00:00:00.000Z',
    status: 'ok',
    anchors: { provisionalTraceId: 'pt1' },
    spans: [],
    callFrames: [],
    errors: [],
    artifacts: [],
    redaction: {
      schemaVersion: REDACTION_MANIFEST_SCHEMA_VERSION,
      policy: 'strict',
      saltHex: '00'.repeat(32),
      digestAlgorithm: 'HMAC-SHA256',
      redactedFields: [],
      preservedFields: [],
      createdAt: '2026-04-21T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('buildLocalBundle', () => {
  it('produces the expected file set under strict', () => {
    const trace = makeTrace({ spans: [makeSpan()], callFrames: [makeFrame()], errors: [makeError()] });
    const { attachments, result } = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    for (const path of [
      TraceBundlePaths.manifest,
      TraceBundlePaths.trace,
      TraceBundlePaths.spans,
      TraceBundlePaths.callFrames,
      TraceBundlePaths.errors,
      TraceBundlePaths.redaction,
      TraceBundlePaths.sourceIndex,
    ]) {
      expect(attachments.has(path)).toBe(true);
    }
    // Manifest file itself is not in result.manifest.files.
    const listed = result.manifest.files.map(f => f.path);
    expect(listed).not.toContain(TraceBundlePaths.manifest);
    expect(listed).toContain(TraceBundlePaths.trace);
    expect(listed).toContain(TraceBundlePaths.spans);
  });

  it('returned result parses through TraceBundleExportResultSchema', () => {
    const trace = makeTrace();
    const out = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    expect(() => TraceBundleExportResultSchema.parse(out.result)).not.toThrow();
  });

  it('attachments.get(trace.json) parses through AztecTraceSchema', () => {
    const trace = makeTrace();
    const { attachments } = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    const bytes = attachments.get(TraceBundlePaths.trace)!;
    expect(() => AztecTraceSchema.parse(JSON.parse(bytes.toString('utf8')))).not.toThrow();
  });

  it('spans.ndjson validates line-by-line through AztecSpanSchema', () => {
    const trace = makeTrace({ spans: [makeSpan({ spanId: 'a' }), makeSpan({ spanId: 'b', name: 'pxe.job' })] });
    const { attachments } = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    const lines = attachments
      .get(TraceBundlePaths.spans)!
      .toString('utf8')
      .split('\n')
      .filter(l => l.length > 0);
    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(() => AztecSpanSchema.parse(JSON.parse(line))).not.toThrow();
    }
  });

  it('is deterministic: two builds with the same salt + clock produce byte-equal attachments', () => {
    const trace = makeTrace({
      spans: [makeSpan({ attributes: { 'aztec.pxe.args': 'x' } })],
    });
    const a = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    const b = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    for (const [path, bytesA] of a.attachments) {
      const bytesB = b.attachments.get(path)!;
      expect(bytesA.equals(bytesB)).toBe(true);
    }
    expect(a.result.bundleId).toBe(b.result.bundleId);
  });

  it('is unlinkable: different random salts produce different content hashes', () => {
    const trace = makeTrace({
      callFrames: [makeFrame({ attributes: { 'aztec.private.args_hash': '0xdead' } })],
    });
    const a = buildLocalBundle(trace, strictReq(), { salt: Buffer.alloc(32, 0x11), now: FIXED_NOW });
    const b = buildLocalBundle(trace, strictReq(), { salt: Buffer.alloc(32, 0x22), now: FIXED_NOW });
    const aHashes = a.result.manifest.files.map(f => f.contentHash);
    const bHashes = b.result.manifest.files.map(f => f.contentHash);
    expect(aHashes).not.toEqual(bHashes);
  });

  it('refuses balanced and local_full with AZSEC_UNSAFE_EXPORT_CONTEXT', () => {
    const trace = makeTrace();
    try {
      buildLocalBundle(trace, strictReq({ policy: 'balanced' }), { salt: FIXED_SALT, now: FIXED_NOW });
      fail('expected to throw');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('AZSEC_UNSAFE_EXPORT_CONTEXT');
    }
    try {
      buildLocalBundle(trace, strictReq({ policy: 'local_full' }), { salt: FIXED_SALT, now: FIXED_NOW });
      fail('expected to throw');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('AZSEC_UNSAFE_EXPORT_CONTEXT');
    }
  });

  it('uses request.outputPath as a label when provided; defaults to memory://<bundleId>', () => {
    const trace = makeTrace();
    const named = buildLocalBundle(trace, strictReq({ outputPath: '/tmp/x.zip' }), {
      salt: FIXED_SALT,
      now: FIXED_NOW,
    });
    expect(named.result.outputPath).toBe('/tmp/x.zip');

    const fallback = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    expect(fallback.result.outputPath).toBe(`memory://${fallback.result.bundleId}`);
  });

  it('no literal secret substring from a rich fixture appears in any attachment under strict', () => {
    // Attribute key names are chosen to match the drop regex without literally
    // containing any of the banned VALUE substrings. Field-path key names may
    // leak into redaction.json per the plan; value bytes must not.
    const trace = makeTrace({
      spans: [
        makeSpan({
          attributes: {
            'aztec.wallet.from_address': 'wallet_from_address_secret_value',
            'aztec.pxe.args': 'shared_secret',
            'my.auth_witness.k': 'auth_witness_secret',
            'my.capsule.k': 'capsule_data',
            'my.note.k': 'note_plaintext',
            'my.tagging.k': 'tagging_secret',
            'my.witness.k': 'partial_witness',
            'innocent.key': 'auth_witness_secret',
          },
          events: [
            {
              name: 'pxe_oracle_fault',
              timestamp: '2026-04-21T00:00:01.000Z',
              attributes: { blob: 'note_plaintext' },
            },
          ],
        }),
      ],
      errors: [makeError({ message: 'capsule_data exposure' })],
    });
    const { attachments } = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    const concatenated = Buffer.concat([...attachments.values()]).toString('utf8');
    for (const banned of [
      'auth_witness_secret',
      'partial_witness',
      'capsule_data',
      'note_plaintext',
      'tagging_secret',
      'shared_secret',
      'wallet_from_address_secret_value',
    ]) {
      expect(concatenated).not.toContain(banned);
    }
  });

  it('builds a source-index from frame sourceRefs', () => {
    const trace = makeTrace({
      callFrames: [
        makeFrame({
          sourceRef: {
            schemaVersion: SOURCE_REF_SCHEMA_VERSION,
            artifactId: 'artifact-1',
            contractName: 'Token',
            functionName: 'transfer',
            path: 'src/token.nr',
            line: 42,
          },
        }),
      ],
    });
    const { attachments } = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    const json = JSON.parse(attachments.get(TraceBundlePaths.sourceIndex)!.toString('utf8'));
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].artifactId).toBe('artifact-1');
    expect(json.entries[0].contractName).toBe('Token');
    expect(json.entries[0].functionName).toBe('transfer');
  });

  it('succeeds for a trace whose frames have no sourceRef', () => {
    const trace = makeTrace({
      callFrames: [makeFrame()],
    });
    const out = buildLocalBundle(trace, strictReq(), { salt: FIXED_SALT, now: FIXED_NOW });
    expect(out.result.bundleId).toBeDefined();
  });
});
