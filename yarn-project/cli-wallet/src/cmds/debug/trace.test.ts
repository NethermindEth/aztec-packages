import {
  AZTEC_TRACE_SCHEMA_VERSION,
  type AztecTrace,
  REDACTION_MANIFEST_SCHEMA_VERSION,
} from '@aztec/stdlib/debug';

import { NO_TRACE_FOUND_ERROR, runDebugTrace } from './trace.js';
import type { DebugSurface } from './types.js';

function makeTrace(traceId: string): AztecTrace {
  return {
    schemaVersion: AZTEC_TRACE_SCHEMA_VERSION,
    traceId,
    provisionalTraceId: 'prov-1',
    txHash: '0xabc',
    network: { chainId: 1 },
    createdAt: '2026-04-20T00:00:00Z',
    status: 'ok',
    anchors: { provisionalTraceId: 'prov-1', txHash: '0xabc' },
    spans: [],
    callFrames: [],
    errors: [],
    artifacts: [],
    redaction: {
      schemaVersion: REDACTION_MANIFEST_SCHEMA_VERSION,
      policy: 'strict',
      saltHex: '0'.repeat(64),
      digestAlgorithm: 'HMAC-SHA256',
      redactedFields: [],
      preservedFields: [],
      createdAt: '2026-04-20T00:00:00Z',
    },
  };
}

function makeFakeDebug(traceOrUndefined: AztecTrace | undefined): DebugSurface {
  return {
    getTrace: (id: string) => Promise.resolve(traceOrUndefined && traceOrUndefined.traceId === id ? traceOrUndefined : undefined),
    redactionPreview: () => Promise.resolve(undefined),
    exportBundle: () => Promise.resolve(undefined),
  };
}

describe('runDebugTrace', () => {
  it('prints the trace as pretty JSON by default', async () => {
    const trace = makeTrace('t1');
    const debug = makeFakeDebug(trace);
    const lines: string[] = [];
    await runDebugTrace(debug, 't1', {}, msg => lines.push(msg));
    const parsed = JSON.parse(lines[0]);
    expect(parsed.traceId).toBe('t1');
    expect(lines[0]).toContain('\n');
  });

  it('emits single-line JSON when --json is set', async () => {
    const trace = makeTrace('t1');
    const debug = makeFakeDebug(trace);
    const lines: string[] = [];
    await runDebugTrace(debug, 't1', { json: true }, msg => lines.push(msg));
    expect(lines[0]).not.toContain('\n');
    expect(JSON.parse(lines[0]).traceId).toBe('t1');
  });

  it('throws the documented no-trace error if getTrace resolves to undefined', async () => {
    const debug = makeFakeDebug(undefined);
    await expect(runDebugTrace(debug, 'missing', {}, () => {})).rejects.toThrow(NO_TRACE_FOUND_ERROR);
  });

  it('passes the identifier unchanged to getTrace (no tx-hash parsing)', async () => {
    const captured: string[] = [];
    const debug: DebugSurface = {
      getTrace: (id: string) => {
        captured.push(id);
        return Promise.resolve(makeTrace(id));
      },
      redactionPreview: () => Promise.resolve(undefined),
      exportBundle: () => Promise.resolve(undefined),
    };
    await runDebugTrace(debug, 'raw-trace-id', {}, () => {});
    expect(captured).toEqual(['raw-trace-id']);
  });
});
