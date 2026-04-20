import { AZTEC_TRACE_ERROR_SCHEMA_VERSION } from './errors.js';
import { REDACTION_MANIFEST_SCHEMA_VERSION } from './redaction.js';
import { SOURCE_REF_SCHEMA_VERSION } from './source.js';
import { AZTEC_TRACE_SCHEMA_VERSION, type AztecTrace, AztecTraceSchema } from './trace.js';

const saltHex = 'b'.repeat(64);

const fullTrace: AztecTrace = {
  schemaVersion: AZTEC_TRACE_SCHEMA_VERSION,
  traceId: 'trace-1',
  provisionalTraceId: 'prov-1',
  txHash: '0xabc',
  network: { chainId: 1, rollupVersion: 2, nodeVersion: 'v1.0.0' },
  createdAt: '2026-04-20T00:00:00Z',
  completedAt: '2026-04-20T00:00:01Z',
  status: 'ok',
  lifecycleState: 'simulated',
  fingerprints: { argsDigest: 'deadbeef' },
  anchors: {
    txHash: '0xabc',
    l2BlockNumber: 1,
    attributes: { foo: 'bar' },
  },
  spans: [
    {
      spanId: 'span-1',
      name: 'pxe.simulate',
      component: 'pxe',
      phase: 'pxe_execution',
      kind: 'private',
      sensitivity: 'redacted',
      status: 'ok',
      startedAt: '2026-04-20T00:00:00Z',
      endedAt: '2026-04-20T00:00:00.500Z',
      attributes: { foo: 1 },
      events: [{ name: 'evt', timestamp: '2026-04-20T00:00:00.250Z' }],
      links: [{ traceId: 'trace-0', spanId: 'span-0' }],
      sourceRef: {
        schemaVersion: SOURCE_REF_SCHEMA_VERSION,
        artifactId: 'artifact-1',
        contractName: 'Token',
      },
      callFrameId: 'cf-1',
    },
  ],
  callFrames: [
    {
      callFrameId: 'cf-1',
      kind: 'private',
      sensitivity: 'secret_local',
      contractAddress: '0xdead',
      functionSelector: '0xbeef',
      attributes: { n: 1 },
    },
  ],
  errors: [
    {
      schemaVersion: AZTEC_TRACE_ERROR_SCHEMA_VERSION,
      errorId: 'e-1',
      code: 'AZDBG_UNKNOWN',
      message: 'x',
      category: 'unknown',
      severity: 'warn',
      retryable: false,
    },
  ],
  artifacts: [{ artifactId: 'artifact-1', name: 'Token', byteLength: 100 }],
  redaction: {
    schemaVersion: REDACTION_MANIFEST_SCHEMA_VERSION,
    policy: 'strict',
    saltHex,
    digestAlgorithm: 'HMAC-SHA256',
    redactedFields: ['args'],
    preservedFields: ['txHash'],
    createdAt: '2026-04-20T00:00:00Z',
  },
};

describe('AztecTraceSchema', () => {
  it('round-trips a fully populated trace through JSON', () => {
    const roundTripped = AztecTraceSchema.parse(JSON.parse(JSON.stringify(fullTrace)));
    expect(roundTripped).toEqual(fullTrace);
  });

  it('rejects an unknown schemaVersion', () => {
    expect(() => AztecTraceSchema.parse({ ...fullTrace, schemaVersion: 'aztec.trace.v2' })).toThrow();
  });

  it('rejects raw bigint attributes before JSON round-trip', () => {
    const badSpan = { ...fullTrace.spans[0], attributes: { foo: 1n } };
    expect(() => AztecTraceSchema.parse({ ...fullTrace, spans: [badSpan] })).toThrow();
  });

  it('rejects Buffer in attributes', () => {
    const badSpan = { ...fullTrace.spans[0], attributes: { foo: Buffer.from([1]) as unknown as string } };
    expect(() => AztecTraceSchema.parse({ ...fullTrace, spans: [badSpan] })).toThrow();
  });
});
