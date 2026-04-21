import { Fr } from '@aztec/foundation/curves/bn254';

import { AztecAddress } from '../aztec-address/index.js';
import { DebugLog } from './debug_log.js';
import { InMemoryDebugLogStore, NullDebugLogStore } from './debug_log_store.js';

describe('DebugLogStore', () => {
  const txHash = '0xdeadbeef';
  const sampleLog = new DebugLog(AztecAddress.ZERO, 'info', 'hello {0}', [new Fr(1n)]);

  it('NullDebugLogStore.getLogs returns empty', () => {
    const store = new NullDebugLogStore();
    store.storeLogs(txHash, [sampleLog]);
    expect(store.getLogs(txHash)).toEqual([]);
    expect(store.isEnabled).toBe(false);
  });

  it('InMemoryDebugLogStore.getLogs round-trips stored logs', () => {
    const store = new InMemoryDebugLogStore();
    store.storeLogs(txHash, [sampleLog]);
    expect(store.getLogs(txHash)).toEqual([sampleLog]);
    expect(store.getLogs('0xmissing')).toEqual([]);
    expect(store.isEnabled).toBe(true);
  });

  it('InMemoryDebugLogStore drops empty log arrays', () => {
    const store = new InMemoryDebugLogStore();
    store.storeLogs(txHash, []);
    expect(store.getLogs(txHash)).toEqual([]);
  });
});
