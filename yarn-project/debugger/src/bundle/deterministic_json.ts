/**
 * Deterministic JSON serializer used by the bundle exporter. Object keys are
 * sorted lexicographically at every depth using the default JavaScript string
 * comparator (UTF-16 code units, locale-independent). The output carries no
 * trailing newline; callers decide whether to append one.
 *
 * Rejects: bigint, undefined, functions, symbols, non-finite numbers
 * (NaN/Infinity), class instances that carry non-enumerable methods. Plain
 * objects, arrays, strings, finite numbers, booleans, and null are supported.
 */
export function deterministicStringify(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`deterministicStringify: non-finite number (${value}) is not JSON-safe`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    throw new Error('deterministicStringify: bigint values are not JSON-safe');
  }
  if (typeof value === 'undefined') {
    throw new Error('deterministicStringify: undefined is not JSON-safe');
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`deterministicStringify: ${typeof value} is not JSON-safe`);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringify).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort();
    const parts = keys.map(key => `${JSON.stringify(key)}:${stringify(record[key])}`);
    return `{${parts.join(',')}}`;
  }
  throw new Error(`deterministicStringify: unsupported value of type ${typeof value}`);
}
