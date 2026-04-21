import type { CallStackMetadata } from '@aztec/stdlib/avm';
import type { SimulationError } from '@aztec/stdlib/errors';

export type TxMetadataEntry = {
  callStackMetadata?: CallStackMetadata[];
  revertReason?: SimulationError;
  simulatedAt: number;
};

/**
 * LRU cache keyed by tx hash for public-call metadata gathered during
 * `simulatePublicCalls`. Consumed by admin-only `exportTraceSegment`.
 * Bounded to avoid unbounded memory growth under sustained load.
 */
export class BoundedTxMetadataCache {
  private readonly map = new Map<string, TxMetadataEntry>();

  constructor(private readonly capacity: number = 64) {}

  set(txHash: string, value: Omit<TxMetadataEntry, 'simulatedAt'>): void {
    if (this.map.has(txHash)) {
      this.map.delete(txHash);
    } else if (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(txHash, { ...value, simulatedAt: Date.now() });
  }

  get(txHash: string): TxMetadataEntry | undefined {
    const entry = this.map.get(txHash);
    if (entry === undefined) {
      return undefined;
    }
    // Refresh LRU position on read.
    this.map.delete(txHash);
    this.map.set(txHash, entry);
    return entry;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
