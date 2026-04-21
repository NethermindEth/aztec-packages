import {
  InMemoryDebuggerSpanProjector,
  NoopDebuggerSpanProjector,
  createDebuggerSpanProjector,
  makeSpanRecord,
} from './debugger_span_projector.js';

describe('debugger_span_projector', () => {
  const mkSpan = (txHash: string, name: string) =>
    makeSpanRecord({
      name,
      txHash,
      spanId: `${txHash}:${name}`,
      startedAt: '2026-04-21T00:00:00.000Z',
    });

  it('no-op projector reports disabled and returns empty spans', () => {
    const p = new NoopDebuggerSpanProjector();
    p.record({ txHash: '0x1', span: mkSpan('0x1', 'x') });
    expect(p.enabled).toBe(false);
    expect(p.take('0x1')).toEqual([]);
  });

  it('in-memory projector buffers per-tx and enforces per-tx capacity', () => {
    const p = new InMemoryDebuggerSpanProjector(/*perTxCapacity*/ 2, /*globalCapacity*/ 10);
    p.record({ txHash: '0x1', span: mkSpan('0x1', 'a') });
    p.record({ txHash: '0x1', span: mkSpan('0x1', 'b') });
    p.record({ txHash: '0x1', span: mkSpan('0x1', 'c') });

    const spans = p.take('0x1');
    expect(spans.map(s => s.name)).toEqual(['b', 'c']);
  });

  it('isolates spans per tx hash', () => {
    const p = new InMemoryDebuggerSpanProjector();
    p.record({ txHash: '0x1', span: mkSpan('0x1', 'a') });
    p.record({ txHash: '0x2', span: mkSpan('0x2', 'b') });
    expect(p.take('0x1').map(s => s.name)).toEqual(['a']);
    expect(p.take('0x2').map(s => s.name)).toEqual(['b']);
  });

  it('evicts oldest tx buffer when global capacity is exceeded (FIFO across txs)', () => {
    const p = new InMemoryDebuggerSpanProjector(/*perTxCapacity*/ 4, /*globalCapacity*/ 2);
    p.record({ txHash: '0x1', span: mkSpan('0x1', 'a') });
    p.record({ txHash: '0x2', span: mkSpan('0x2', 'a') });
    p.record({ txHash: '0x3', span: mkSpan('0x3', 'a') });
    expect(p.take('0x1')).toEqual([]); // evicted
    expect(p.take('0x2').map(s => s.name)).toEqual(['a']);
    expect(p.take('0x3').map(s => s.name)).toEqual(['a']);
  });

  it('clear empties all buffers', () => {
    const p = new InMemoryDebuggerSpanProjector();
    p.record({ txHash: '0x1', span: mkSpan('0x1', 'a') });
    p.clear();
    expect(p.take('0x1')).toEqual([]);
  });

  describe('createDebuggerSpanProjector', () => {
    const original = process.env.AZTEC_NODE_DEBUGGER_CAPTURE;
    afterEach(() => {
      if (original === undefined) {
        delete process.env.AZTEC_NODE_DEBUGGER_CAPTURE;
      } else {
        process.env.AZTEC_NODE_DEBUGGER_CAPTURE = original;
      }
    });

    it('defaults to no-op projector when env flag is unset', () => {
      delete process.env.AZTEC_NODE_DEBUGGER_CAPTURE;
      expect(createDebuggerSpanProjector().enabled).toBe(false);
    });

    it('returns an in-memory projector when opt-in flag is set', () => {
      process.env.AZTEC_NODE_DEBUGGER_CAPTURE = '1';
      expect(createDebuggerSpanProjector().enabled).toBe(true);
    });
  });
});
