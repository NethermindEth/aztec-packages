import { randomBytes } from '@aztec/foundation/crypto/random';
import {
  AZTEC_TRACE_SCHEMA_VERSION,
  type AztecCallFrame,
  type AztecSpan,
  type AztecSpanEvent,
  type AztecTrace,
  type AztecTraceError,
  REDACTION_MANIFEST_SCHEMA_VERSION,
  type RedactionManifest,
} from '@aztec/stdlib/debug';

import { type TraceRetentionConfig, resolveTraceRetention } from '../recorder/kv_recorder.js';
import type {
  EndSpanInput,
  SpanHandle,
  StartSpanInput,
  StartTraceInput,
  TraceHandle,
  TraceRecorder,
} from '../recorder/trace_recorder.js';

function randomHex(len: number): string {
  return randomBytes(len).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function capEvents(events: AztecSpanEvent[] | undefined, maxEvents: number): AztecSpanEvent[] | undefined {
  return events === undefined ? undefined : events.slice(0, maxEvents);
}

/**
 * In-memory recorder used by package tests. Mirrors the KV recorder's lookup
 * order, tx-hash binding, FIFO retention, cap-drop, and clear() semantics.
 * Not intended for production paths.
 */
export class InMemoryTraceRecorder implements TraceRecorder {
  private readonly traces = new Map<string, AztecTrace>();
  private readonly order: string[] = [];
  private readonly txIndex = new Map<string, string>();
  private readonly provisionalIndex = new Map<string, string>();

  private readonly retention: ReturnType<typeof resolveTraceRetention>;

  constructor(retention: TraceRetentionConfig) {
    this.retention = resolveTraceRetention(retention);
  }

  startTrace(input: StartTraceInput): Promise<TraceHandle> {
    const traceId = input.traceId ?? randomHex(16);
    const provisionalTraceId = input.provisionalTraceId ?? randomHex(16);
    const trace: AztecTrace = {
      schemaVersion: AZTEC_TRACE_SCHEMA_VERSION,
      traceId,
      provisionalTraceId,
      txHash: input.anchors?.txHash,
      network: input.network,
      createdAt: input.createdAt ?? nowIso(),
      status: 'ok',
      anchors: { ...(input.anchors ?? {}), provisionalTraceId },
      spans: [],
      callFrames: [],
      errors: [],
      artifacts: [],
      redaction: input.redaction ?? this.defaultRedaction(),
    };

    const existing = this.traces.get(traceId);
    if (existing) {
      if (existing.txHash) {
        this.txIndex.delete(existing.txHash);
      }
      if (existing.provisionalTraceId) {
        this.provisionalIndex.delete(existing.provisionalTraceId);
      }
      this.traces.set(traceId, trace);
      this.provisionalIndex.set(provisionalTraceId, traceId);
      if (trace.txHash) {
        this.txIndex.set(trace.txHash, traceId);
      }
      return Promise.resolve({ traceId, provisionalTraceId });
    }

    this.traces.set(traceId, trace);
    this.order.push(traceId);
    this.provisionalIndex.set(provisionalTraceId, traceId);
    if (trace.txHash) {
      this.txIndex.set(trace.txHash, traceId);
    }

    while (this.order.length > this.retention.maxTraces) {
      const evictedId = this.order.shift();
      if (evictedId === undefined || evictedId === traceId) {
        continue;
      }
      const evicted = this.traces.get(evictedId);
      this.traces.delete(evictedId);
      if (evicted?.txHash) {
        this.txIndex.delete(evicted.txHash);
      }
      if (evicted?.provisionalTraceId) {
        this.provisionalIndex.delete(evicted.provisionalTraceId);
      }
    }

    return Promise.resolve({ traceId, provisionalTraceId });
  }

  startSpan(trace: TraceHandle, input: StartSpanInput): Promise<SpanHandle> {
    const spanId = input.spanId ?? randomHex(16);
    const stored = this.traces.get(trace.traceId);
    if (stored && stored.spans.length < this.retention.maxSpansPerTrace) {
      const span: AztecSpan = {
        spanId,
        parentSpanId: input.parentSpanId,
        name: input.name,
        component: input.component,
        phase: input.phase,
        kind: input.kind,
        sensitivity: input.sensitivity,
        status: input.status,
        startedAt: input.startedAt ?? nowIso(),
        attributes: input.attributes,
        events: capEvents(input.events, this.retention.maxEventsPerSpan),
        links: input.links,
        sourceRef: input.sourceRef,
        callFrameId: input.callFrameId,
      };
      stored.spans.push(span);
    }
    return Promise.resolve({ traceId: trace.traceId, spanId });
  }

  endSpan(span: SpanHandle, input: EndSpanInput): Promise<void> {
    const stored = this.traces.get(span.traceId);
    const target = stored?.spans.find(s => s.spanId === span.spanId);
    if (target) {
      target.status = input.status;
      target.endedAt = input.endedAt ?? nowIso();
      if (input.attributes) {
        target.attributes = { ...(target.attributes ?? {}), ...input.attributes };
      }
    }
    return Promise.resolve();
  }

  recordEvent(span: SpanHandle, event: AztecSpanEvent): Promise<void> {
    const stored = this.traces.get(span.traceId);
    const target = stored?.spans.find(s => s.spanId === span.spanId);
    if (target) {
      const events = target.events ?? [];
      if (events.length < this.retention.maxEventsPerSpan) {
        events.push(event);
        target.events = events;
      }
    }
    return Promise.resolve();
  }

  recordError(trace: TraceHandle, error: AztecTraceError): Promise<void> {
    const stored = this.traces.get(trace.traceId);
    if (stored) {
      stored.status = 'error';
      if (stored.errors.length < this.retention.maxErrorsPerTrace) {
        stored.errors.push(error);
      }
    }
    return Promise.resolve();
  }

  appendCallFrames(trace: TraceHandle, frames: AztecCallFrame[]): Promise<void> {
    const stored = this.traces.get(trace.traceId);
    if (!stored) {
      return Promise.resolve();
    }
    const remaining = this.retention.maxCallFramesPerTrace - stored.callFrames.length;
    if (remaining <= 0) {
      return Promise.resolve();
    }
    const toAppend = frames.length <= remaining ? frames : frames.slice(0, remaining);
    stored.callFrames.push(...toAppend);
    return Promise.resolve();
  }

  bindTxHash(provisionalTraceId: string, txHash: string): Promise<void> {
    const traceId = this.provisionalIndex.get(provisionalTraceId);
    if (!traceId) {
      return Promise.resolve();
    }
    const stored = this.traces.get(traceId);
    if (!stored) {
      return Promise.resolve();
    }
    if (stored.txHash) {
      this.txIndex.delete(stored.txHash);
    }
    stored.txHash = txHash;
    stored.anchors = { ...stored.anchors, txHash };
    this.txIndex.set(txHash, traceId);
    return Promise.resolve();
  }

  getTrace(idOrTxHashOrProvisionalId: string): Promise<AztecTrace | undefined> {
    const direct = this.traces.get(idOrTxHashOrProvisionalId);
    if (direct) {
      return Promise.resolve(direct);
    }
    const byTx = this.txIndex.get(idOrTxHashOrProvisionalId);
    if (byTx) {
      return Promise.resolve(this.traces.get(byTx));
    }
    const byProv = this.provisionalIndex.get(idOrTxHashOrProvisionalId);
    if (byProv) {
      return Promise.resolve(this.traces.get(byProv));
    }
    return Promise.resolve(undefined);
  }

  clear(): Promise<void> {
    this.traces.clear();
    this.order.length = 0;
    this.txIndex.clear();
    this.provisionalIndex.clear();
    return Promise.resolve();
  }

  private defaultRedaction(): RedactionManifest {
    return {
      schemaVersion: REDACTION_MANIFEST_SCHEMA_VERSION,
      policy: 'strict',
      saltHex: randomHex(32),
      digestAlgorithm: 'HMAC-SHA256',
      redactedFields: [],
      preservedFields: [],
      createdAt: nowIso(),
    };
  }
}
