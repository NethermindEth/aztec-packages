import type {
  AztecAttributeValue,
  AztecCallFrame,
  AztecSpan,
  AztecSpanEvent,
  AztecSpanStatus,
  AztecTrace,
  AztecTraceAnchors,
  AztecTraceError,
  AztecTraceNetwork,
  RedactionManifest,
} from '@aztec/stdlib/debug';

/** Handle returned by {@link TraceRecorder.startTrace}; carries both the final and provisional ids. */
export type TraceHandle = Readonly<{
  traceId: string;
  provisionalTraceId: string;
}>;

/** Handle returned by {@link TraceRecorder.startSpan}. */
export type SpanHandle = Readonly<{
  traceId: string;
  spanId: string;
}>;

/** Input to {@link TraceRecorder.startTrace}. Fields are optional where the recorder can fill defaults. */
export type StartTraceInput = Readonly<{
  traceId?: string;
  provisionalTraceId?: string;
  network: AztecTraceNetwork;
  anchors?: Partial<AztecTraceAnchors>;
  redaction?: RedactionManifest;
  createdAt?: string;
}>;

/** Input to {@link TraceRecorder.startSpan}. */
export type StartSpanInput = Readonly<
  Omit<AztecSpan, 'spanId' | 'startedAt' | 'endedAt' | 'events'> & {
    spanId?: string;
    startedAt?: string;
    events?: AztecSpanEvent[];
  }
>;

/** Input to {@link TraceRecorder.endSpan}. */
export type EndSpanInput = Readonly<{
  endedAt?: string;
  status: AztecSpanStatus;
  attributes?: Record<string, AztecAttributeValue>;
}>;

/**
 * Narrow contract for recording local debugger traces. Implementations must
 * not import OTel APIs so that OTel-disabled deployments can still record
 * traces locally. Callers are responsible for converting protocol values
 * (Fr, TxHash, addresses) to canonical strings before recording.
 */
export interface TraceRecorder {
  /** Starts a new trace and returns its final and provisional ids. */
  startTrace(input: StartTraceInput): Promise<TraceHandle>;

  /** Starts a new span under an existing trace. */
  startSpan(trace: TraceHandle, input: StartSpanInput): Promise<SpanHandle>;

  /** Ends a previously started span. */
  endSpan(span: SpanHandle, input: EndSpanInput): Promise<void>;

  /** Records an event on a span. */
  recordEvent(span: SpanHandle, event: AztecSpanEvent): Promise<void>;

  /** Records an error against a trace. */
  recordError(trace: TraceHandle, error: AztecTraceError): Promise<void>;

  /** Appends immutable call frames to an existing trace. No-op on unknown trace. */
  appendCallFrames(trace: TraceHandle, frames: AztecCallFrame[]): Promise<void>;

  /** Binds a final tx hash to a trace originally identified by a provisional id. No-op if unknown. */
  bindTxHash(provisionalTraceId: string, txHash: string): Promise<void>;

  /** Looks up a trace by trace id, tx hash, or provisional id (in that order). */
  getTrace(idOrTxHashOrProvisionalId: string): Promise<AztecTrace | undefined>;

  /** Returns the trace id most recently passed to {@link startTrace}, or undefined if none. */
  lastStartedTraceId(): Promise<string | undefined>;

  /** Removes all debugger-owned state without affecting other data in the backing store. */
  clear(): Promise<void>;
}
