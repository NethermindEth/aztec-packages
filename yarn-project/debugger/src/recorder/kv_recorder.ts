import { randomBytes } from '@aztec/foundation/crypto/random';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton } from '@aztec/kv-store';
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

import type {
  EndSpanInput,
  SpanHandle,
  StartSpanInput,
  StartTraceInput,
  TraceHandle,
  TraceRecorder,
} from './trace_recorder.js';

/** Upper bounds on stored trace volume. Per-trace caps silently drop excess data. */
export type TraceRetentionConfig = Readonly<{
  maxTraces: number;
  maxSpansPerTrace: number;
  maxEventsPerSpan: number;
  maxErrorsPerTrace: number;
  maxCallFramesPerTrace?: number;
}>;

/** Resolved retention with defaults applied. */
type ResolvedTraceRetention = Readonly<{
  maxTraces: number;
  maxSpansPerTrace: number;
  maxEventsPerSpan: number;
  maxErrorsPerTrace: number;
  maxCallFramesPerTrace: number;
}>;

export function resolveTraceRetention(retention: TraceRetentionConfig): ResolvedTraceRetention {
  if (retention.maxTraces <= 0) {
    throw new Error('maxTraces must be positive');
  }
  if (retention.maxSpansPerTrace <= 0) {
    throw new Error('maxSpansPerTrace must be positive');
  }
  if (retention.maxEventsPerSpan <= 0) {
    throw new Error('maxEventsPerSpan must be positive');
  }
  if (retention.maxErrorsPerTrace <= 0) {
    throw new Error('maxErrorsPerTrace must be positive');
  }
  const maxCallFramesPerTrace = retention.maxCallFramesPerTrace ?? retention.maxSpansPerTrace;
  if (!Number.isInteger(maxCallFramesPerTrace) || maxCallFramesPerTrace <= 0) {
    throw new Error('maxCallFramesPerTrace must be a positive integer');
  }
  return {
    maxTraces: retention.maxTraces,
    maxSpansPerTrace: retention.maxSpansPerTrace,
    maxEventsPerSpan: retention.maxEventsPerSpan,
    maxErrorsPerTrace: retention.maxErrorsPerTrace,
    maxCallFramesPerTrace,
  };
}

type RetentionCursor = {
  /** Smallest sequence number currently present (inclusive). */
  firstLiveSequence: number;
  /** Next sequence number to assign on insert. */
  nextSequence: number;
};

const MAP_TRACES = 'aztec_debugger_traces';
const MAP_TX_INDEX = 'aztec_debugger_trace_id_by_tx';
const MAP_PROVISIONAL_INDEX = 'aztec_debugger_trace_id_by_provisional';
const MAP_ORDER = 'aztec_debugger_trace_order';
const SINGLETON_CURSOR = 'aztec_debugger_retention_cursor';

function randomHex16(): string {
  return randomBytes(16).toString('hex');
}

