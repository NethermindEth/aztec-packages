import type { TxReceipt } from '../tx/tx_receipt.js';
import type { DebugLog } from './debug_log.js';

/**
 * Store for debug logs emitted by public functions during transaction execution.
 *
 * Uses the Null Object pattern: production code uses NullDebugLogStore (no-op), while test mode uses
 * InMemoryDebugLogStore (stores and serves logs).
 */
export interface DebugLogStore {
  /** Store debug logs for a processed transaction. */
  storeLogs(txHash: string, logs: DebugLog[]): void;
  /** Decorate a TxReceipt with any stored debug logs for the given tx. */
  decorateReceiptWithLogs(txHash: string, receipt: TxReceipt): void;
  /** Return stored debug logs for a tx, or an empty array if none or if disabled. */
  getLogs(txHash: string): DebugLog[];
  /** Whether debug log collection is enabled. */
  readonly isEnabled: boolean;
}

/** No-op implementation for production mode. */
export class NullDebugLogStore implements DebugLogStore {
  storeLogs(_txHash: string, _logs: DebugLog[]): void {
    return;
  }
  decorateReceiptWithLogs(_txHash: string, _receipt: TxReceipt): void {
    return;
  }
  getLogs(_txHash: string): DebugLog[] {
    return [];
  }
  get isEnabled(): boolean {
    return false;
  }
}

/** In-memory implementation for test mode that stores and serves debug logs. */
export class InMemoryDebugLogStore implements DebugLogStore {
  private map = new Map<string, DebugLog[]>();

  storeLogs(txHash: string, logs: DebugLog[]): void {
    if (logs.length > 0) {
      this.map.set(txHash, logs);
    }
  }

  decorateReceiptWithLogs(txHash: string, receipt: TxReceipt): void {
    if (receipt.isMined()) {
      const debugLogs = this.map.get(txHash);
      if (debugLogs) {
        receipt.debugLogs = debugLogs;
      }
    }
  }

  getLogs(txHash: string): DebugLog[] {
    return this.map.get(txHash) ?? [];
  }

  get isEnabled(): boolean {
    return true;
  }
}
