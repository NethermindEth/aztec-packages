import {
  AZTEC_TRACE_ERROR_SCHEMA_VERSION,
  AZTEC_TRACE_SCHEMA_VERSION,
  type AztecCallFrame,
  type AztecSpan,
  type AztecTrace,
  type AztecTraceError,
  AztecTraceSchema,
  REDACTION_MANIFEST_SCHEMA_VERSION,
} from '@aztec/stdlib/debug';

import { redactTrace } from './redaction.js';

const FIXED_SALT_A = Buffer.alloc(32, 0xaa);
const FIXED_SALT_B = Buffer.alloc(32, 0xbb);
const FIXED_NOW = () => '2026-04-21T00:00:00.000Z';

function makeSpan(partial: Partial<AztecSpan> = {}): AztecSpan {
  return {
    spanId: partial.spanId ?? 'span-1',
    name: partial.name ?? 'pxe.simulate_tx',
    component: partial.component ?? 'pxe',
    phase: partial.phase ?? 'pxe_execution',
    kind: partial.kind,
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

describe('redactTrace (strict)', () => {
  it('refuses a salt that is not exactly 32 bytes', () => {
    const trace = makeTrace();
    expect(() => redactTrace(trace, 'strict', Buffer.alloc(16))).toThrow();
  });

  it('does not mutate the input trace', () => {
    const input = makeTrace({
      spans: [
        makeSpan({
          attributes: { 'aztec.pxe.args': 'secret_args_value' },
        }),
      ],
    });
    const snapshot = JSON.stringify(input);
    const out = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(out.trace).toBeDefined();
  });

  it('produces a trace that passes AztecTraceSchema', () => {
    const input = makeTrace({
      spans: [
        makeSpan({
          attributes: {
            'aztec.pxe.args': 'abc',
            'aztec.pxe.job_id': 'job-1',
          },
        }),
      ],
      callFrames: [
        makeFrame({
          contractAddress: '0xabc',
          functionSelector: '0x11',
          attributes: {
            'aztec.private.args_hash': '0xdead',
            'aztec.private.returns_hash': '0xbeef',
          },
        }),
      ],
      errors: [makeError({ message: 'note_plaintext leak' })],
    });
    const out = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    expect(out.trace).toBeDefined();
    expect(() => AztecTraceSchema.parse(out.trace)).not.toThrow();
  });

  it('drops dropKeys entirely and digests remaining secret-local attributes', () => {
    const input = makeTrace({
      spans: [
        makeSpan({
          attributes: {
            'aztec.pxe.args': 'sensitive_value',
            'aztec.wallet.from_address': 'wallet_from_address_secret_value',
            'a.auth_witness.ref': 'auth_witness_secret',
            'b.capsule.bytes': 'capsule_data',
            'c.note.plaintext': 'note_plaintext',
            'd.tagging.ref': 'tagging_secret',
            'e.shared_secret.ref': 'shared_secret_value',
            'f.witness.ref': 'partial_witness_value',
            'aztec.pxe.job_id': 'job-1',
          },
        }),
      ],
    });
    const out = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    const blob = JSON.stringify(out.trace);
    for (const banned of [
      'auth_witness_secret',
      'partial_witness_value',
      'capsule_data',
      'note_plaintext',
      'tagging_secret',
      'shared_secret_value',
      'wallet_from_address_secret_value',
      'sensitive_value',
    ]) {
      expect(blob).not.toContain(banned);
    }
  });

  it('digests args_hash/returns_hash into argsDigest/returnDigest on call frames', () => {
    const input = makeTrace({
      callFrames: [
        makeFrame({
          contractAddress: '0xabc',
          functionSelector: '0x11',
          attributes: {
            'aztec.private.args_hash': '0xdead',
            'aztec.private.returns_hash': '0xbeef',
          },
        }),
      ],
    });
    const out = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    const frame = out.trace!.callFrames[0];
    expect(frame.argsDigest).toMatch(/^[0-9a-f]{32}$/);
    expect(frame.returnDigest).toMatch(/^[0-9a-f]{32}$/);
    expect(frame.attributes?.['aztec.private.args_hash']).toBeUndefined();
    expect(frame.attributes?.['aztec.private.returns_hash']).toBeUndefined();
  });

  it('digests error message and evidence but keeps code/category/severity/retryable', () => {
    const input = makeTrace({
      errors: [
        makeError({
          code: 'AZPXE_ORACLE_VERSION_MISMATCH',
          category: 'pxe',
          severity: 'error',
          retryable: false,
          message: 'oracle leak',
          evidence: { offending: 'leak_value' },
          attributes: { secret: 'attr_leak' },
        }),
      ],
    });
    const out = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    const err = out.trace!.errors[0];
    expect(err.code).toBe('AZPXE_ORACLE_VERSION_MISMATCH');
    expect(err.category).toBe('pxe');
    expect(err.severity).toBe('error');
    expect(err.retryable).toBe(false);
    expect(err.message).not.toBe('oracle leak');
    expect(err.evidence?.offending).not.toBe('leak_value');
    expect(err.attributes).toBeUndefined();
  });

  it('is deterministic: same input + same salt → byte-equal output', () => {
    const input = makeTrace({
      spans: [
        makeSpan({
          attributes: { 'aztec.pxe.args': 'x' },
        }),
      ],
    });
    const a = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    const b = redactTrace(JSON.parse(JSON.stringify(input)), 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    expect(JSON.stringify(a.trace)).toBe(JSON.stringify(b.trace));
    expect(JSON.stringify(a.manifest)).toBe(JSON.stringify(b.manifest));
  });

  it('is unlinkable: different salts produce different digests', () => {
    const input = makeTrace({
      callFrames: [
        makeFrame({
          attributes: { 'aztec.private.args_hash': '0xdead' },
        }),
      ],
    });
    const a = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    const b = redactTrace(input, 'strict', FIXED_SALT_B, { now: FIXED_NOW });
    expect(a.trace!.callFrames[0].argsDigest).not.toBe(b.trace!.callFrames[0].argsDigest);
  });

  it('preview mode returns only field paths, no trace', () => {
    const input = makeTrace({ spans: [makeSpan({ attributes: { 'aztec.pxe.args': 'x' } })] });
    const out = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW, preview: true });
    expect(out.trace).toBeUndefined();
    expect(out.redactedFields.length).toBeGreaterThan(0);
  });

  it('redactedFields and preservedFields are sorted lexicographically', () => {
    const input = makeTrace({
      spans: [
        makeSpan({
          attributes: {
            z: '1',
            a: '2',
            m: '3',
          },
        }),
      ],
    });
    const out = redactTrace(input, 'strict', FIXED_SALT_A, { now: FIXED_NOW });
    expect([...out.redactedFields]).toEqual([...out.redactedFields].slice().sort());
    expect([...out.preservedFields]).toEqual([...out.preservedFields].slice().sort());
  });
});

describe('redactTrace (balanced)', () => {
  it('preserves whitelisted attributes raw but still digests other secret-local attributes', () => {
    const input = makeTrace({
      spans: [
        makeSpan({
          attributes: {
            'aztec.tx.origin': '0xORIGIN',
            'aztec.pxe.job_id': 'job-xyz',
            'aztec.pxe.queue_length_before': 3,
            'aztec.pxe.args': 'secret_value',
            'aztec.private.note_hashes.count': 2,
          },
        }),
      ],
    });
    const out = redactTrace(input, 'balanced', FIXED_SALT_A, { now: FIXED_NOW });
    const attrs = out.trace!.spans[0].attributes!;
    expect(attrs['aztec.tx.origin']).toBe('0xORIGIN');
    expect(attrs['aztec.pxe.job_id']).toBe('job-xyz');
    expect(attrs['aztec.pxe.queue_length_before']).toBe(3);
    expect(attrs['aztec.private.note_hashes.count']).toBe(2);
    expect(attrs['aztec.pxe.args']).not.toBe('secret_value');
  });
});

describe('redactTrace (local_full)', () => {
  it('returns a deep clone unchanged with zero redactions', () => {
    const input = makeTrace({
      spans: [makeSpan({ attributes: { 'aztec.pxe.args': 'secret_value' } })],
      callFrames: [
        makeFrame({
          attributes: {
            'aztec.private.args_hash': '0xdead',
            'aztec.private.returns_hash': '0xbeef',
          },
        }),
      ],
    });
    const out = redactTrace(input, 'local_full', FIXED_SALT_A, { now: FIXED_NOW });
    expect(out.trace!.spans[0].attributes?.['aztec.pxe.args']).toBe('secret_value');
    expect(out.trace!.callFrames[0].attributes?.['aztec.private.args_hash']).toBe('0xdead');
    expect(out.trace!.callFrames[0].attributes?.['aztec.private.returns_hash']).toBe('0xbeef');
    expect(out.trace!.callFrames[0].argsDigest).toBeUndefined();
    expect(out.trace!.callFrames[0].returnDigest).toBeUndefined();
    expect(out.redactedFields.length).toBe(0);
    expect(out.preservedFields.length).toBeGreaterThan(0);
  });
});