function randomHex32(): string {
  return randomBytes(32).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function capEvents(events: AztecSpanEvent[] | undefined, maxEvents: number): AztecSpanEvent[] | undefined {
  return events === undefined ? undefined : events.slice(0, maxEvents);
}

async function deleteAllKeys<K extends string | number, V>(map: AztecAsyncMap<K, V>): Promise<void> {
  const keys: K[] = [];
  for await (const key of map.keysAsync()) {
    keys.push(key);
  }
  for (const key of keys) {
    await map.delete(key);
  }
}

/**
 * Persistent trace recorder backed by an AztecAsyncKVStore. Implements FIFO
 * retention via an ordered map plus a sequence cursor, because the kv-store
 * array API cannot pop the oldest element. `clear()` only deletes keys the
 * debugger owns so that sharing the store with PXE is safe.
 */
export class KvTraceRecorder implements TraceRecorder {
  private readonly traces: AztecAsyncMap<string, AztecTrace>;
  private readonly txIndex: AztecAsyncMap<string, string>;
  private readonly provisionalIndex: AztecAsyncMap<string, string>;
  private readonly order: AztecAsyncMap<number, string>;
  private readonly cursor: AztecAsyncSingleton<RetentionCursor>;

  private readonly retention: ResolvedTraceRetention;

  constructor(
    private readonly store: AztecAsyncKVStore,
    retention: TraceRetentionConfig,
  ) {
    this.retention = resolveTraceRetention(retention);

    this.traces = store.openMap<string, AztecTrace>(MAP_TRACES);
    this.txIndex = store.openMap<string, string>(MAP_TX_INDEX);
    this.provisionalIndex = store.openMap<string, string>(MAP_PROVISIONAL_INDEX);
    this.order = store.openMap<number, string>(MAP_ORDER);
    this.cursor = store.openSingleton<RetentionCursor>(SINGLETON_CURSOR);
  }

  startTrace(input: StartTraceInput): Promise<TraceHandle> {
    const traceId = input.traceId ?? randomHex16();
    const provisionalTraceId = input.provisionalTraceId ?? randomHex16();
    const redaction = input.redaction ?? this.defaultRedaction();
    const createdAt = input.createdAt ?? nowIso();

    const trace: AztecTrace = {
      schemaVersion: AZTEC_TRACE_SCHEMA_VERSION,
      traceId,
      provisionalTraceId,
      txHash: input.anchors?.txHash,
      network: input.network,
      createdAt,
      status: 'ok',
      anchors: {
        ...(input.anchors ?? {}),
        provisionalTraceId,
      },
      spans: [],
      callFrames: [],
      errors: [],
      artifacts: [],
      redaction,
    };

    return this.store.transactionAsync(async () => {
      const existing = await this.traces.getAsync(traceId);
      if (existing) {
        if (existing.txHash) {
          await this.txIndex.delete(existing.txHash);
        }
        if (existing.provisionalTraceId) {
          await this.provisionalIndex.delete(existing.provisionalTraceId);
        }
        await this.traces.set(traceId, trace);
        await this.provisionalIndex.set(provisionalTraceId, traceId);
        if (trace.txHash) {
          await this.txIndex.set(trace.txHash, traceId);
        }
        return { traceId, provisionalTraceId };
      }

      const cursor = (await this.cursor.getAsync()) ?? { firstLiveSequence: 0, nextSequence: 0 };
      await this.traces.set(traceId, trace);
      await this.provisionalIndex.set(provisionalTraceId, traceId);
      if (trace.txHash) {
        await this.txIndex.set(trace.txHash, traceId);
      }
      await this.order.set(cursor.nextSequence, traceId);
      const nextSequence = cursor.nextSequence + 1;
      let firstLiveSequence = cursor.firstLiveSequence;

      while (nextSequence - firstLiveSequence > this.retention.maxTraces) {
        const evictedId = await this.order.getAsync(firstLiveSequence);
        if (evictedId !== undefined && evictedId !== traceId) {
          const evicted = await this.traces.getAsync(evictedId);
          await this.traces.delete(evictedId);
          if (evicted?.txHash) {
            await this.txIndex.delete(evicted.txHash);
          }
          if (evicted?.provisionalTraceId) {
            await this.provisionalIndex.delete(evicted.provisionalTraceId);
          }
        }
        await this.order.delete(firstLiveSequence);
        firstLiveSequence += 1;
      }

      await this.cursor.set({ firstLiveSequence, nextSequence });
      return { traceId, provisionalTraceId };
    });
  }

  startSpan(trace: TraceHandle, input: StartSpanInput): Promise<SpanHandle> {
    const spanId = input.spanId ?? randomHex16();
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

    return this.store.transactionAsync(async () => {
      const stored = await this.traces.getAsync(trace.traceId);
      if (!stored) {
        return { traceId: trace.traceId, spanId };
      }
      if (stored.spans.length >= this.retention.maxSpansPerTrace) {
        return { traceId: trace.traceId, spanId };
      }
      stored.spans.push(span);
      await this.traces.set(trace.traceId, stored);
      return { traceId: trace.traceId, spanId };
    });
  }

  endSpan(span: SpanHandle, input: EndSpanInput): Promise<void> {
    return this.store.transactionAsync(async () => {
      const stored = await this.traces.getAsync(span.traceId);
      if (!stored) {
        return;
      }
      const target = stored.spans.find(s => s.spanId === span.spanId);
      if (!target) {
        return;
      }
      target.status = input.status;
      target.endedAt = input.endedAt ?? nowIso();
      if (input.attributes) {
        target.attributes = { ...(target.attributes ?? {}), ...input.attributes };
      }
      await this.traces.set(span.traceId, stored);
    });
  }

  recordEvent(span: SpanHandle, event: AztecSpanEvent): Promise<void> {
    return this.store.transactionAsync(async () => {
      const stored = await this.traces.getAsync(span.traceId);
      if (!stored) {
        return;
      }
      const target = stored.spans.find(s => s.spanId === span.spanId);
      if (!target) {
        return;
      }
      const events = target.events ?? [];
      if (events.length >= this.retention.maxEventsPerSpan) {
        return;
      }
      events.push(event);
      target.events = events;
      await this.traces.set(span.traceId, stored);
    });
  }

  recordError(trace: TraceHandle, error: AztecTraceError): Promise<void> {
    return this.store.transactionAsync(async () => {
      const stored = await this.traces.getAsync(trace.traceId);
      if (!stored) {
        return;
      }
      stored.status = 'error';
      if (stored.errors.length >= this.retention.maxErrorsPerTrace) {
        await this.traces.set(trace.traceId, stored);
        return;
      }
      stored.errors.push(error);
      await this.traces.set(trace.traceId, stored);
    });
  }

  appendCallFrames(trace: TraceHandle, frames: AztecCallFrame[]): Promise<void> {
    return this.store.transactionAsync(async () => {
      const stored = await this.traces.getAsync(trace.traceId);
      if (!stored) {
        return;
      }
      const remaining = this.retention.maxCallFramesPerTrace - stored.callFrames.length;
      if (remaining <= 0) {
        return;
      }
      const toAppend = frames.length <= remaining ? frames : frames.slice(0, remaining);
      stored.callFrames.push(...toAppend);
      await this.traces.set(trace.traceId, stored);
    });
  }

  bindTxHash(provisionalTraceId: string, txHash: string): Promise<void> {
    return this.store.transactionAsync(async () => {
      const traceId = await this.provisionalIndex.getAsync(provisionalTraceId);
      if (!traceId) {
        return;
      }
      const stored = await this.traces.getAsync(traceId);
      if (!stored) {
        return;
      }
      if (stored.txHash) {
        await this.txIndex.delete(stored.txHash);
      }
      stored.txHash = txHash;
      stored.anchors = { ...stored.anchors, txHash };
      await this.traces.set(traceId, stored);
      await this.txIndex.set(txHash, traceId);
    });
  }

  async getTrace(idOrTxHashOrProvisionalId: string): Promise<AztecTrace | undefined> {
    const direct = await this.traces.getAsync(idOrTxHashOrProvisionalId);
    if (direct) {
      return direct;
    }
    const byTx = await this.txIndex.getAsync(idOrTxHashOrProvisionalId);
    if (byTx) {
      const found = await this.traces.getAsync(byTx);
      if (found) {
        return found;
      }
    }
    const byProv = await this.provisionalIndex.getAsync(idOrTxHashOrProvisionalId);
    if (byProv) {
      return this.traces.getAsync(byProv);
    }
    return undefined;
  }

  clear(): Promise<void> {
    return this.store.transactionAsync(async () => {
      await deleteAllKeys(this.traces);
      await deleteAllKeys(this.txIndex);
      await deleteAllKeys(this.provisionalIndex);
      await deleteAllKeys(this.order);
      await this.cursor.delete();
    });
  }

  private defaultRedaction(): RedactionManifest {
    return {
      schemaVersion: REDACTION_MANIFEST_SCHEMA_VERSION,
      policy: 'strict',
      saltHex: randomHex32(),
      digestAlgorithm: 'HMAC-SHA256',
      redactedFields: [],
      preservedFields: [],
      createdAt: nowIso(),
    };
  }
}
