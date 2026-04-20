import type { AztecCallFrame, AztecSpanEvent, AztecTraceError } from '@aztec/stdlib/debug';

import type {
  EndSpanInput,
  SpanHandle,
  StartSpanInput,
  StartTraceInput,
  TraceHandle,
  TraceRecorder,
} from './trace_recorder.js';

/**
 * Default recorder used whenever none is explicitly configured. Every method
 * resolves without storing state. This is the only safe default for runtime
 * wiring because it guarantees zero overhead and zero memory growth.
 */
export class NoopTraceRecorder implements TraceRecorder {
  startTrace(_input: StartTraceInput): Promise<TraceHandle> {
    return Promise.resolve({ traceId: '', provisionalTraceId: '' });
  }

  startSpan(trace: TraceHandle, _input: StartSpanInput): Promise<SpanHandle> {
    return Promise.resolve({ traceId: trace.traceId, spanId: '' });
  }

  endSpan(_span: SpanHandle, _input: EndSpanInput): Promise<void> {
    return Promise.resolve();
  }

  recordEvent(_span: SpanHandle, _event: AztecSpanEvent): Promise<void> {
    return Promise.resolve();
  }

  recordError(_trace: TraceHandle, _error: AztecTraceError): Promise<void> {
    return Promise.resolve();
  }

  appendCallFrames(_trace: TraceHandle, _frames: AztecCallFrame[]): Promise<void> {
    return Promise.resolve();
  }

  bindTxHash(_provisionalTraceId: string, _txHash: string): Promise<void> {
    return Promise.resolve();
  }

  getTrace(_idOrTxHashOrProvisionalId: string): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  lastStartedTraceId(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  clear(): Promise<void> {
    return Promise.resolve();
  }
}
