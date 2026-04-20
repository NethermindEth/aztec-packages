import { AztecTraceSchema } from '@aztec/stdlib/debug';

import type { TraceRetentionConfig } from '../recorder/kv_recorder.js';
import { InMemoryTraceRecorder } from './in_memory_recorder.js';

const retention: TraceRetentionConfig = {
  maxTraces: 3,
  maxSpansPerTrace: 2,
  maxEventsPerSpan: 2,
  maxErrorsPerTrace: 2,
};

describe('InMemoryTraceRecorder', () => {
  let recorder: InMemoryTraceRecorder;

  beforeEach(() => {
    recorder = new InMemoryTraceRecorder(retention);
  });

  it('rejects non-positive retention limits', () => {
    expect(() => new InMemoryTraceRecorder({ ...retention, maxTraces: 0 })).toThrow();
    expect(() => new InMemoryTraceRecorder({ ...retention, maxSpansPerTrace: 0 })).toThrow();
    expect(() => new InMemoryTraceRecorder({ ...retention, maxEventsPerSpan: 0 })).toThrow();
    expect(() => new InMemoryTraceRecorder({ ...retention, maxErrorsPerTrace: 0 })).toThrow();
  });

  it('looks up a trace by trace id and provisional id', async () => {
    const handle = await recorder.startTrace({ network: { chainId: 1 } });
    expect((await recorder.getTrace(handle.traceId))?.traceId).toBe(handle.traceId);
    expect((await recorder.getTrace(handle.provisionalTraceId))?.traceId).toBe(handle.traceId);
  });

  it('bindTxHash wires the tx-hash index', async () => {
    const handle = await recorder.startTrace({ network: { chainId: 1 } });
    await recorder.bindTxHash(handle.provisionalTraceId, '0xabc');
    expect((await recorder.getTrace('0xabc'))?.traceId).toBe(handle.traceId);
  });

  it('rebinding a tx hash removes the old tx-hash index', async () => {
    const handle = await recorder.startTrace({ network: { chainId: 1 }, anchors: { txHash: '0xold' } });
    await recorder.bindTxHash(handle.provisionalTraceId, '0xnew');
    expect(await recorder.getTrace('0xold')).toBeUndefined();
    expect((await recorder.getTrace('0xnew'))?.traceId).toBe(handle.traceId);
  });

  it('replacing a trace id removes the old provisional index', async () => {
    await recorder.startTrace({ traceId: 'trace', provisionalTraceId: 'prov-old', network: { chainId: 1 } });
    await recorder.startTrace({ traceId: 'trace', provisionalTraceId: 'prov-new', network: { chainId: 1 } });
    expect(await recorder.getTrace('prov-old')).toBeUndefined();
    expect((await recorder.getTrace('prov-new'))?.traceId).toBe('trace');
  });

  it('bindTxHash with unknown provisional id is a no-op', async () => {
    await expect(recorder.bindTxHash('unknown', '0xabc')).resolves.toBeUndefined();
    expect(await recorder.getTrace('0xabc')).toBeUndefined();
  });

  it('evicts the oldest trace FIFO-style', async () => {
    const h1 = await recorder.startTrace({ traceId: 't1', network: { chainId: 1 } });
    await recorder.startTrace({ traceId: 't2', network: { chainId: 1 } });
    await recorder.startTrace({ traceId: 't3', network: { chainId: 1 } });
    await recorder.startTrace({ traceId: 't4', network: { chainId: 1 } });
    expect(await recorder.getTrace(h1.traceId)).toBeUndefined();
  });

  it('drops spans, events, and errors beyond caps', async () => {
    const trace = await recorder.startTrace({ network: { chainId: 1 } });
    const span = await recorder.startSpan(trace, {
      name: 's1',
      component: 'pxe',
      phase: 'pxe_execution',
      sensitivity: 'redacted',
      status: 'ok',
    });
    await recorder.startSpan(trace, {
      name: 's2',
      component: 'pxe',
      phase: 'pxe_execution',
      sensitivity: 'redacted',
      status: 'ok',
    });
    await recorder.startSpan(trace, {
      name: 's3',
      component: 'pxe',
      phase: 'pxe_execution',
      sensitivity: 'redacted',
      status: 'ok',
    });

    await recorder.recordEvent(span, { name: 'e1', timestamp: '2026-04-20T00:00:00Z' });
    await recorder.recordEvent(span, { name: 'e2', timestamp: '2026-04-20T00:00:00Z' });
    await recorder.recordEvent(span, { name: 'e3', timestamp: '2026-04-20T00:00:00Z' });

    await recorder.recordError(trace, {
      schemaVersion: 'aztec.error.v1',
      errorId: 'e1',
      code: 'AZDBG_UNKNOWN',
      message: 'm',
      category: 'unknown',
      severity: 'warn',
      retryable: false,
    });
    await recorder.recordError(trace, {
      schemaVersion: 'aztec.error.v1',
      errorId: 'e2',
      code: 'AZDBG_UNKNOWN',
      message: 'm',
      category: 'unknown',
      severity: 'warn',
      retryable: false,
    });
    await recorder.recordError(trace, {
      schemaVersion: 'aztec.error.v1',
      errorId: 'e3',
      code: 'AZDBG_UNKNOWN',
      message: 'm',
      category: 'unknown',
      severity: 'warn',
      retryable: false,
    });

    const stored = await recorder.getTrace(trace.traceId);
    expect(stored?.spans.length).toBe(2);
    expect(stored?.spans[0].events?.length).toBe(2);
    expect(stored?.errors.length).toBe(2);
  });

  it('caps events supplied when a span starts', async () => {
    const trace = await recorder.startTrace({ network: { chainId: 1 } });
    await recorder.startSpan(trace, {
      name: 's1',
      component: 'pxe',
      phase: 'pxe_execution',
      sensitivity: 'redacted',
      status: 'ok',
      events: [
        { name: 'e1', timestamp: '2026-04-20T00:00:00Z' },
        { name: 'e2', timestamp: '2026-04-20T00:00:00Z' },
        { name: 'e3', timestamp: '2026-04-20T00:00:00Z' },
      ],
    });
    expect((await recorder.getTrace(trace.traceId))?.spans[0].events?.length).toBe(2);
  });

  it('recordError flips trace status to error and appends the error', async () => {
    const trace = await recorder.startTrace({ network: { chainId: 1 } });
    expect((await recorder.getTrace(trace.traceId))?.status).toBe('ok');
    await recorder.recordError(trace, {
      schemaVersion: 'aztec.error.v1',
      errorId: 'e1',
      code: 'AZDBG_UNKNOWN',
      message: 'boom',
      category: 'unknown',
      severity: 'error',
      retryable: false,
    });
    const stored = await recorder.getTrace(trace.traceId);
    expect(stored?.status).toBe('error');
    expect(stored?.errors.length).toBe(1);
  });

  it('clear() removes all traces', async () => {
    const handle = await recorder.startTrace({ network: { chainId: 1 } });
    await recorder.bindTxHash(handle.provisionalTraceId, '0xabc');
    await recorder.clear();
    expect(await recorder.getTrace(handle.traceId)).toBeUndefined();
    expect(await recorder.getTrace(handle.provisionalTraceId)).toBeUndefined();
    expect(await recorder.getTrace('0xabc')).toBeUndefined();
  });

  it('rejects a non-positive maxCallFramesPerTrace', () => {
    expect(() => new InMemoryTraceRecorder({ ...retention, maxCallFramesPerTrace: 0 })).toThrow();
    expect(() => new InMemoryTraceRecorder({ ...retention, maxCallFramesPerTrace: -1 })).toThrow();
  });

  it('appendCallFrames defaults its cap to maxSpansPerTrace', async () => {
    const trace = await recorder.startTrace({ network: { chainId: 1 } });
    await recorder.appendCallFrames(trace, [
      { callFrameId: 'f1', kind: 'private', sensitivity: 'secret_local' },
      { callFrameId: 'f2', kind: 'private', sensitivity: 'secret_local' },
      { callFrameId: 'f3', kind: 'private', sensitivity: 'secret_local' },
    ]);
    const stored = await recorder.getTrace(trace.traceId);
    expect(stored?.callFrames.length).toBe(retention.maxSpansPerTrace);
    expect(stored?.callFrames[0].callFrameId).toBe('f1');
    expect(stored?.callFrames[1].callFrameId).toBe('f2');
  });

  it('appendCallFrames honors an explicit maxCallFramesPerTrace', async () => {
    const r = new InMemoryTraceRecorder({ ...retention, maxCallFramesPerTrace: 1 });
    const trace = await r.startTrace({ network: { chainId: 1 } });
    await r.appendCallFrames(trace, [
      { callFrameId: 'f1', kind: 'private', sensitivity: 'secret_local' },
      { callFrameId: 'f2', kind: 'private', sensitivity: 'secret_local' },
    ]);
    const stored = await r.getTrace(trace.traceId);
    expect(stored?.callFrames.length).toBe(1);
    expect(stored?.callFrames[0].callFrameId).toBe('f1');
  });

  it('appendCallFrames on an unknown trace is a no-op', async () => {
    await expect(
      recorder.appendCallFrames({ traceId: 'unknown', provisionalTraceId: 'unknown' }, [
        { callFrameId: 'f1', kind: 'private', sensitivity: 'secret_local' },
      ]),
    ).resolves.toBeUndefined();
  });

  it('stored traces survive JSON round-trip through AztecTraceSchema', async () => {
    const handle = await recorder.startTrace({ network: { chainId: 1 } });
    await recorder.startSpan(handle, {
      name: 's1',
      component: 'pxe',
      phase: 'pxe_execution',
      sensitivity: 'redacted',
      status: 'ok',
    });
    const stored = await recorder.getTrace(handle.traceId);
    expect(stored).toBeDefined();
    const round = AztecTraceSchema.parse(JSON.parse(JSON.stringify(stored)));
    expect(round.traceId).toBe(handle.traceId);
  });
});
