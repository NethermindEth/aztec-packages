import {
  AZTEC_TRACE_ERROR_SCHEMA_VERSION,
  AztecErrorCodeSchema,
  AztecErrorCodes,
  type AztecTraceError,
  AztecTraceErrorSchema,
} from './errors.js';

describe('AztecErrorCodeSchema', () => {
  it('accepts every stable v1 code', () => {
    for (const code of AztecErrorCodes) {
      expect(() => AztecErrorCodeSchema.parse(code)).not.toThrow();
    }
  });

  it('rejects an unknown code', () => {
    expect(() => AztecErrorCodeSchema.parse('NOT_A_CODE')).toThrow();
  });

  it('does not contain deprecated legacy codes', () => {
    const codes: readonly string[] = AztecErrorCodes;
    expect(codes).not.toContain('AZNODE_PUBLIC_REVERT_REASON_LOST');
    expect(codes).not.toContain('AZPROVE_BROKER_UNAVAILABLE');
  });
});

describe('AztecTraceErrorSchema', () => {
  const err: AztecTraceError = {
    schemaVersion: AZTEC_TRACE_ERROR_SCHEMA_VERSION,
    errorId: 'err-1',
    code: 'AZDBG_UNKNOWN',
    message: 'something',
    category: 'unknown',
    severity: 'error',
    retryable: false,
    attributes: { hint: 'hello' },
  };

  it('round-trips a populated error', () => {
    expect(AztecTraceErrorSchema.parse(JSON.parse(JSON.stringify(err)))).toEqual(err);
  });

  it('rejects an unknown schemaVersion', () => {
    expect(() => AztecTraceErrorSchema.parse({ ...err, schemaVersion: 'aztec.error.v2' })).toThrow();
  });

  it('rejects an unknown code', () => {
    expect(() => AztecTraceErrorSchema.parse({ ...err, code: 'NOT_A_CODE' })).toThrow();
  });
});
