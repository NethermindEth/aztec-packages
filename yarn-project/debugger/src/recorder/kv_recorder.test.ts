import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecTraceSchema } from '@aztec/stdlib/debug';

import { KvTraceRecorder, type TraceRetentionConfig } from './kv_recorder.js';

const retention: TraceRetentionConfig = {
  maxTraces: 3,
  maxSpansPerTrace: 2,
  maxEventsPerSpan: 2,
  maxErrorsPerTrace: 2,
};

describe('KvTraceRecorder', () => {
  let store: AztecAsyncKVStore;
  let recorder: KvTraceRecorder;

  beforeEach(async () => {
    store = await openTmpStore('kv-trace-recorder-test');
    recorder = new KvTraceRecorder(store, retention);
  });

  afterEach(async () => {
    await store.close();
  });

  it('rejects non-positive retention limits', () => {
    expect(() => new KvTraceRecorder(store, { ...retention, maxTraces: 0 })).toThrow();
    expect(() => new KvTraceRecorder(store, { ...retention, maxSpansPerTrace: -1 })).toThrow();
    expect(() => new KvTraceRecorder(store, { ...retention, maxEventsPerSpan: 0 })).toThrow();
    expect(() => new KvTraceRecorder(store, { ...retention, maxErrorsPerTrace: 0 })).toThrow();
  });

  it('looks up a started trace by trace id and provisional id', async () => {
    const handle = await recorder.startTrace({ network: { chainId: 1 } });
    const byId = await recorder.getTrace(handle.traceId);
    const byProv = await recorder.getTrace(handle.provisionalTraceId);
    expect(byId?.traceId).toBe(handle.traceId);
    expect(byProv?.traceId).toBe(handle.traceId);
  });

  it('binds a tx hash so the trace is retrievable by it', async () => {
    const handle = await recorder.startTrace({ network: { chainId: 1 } });
    await recorder.bindTxHash(handle.provisionalTraceId, '0xdeadbeef');
    const byTx = await recorder.getTrace('0xdeadbeef');
    expect(byTx?.traceId).toBe(handle.traceId);
    expect(byTx?.txHash).toBe('0xdeadbeef');
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

  it('bindTxHash with an unknown provisional id is a no-op', async () => {
    await expect(recorder.bindTxHash('unknown-prov', '0xabc')).resolves.toBeUndefined();
    expect(await recorder.getTrace('0xabc')).toBeUndefined();
  });

  it('clear() removes debugger keys but leaves an unrelated map intact', async () => {
    const unrelated = store.openMap<string, string>('unrelated');
    await unrelated.set('k', 'v');

    const handle = await recorder.startTrace({ network: { chainId: 1 } });
    await recorder.bindTxHash(handle.provisionalTraceId, '0xaaa');
    expect(await recorder.getTrace(handle.traceId)).toBeDefined();

    await recorder.clear();

    expect(await recorder.getTrace(handle.traceId)).toBeUndefined();
    expect(await recorder.getTrace(handle.provisionalTraceId)).toBeUndefined();
    expect(await recorder.getTrace('0xaaa')).toBeUndefined();
    expect(await unrelated.getAsync('k')).toBe('v');
  });

  it('evicts the oldest trace when maxTraces is exceeded (FIFO)', async () => {
    const h1 = await recorder.startTrace({ traceId: 't1', network: { chainId: 1 } });
    const h2 = await recorder.startTrace({ traceId: 't2', network: { chainId: 1 } });
    const h3 = await recorder.startTrace({ traceId: 't3', network: { chainId: 1 } });
    const h4 = await recorder.startTrace({ traceId: 't4', network: { chainId: 1 } });

    expect(await recorder.getTrace(h1.traceId)).toBeUndefined();
    expect(await recorder.getTrace(h1.provisionalTraceId)).toBeUndefined();
    expect(await recorder.getTrace(h2.traceId)).toBeDefined();
    expect(await recorder.getTrace(h3.traceId)).toBeDefined();
    expect(await recorder.getTrace(h4.traceId)).toBeDefined();
  });

  it('drops spans, events, and errors beyond caps without throwing', async () => {
    const trace = await recorder.startTrace({ network: { chainId: 1 } });
    const span1 = await recorder.startSpan(trace, {
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
    // Third span should be silently dropped.
    await recorder.startSpan(trace, {
      name: 's3',
      component: 'pxe',
      phase: 'pxe_execution',
      sensitivity: 'redacted',
      status: 'ok',
    });

    await recorder.recordEvent(span1, { name: 'e1', timestamp: '2026-04-20T00:00:00Z' });
    await recorder.recordEvent(span1, { name: 'e2', timestamp: '2026-04-20T00:00:01Z' });
    await recorder.recordEvent(span1, { name: 'e3', timestamp: '2026-04-20T00:00:02Z' });

    await recorder.recordError(trace, {
      schemaVersion: 'aztec.error.v1',
      errorId: 'er1',
      code: 'AZDBG_UNKNOWN',
      message: 'm',
      category: 'unknown',
      severity: 'warn',
      retryable: false,
    });
    await recorder.recordError(trace, {
      schemaVersion: 'aztec.error.v1',
      errorId: 'er2',
      code: 'AZDBG_UNKNOWN',
      message: 'm',
      category: 'unknown',
      severity: 'warn',
      retryable: false,
    });
    await recorder.recordError(trace, {
      schemaVersion: 'aztec.error.v1',
      errorId: 'er3',
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
        { name: 'e2', timestamp: '2026-04-20T00:00:01Z' },
        { name: 'e3', timestamp: '2026-04-20T00:00:02Z' },
      ],
    });
    expect((await recorder.getTrace(trace.traceId))?.spans[0].events?.length).toBe(2);
  });

  it('rejects a non-positive maxCallFramesPerTrace', () => {
    expect(() => new KvTraceRecorder(store, { ...retention, maxCallFramesPerTrace: 0 })).toThrow();
    expect(() => new KvTraceRecorder(store, { ...retention, maxCallFramesPerTrace: -1 })).toThrow();
  });

  it('appendCallFrames defaults its cap to maxSpansPerTrace', async () => {
    const handle = await recorder.startTrace({ network: { chainId: 1 } });
    await recorder.appendCallFrames(handle, [
      {
        callFrameId: 'f1',
        kind: 'private',
        sensitivity: 'secret_local',
      },
      {
        callFrameId: 'f2',
        kind: 'private',
        sensitivity: 'secret_local',
      },
      {
        callFrameId: 'f3',
        kind: 'private',
        sensitivity: 'secret_local',
      },
    ]);
    const stored = await recorder.getTrace(handle.traceId);
    expect(stored?.callFrames.length).toBe(retention.maxSpansPerTrace);
    expect(stored?.callFrames[0].callFrameId).toBe('f1');
    expect(stored?.callFrames[1].callFrameId).toBe('f2');
  });

  it('appendCallFrames honors maxCallFramesPerTrace when set explicitly', async () => {
    const r = new KvTraceRecorder(store, { ...retention, maxCallFramesPerTrace: 1 });
    const handle = await r.startTrace({ network: { chainId: 1 } });
    await r.appendCallFrames(handle, [
      { callFrameId: 'f1', kind: 'private', sensitivity: 'secret_local' },
      { callFrameId: 'f2', kind: 'private', sensitivity: 'secret_local' },
    ]);
    const stored = await r.getTrace(handle.traceId);
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

  it('lastStartedTraceId returns undefined when the recorder is empty', async () => {
    await expect(recorder.lastStartedTraceId()).resolves.toBeUndefined();
  });

  it('lastStartedTraceId returns the trace id most recently started', async () => {
    const h1 = await recorder.startTrace({ traceId: 't1', network: { chainId: 1 } });
    expect(await recorder.lastStartedTraceId()).toBe(h1.traceId);
    const h2 = await recorder.startTrace({ traceId: 't2', network: { chainId: 1 } });
    expect(await recorder.lastStartedTraceId()).toBe(h2.traceId);
    const h3 = await recorder.startTrace({ traceId: 't3', network: { chainId: 1 } });
    expect(await recorder.lastStartedTraceId()).toBe(h3.traceId);
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
