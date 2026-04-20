import { deterministicStringify } from './deterministic_json.js';

describe('deterministicStringify', () => {
  it('emits keys sorted lexicographically regardless of insertion order', () => {
    const a = deterministicStringify({ b: 1, a: 2, c: 3 });
    const b = deterministicStringify({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it('sorts nested-object keys too', () => {
    const out = deterministicStringify({ outer: { z: 1, a: 2 } });
    expect(out).toBe('{"outer":{"a":2,"z":1}}');
  });

  it('preserves array order', () => {
    expect(deterministicStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles primitives and null', () => {
    expect(deterministicStringify('s')).toBe('"s"');
    expect(deterministicStringify(1)).toBe('1');
    expect(deterministicStringify(false)).toBe('false');
    expect(deterministicStringify(null)).toBe('null');
  });

  it('skips undefined fields without throwing', () => {
    expect(deterministicStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('throws on bigint, undefined values at the top level, NaN, Infinity, and functions', () => {
    expect(() => deterministicStringify(1n as unknown)).toThrow();
    expect(() => deterministicStringify(undefined)).toThrow();
    expect(() => deterministicStringify(Number.NaN)).toThrow();
    expect(() => deterministicStringify(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => deterministicStringify(() => 1)).toThrow();
    expect(() => deterministicStringify(Symbol('x'))).toThrow();
  });

  it('produces deterministic output for deeply nested structures', () => {
    const fixture = {
      files: [
        { path: 'b.json', contentHash: 'ff', byteLength: 1 },
        { path: 'a.json', contentHash: 'ee', byteLength: 2 },
      ],
      meta: { z: { y: 1, x: 2 } },
    };
    const out1 = deterministicStringify(fixture);
    const out2 = deterministicStringify(JSON.parse(JSON.stringify(fixture)));
    expect(out1).toBe(out2);
  });
});
