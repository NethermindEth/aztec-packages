import type { AztecAttributeValue, AztecSpan } from '@aztec/stdlib/debug';

/**
 * Opt-in in-process projector that buffers OTel-style span endings as `AztecSpan`
 * records keyed by tx hash, for later consumption by admin-only trace export.
 *
 * Enabled iff `process.env.AZTEC_NODE_DEBUGGER_CAPTURE === '1'`. When disabled,
 * all methods are no-ops; no memory overhead on the default path.
 */
export type RecordSpanInput = {
  txHash: string;
  span: AztecSpan;
};

export interface DebuggerSpanProjector {
  readonly enabled: boolean;
  record(input: RecordSpanInput): void;
  take(txHash: string): AztecSpan[];
  clear(): void;
}

export class NoopDebuggerSpanProjector implements DebuggerSpanProjector {
  readonly enabled = false;
  record(_input: RecordSpanInput): void {
    return;
  }
  take(_txHash: string): AztecSpan[] {
    return [];
  }
  clear(): void {
    return;
  }
}

/**
 * Bounded-capacity FIFO projector.
 * - Per-tx buffer capped at `perTxCapacity` spans.
 * - Total bound enforced across all txs via `globalCapacity`, oldest txs evicted first.
 */
export class InMemoryDebuggerSpanProjector implements DebuggerSpanProjector {
  readonly enabled = true;
  private readonly perTx = new Map<string, AztecSpan[]>();

  constructor(
    private readonly perTxCapacity: number = 64,
    private readonly globalCapacity: number = 1024,
  ) {}

  record({ txHash, span }: RecordSpanInput): void {
    let buffer = this.perTx.get(txHash);
    if (!buffer) {
      if (this.perTx.size >= this.globalCapacity) {
        const oldestKey = this.perTx.keys().next().value;
        if (oldestKey !== undefined) {
          this.perTx.delete(oldestKey);
        }
      }
      buffer = [];
      this.perTx.set(txHash, buffer);
    }
    buffer.push(span);
    if (buffer.length > this.perTxCapacity) {
      buffer.shift();
    }
  }

  take(txHash: string): AztecSpan[] {
    return [...(this.perTx.get(txHash) ?? [])];
  }

  clear(): void {
    this.perTx.clear();
  }
}

/** Create the projector based on the opt-in env flag. Defaults to no-op. */
export function createDebuggerSpanProjector(): DebuggerSpanProjector {
  if (process.env.AZTEC_NODE_DEBUGGER_CAPTURE === '1') {
    return new InMemoryDebuggerSpanProjector();
  }
  return new NoopDebuggerSpanProjector();
}

/** Helper to build a minimal `AztecSpan` for a recorded OTel span end. */
export function makeSpanRecord(input: {
  name: string;
  txHash: string;
  startedAt: string;
  endedAt?: string;
  attributes?: Record<string, AztecAttributeValue>;
  spanId: string;
  parentSpanId?: string;
  component?: AztecSpan['component'];
  phase?: AztecSpan['phase'];
  kind?: AztecSpan['kind'];
  sensitivity?: AztecSpan['sensitivity'];
  status?: AztecSpan['status'];
}): AztecSpan {
  return {
    spanId: input.spanId,
    parentSpanId: input.parentSpanId,
    name: input.name,
    component: input.component ?? 'aztec_node',
    phase: input.phase ?? 'node_submission',
    kind: input.kind ?? 'public',
    sensitivity: input.sensitivity ?? 'public',
    status: input.status ?? 'ok',
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    attributes: { 'aztec.tx.hash': input.txHash, ...input.attributes },
  };
}
