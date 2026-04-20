import { AztecErrorCodes, AztecTraceErrorCategorySchema, AztecTraceErrorSeveritySchema } from '@aztec/stdlib/debug';

import { ERROR_CATALOG } from './catalog.js';

describe('ERROR_CATALOG', () => {
  it('has an entry for every v1 AztecErrorCode', () => {
    for (const code of AztecErrorCodes) {
      expect(ERROR_CATALOG[code]).toBeDefined();
    }
    // No extra keys.
    expect(Object.keys(ERROR_CATALOG).sort()).toEqual([...AztecErrorCodes].sort());
  });

  it('every entry uses a valid category + severity', () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(() => AztecTraceErrorCategorySchema.parse(entry.category)).not.toThrow();
      expect(() => AztecTraceErrorSeveritySchema.parse(entry.severity)).not.toThrow();
      expect(typeof entry.retryable).toBe('boolean');
      expect(code.length).toBeGreaterThan(0);
    }
  });
});
