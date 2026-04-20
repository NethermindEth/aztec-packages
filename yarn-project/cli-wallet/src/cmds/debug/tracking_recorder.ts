import type {
  EndSpanInput,
  SpanHandle,
  StartSpanInput,
  StartTraceInput,
  TraceHandle,
  TraceRecorder,
} from '@aztec/debugger';
import type { AztecCallFrame, AztecSpanEvent, AztecTrace, AztecTraceError } from '@aztec/stdlib/debug';

/**
 * Delegating `TraceRecorder` wrapper that tracks the most recent `startTrace`
 * result in the current process. Used by `--debug-bundle-on-error` to pick an
 * in-flight trace to export when neither a bound tx hash nor a provisional id
 * is in scope. Scoping to the wrapper instance prevents cross-process
 * contamination from the global retention cursor in the underlying KV store.
 */
export class TrackingTraceRecorder implements TraceRecorder {
  private latest: string | undefined;

  constructor(private readonly inner: TraceRecorder) {}

  async startTrace(input: StartTraceInput): Promise<TraceHandle> {
    const handle = await this.inner.startTrace(input);
    this.latest = handle.traceId;
    return handle;
  }

  startSpan(trace: TraceHandle, input: StartSpanInput): Promise<SpanHandle> {
    return this.inner.startSpan(trace, input);
  }

  endSpan(span: SpanHandle, input: EndSpanInput): Promise<void> {
    return this.inner.endSpan(span, input);
  }

  recordEvent(span: SpanHandle, event: AztecSpanEvent): Promise<void> {
    return this.inner.recordEvent(span, event);
  }

  recordError(trace: TraceHandle, error: AztecTraceError): Promise<void> {
    return this.inner.recordError(trace, error);
  }

  appendCallFrames(trace: TraceHandle, frames: AztecCallFrame[]): Promise<void> {
    return this.inner.appendCallFrames(trace, frames);
  }

  bindTxHash(provisionalTraceId: string, txHash: string): Promise<void> {
    return this.inner.bindTxHash(provisionalTraceId, txHash);
  }

  getTrace(idOrTxHashOrProvisionalId: string): Promise<AztecTrace | undefined> {
    return this.inner.getTrace(idOrTxHashOrProvisionalId);
  }

  lastStartedTraceId(): Promise<string | undefined> {
    return Promise.resolve(this.latest);
  }

  async clear(): Promise<void> {
    this.latest = undefined;
    await this.inner.clear();
  }
}
