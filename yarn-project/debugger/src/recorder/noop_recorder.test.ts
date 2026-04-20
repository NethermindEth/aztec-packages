import { NoopTraceRecorder } from './noop_recorder.js';

describe('NoopTraceRecorder', () => {
  const makeRecorder = () => new NoopTraceRecorder();

  it('startTrace resolves with a handle and does not throw', async () => {
    const r = makeRecorder();
    const handle = await r.startTrace({ network: { chainId: 1 } });
    expect(handle).toBeDefined();
  });

  it('every method resolves without error', async () => {
    const r = makeRecorder();
    const trace = await r.startTrace({ network: { chainId: 1 } });
    const span = await r.startSpan(trace, {
      name: 'x',
      component: 'pxe',
      phase: 'pxe_execution',
      sensitivity: 'redacted',
      status: 'ok',
    });
    await expect(r.endSpan(span, { status: 'ok' })).resolves.toBeUndefined();
    await expect(r.recordEvent(span, { name: 'e', timestamp: '2026-04-20T00:00:00Z' })).resolves.toBeUndefined();
    await expect(
      r.recordError(trace, {
        schemaVersion: 'aztec.error.v1',
        errorId: 'e',
        code: 'AZDBG_UNKNOWN',
        message: 'm',
        category: 'unknown',
        severity: 'warn',
        retryable: false,
      }),
    ).resolves.toBeUndefined();
    await expect(r.bindTxHash('prov', 'tx')).resolves.toBeUndefined();
    await expect(r.clear()).resolves.toBeUndefined();
  });

  it('getTrace always returns undefined', async () => {
    const r = makeRecorder();
    await r.startTrace({ network: { chainId: 1 } });
    await expect(r.getTrace('anything')).resolves.toBeUndefined();
  });

  it('no state survives across calls', async () => {
    const r = makeRecorder();
    const a = await r.startTrace({ traceId: 'a', network: { chainId: 1 } });
    const b = await r.startTrace({ traceId: 'b', network: { chainId: 1 } });
    expect(a.traceId).toBe(b.traceId);
    expect(await r.getTrace('a')).toBeUndefined();
    expect(await r.getTrace('b')).toBeUndefined();
  });
});
