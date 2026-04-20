import { AztecAttributeMapSchema, AztecAttributeValueSchema } from './common.js';

describe('AztecAttributeValueSchema', () => {
  it('accepts JSON primitives', () => {
    expect(() => AztecAttributeValueSchema.parse('hello')).not.toThrow();
    expect(() => AztecAttributeValueSchema.parse(42)).not.toThrow();
    expect(() => AztecAttributeValueSchema.parse(true)).not.toThrow();
    expect(() => AztecAttributeValueSchema.parse(null)).not.toThrow();
  });

  it('accepts arrays of JSON-safe values', () => {
    expect(() => AztecAttributeValueSchema.parse([1, 'a', null, [true, 2]])).not.toThrow();
  });

  it('accepts plain records of JSON-safe values', () => {
    expect(() =>
      AztecAttributeValueSchema.parse({
        a: 'x',
        b: [1, 2],
        c: { d: false, e: null },
      }),
    ).not.toThrow();
  });

  it('rejects raw bigint', () => {
    expect(() => AztecAttributeValueSchema.parse(1n)).toThrow();
  });

  it('rejects Buffer', () => {
    expect(() => AztecAttributeValueSchema.parse(Buffer.from([1, 2, 3]))).toThrow();
  });

  it('rejects class instances', () => {
    class Foo {
      constructor(public readonly x: number) {}
    }
    expect(() => AztecAttributeValueSchema.parse(new Foo(1))).toThrow();
  });

  it('rejects undefined', () => {
    expect(() => AztecAttributeValueSchema.parse(undefined)).toThrow();
  });

  it('rejects Date values', () => {
    expect(() => AztecAttributeValueSchema.parse(new Date())).toThrow();
  });

  it('rejects functions', () => {
    expect(() => AztecAttributeValueSchema.parse(() => 0)).toThrow();
  });

  it('accepts a full attribute map', () => {
    expect(() =>
      AztecAttributeMapSchema.parse({
        a: 1,
        b: 'x',
        c: { nested: [null, true] },
      }),
    ).not.toThrow();
  });

  it('rejects non-plain attribute maps', () => {
    class Foo {
      constructor(public readonly x: number) {}
    }
    expect(() => AztecAttributeMapSchema.parse(new Foo(1))).toThrow();
    expect(() => AztecAttributeMapSchema.parse(new Date())).toThrow();
    expect(() => AztecAttributeMapSchema.parse(Buffer.from([1, 2, 3]))).toThrow();
  });

  it('rejects non-finite numbers', () => {
    expect(() => AztecAttributeValueSchema.parse(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => AztecAttributeValueSchema.parse(Number.NaN)).toThrow();
  });
});
