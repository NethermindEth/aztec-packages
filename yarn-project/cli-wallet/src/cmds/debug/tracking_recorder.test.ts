import { InMemoryTraceRecorder } from '@aztec/debugger/testing';

import { TrackingTraceRecorder } from './tracking_recorder.js';

const retention = {
  maxTraces: 8,
  maxSpansPerTrace: 4,
  maxEventsPerSpan: 4,
  maxErrorsPerTrace: 4,
};

describe('TrackingTraceRecorder', () => {
  it('returns undefined when no trace has been started', async () => {
    const tracker = new TrackingTraceRecorder(new InMemoryTraceRecorder(retention));
    await expect(tracker.lastStartedTraceId()).resolves.toBeUndefined();
  });

  it('returns the trace id of the most recent startTrace call', async () => {
    const tracker = new TrackingTraceRecorder(new InMemoryTraceRecorder(retention));
    const h1 = await tracker.startTrace({ traceId: 't1', network: { chainId: 1 } });
    expect(await tracker.lastStartedTraceId()).toBe(h1.traceId);
    const h2 = await tracker.startTrace({ traceId: 't2', network: { chainId: 1 } });
    expect(await tracker.lastStartedTraceId()).toBe(h2.traceId);
  });

  it('is not influenced by the underlying recorder starting a trace directly', async () => {
    const inner = new InMemoryTraceRecorder(retention);
    const tracker = new TrackingTraceRecorder(inner);
    await inner.startTrace({ traceId: 'rogue', network: { chainId: 1 } });
    await expect(tracker.lastStartedTraceId()).resolves.toBeUndefined();
  });

  it('clear resets the tracked trace id', async () => {
    const tracker = new TrackingTraceRecorder(new InMemoryTraceRecorder(retention));
    await tracker.startTrace({ traceId: 't1', network: { chainId: 1 } });
    await tracker.clear();
    await expect(tracker.lastStartedTraceId()).resolves.toBeUndefined();
  });

  it('forwards getTrace to the inner recorder', async () => {
    const inner = new InMemoryTraceRecorder(retention);
    const tracker = new TrackingTraceRecorder(inner);
    const handle = await tracker.startTrace({ traceId: 't1', network: { chainId: 1 } });
    const trace = await tracker.getTrace(handle.traceId);
    expect(trace?.traceId).toBe(handle.traceId);
  });
});
