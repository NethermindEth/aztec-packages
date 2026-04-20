import { AztecTraceErrorSchema } from '@aztec/stdlib/debug';
import { SimulationError } from '@aztec/stdlib/errors';

import { classifyPxeError, mapErrorCodeToTraceError } from './classify.js';

describe('classifyPxeError', () => {
  it('honors an explicit debuggerErrorCode hint on the error', () => {
    const err = Object.assign(new Error('x'), { debuggerErrorCode: 'AZNODE_PUBLIC_REVERT' });
    expect(classifyPxeError(err, { phase: 'pxe_execution', category: 'pxe' })).toBe('AZNODE_PUBLIC_REVERT');
  });

  it('ignores invalid debuggerErrorCode values', () => {
    const err = Object.assign(new Error('x'), { debuggerErrorCode: 'not_a_code' });
    expect(classifyPxeError(err, { phase: 'pxe_execution', category: 'pxe' })).toBe('AZDBG_UNKNOWN');
  });

  it('maps SimulationError with stage=public to AZNODE_PUBLIC_REVERT', () => {
    const err = new SimulationError('revert happened', []);
    expect(classifyPxeError(err, { phase: 'pxe_execution', category: 'node', stage: 'public' })).toBe(
      'AZNODE_PUBLIC_REVERT',
    );
  });

  it('maps SimulationError without stage=public to AZDBG_UNKNOWN', () => {
    const err = new SimulationError('m', []);
    expect(classifyPxeError(err, { phase: 'pxe_execution', category: 'pxe' })).toBe('AZDBG_UNKNOWN');
  });

  it('maps the oracle-version mismatch message to AZPXE_ORACLE_VERSION_MISMATCH', () => {
    const err = new Error('Incompatible private environment version: ... (expected oracle major version 13, got 12)');
    expect(classifyPxeError(err, { phase: 'pxe_execution', category: 'pxe' })).toBe('AZPXE_ORACLE_VERSION_MISMATCH');
  });

  it('maps the scope-denied message to AZPXE_SCOPE_DENIED', () => {
    const err = new Error('Scope 0x12 is not in the allowed scopes list: [0x10, 0x11]');
    expect(classifyPxeError(err, { phase: 'pxe_execution', category: 'pxe' })).toBe('AZPXE_SCOPE_DENIED');
  });

  it('maps a dropped-tx message to AZSETTLE_DROPPED', () => {
    const err = new Error('transaction was dropped from the mempool before inclusion');
    expect(classifyPxeError(err, { phase: 'settlement', category: 'settlement' })).toBe('AZSETTLE_DROPPED');
  });

  it('maps a not-yet-proven message to AZSETTLE_NOT_YET_PROVEN', () => {
    const err = new Error('block has not been proven on L1 yet');
    expect(classifyPxeError(err, { phase: 'settlement', category: 'settlement' })).toBe('AZSETTLE_NOT_YET_PROVEN');
  });

  it('maps a proven-block mismatch message to AZPXE_REORG_DIVERGENCE', () => {
    const err = new Error('proven block mismatch while syncing local state');
    expect(classifyPxeError(err, { phase: 'pxe_execution', category: 'pxe' })).toBe('AZPXE_REORG_DIVERGENCE');
  });

  it('falls through to AZDBG_UNKNOWN for generic Errors', () => {
    expect(classifyPxeError(new Error('something broke'), { phase: 'pxe_execution', category: 'pxe' })).toBe(
      'AZDBG_UNKNOWN',
    );
  });

  it('handles non-Error throwables gracefully', () => {
    expect(classifyPxeError('boom', { phase: 'pxe_execution', category: 'pxe' })).toBe('AZDBG_UNKNOWN');
    expect(classifyPxeError(42, { phase: 'pxe_execution', category: 'pxe' })).toBe('AZDBG_UNKNOWN');
  });
});

describe('mapErrorCodeToTraceError', () => {
  it('produces a schema-valid trace error', () => {
    const err = new Error('boom');
    const payload = mapErrorCodeToTraceError(
      'AZPXE_ORACLE_VERSION_MISMATCH',
      err,
      { phase: 'pxe_execution', category: 'pxe' },
      'span-1',
    );
    expect(() => AztecTraceErrorSchema.parse(payload)).not.toThrow();
    expect(payload.code).toBe('AZPXE_ORACLE_VERSION_MISMATCH');
    expect(payload.category).toBe('pxe');
    expect(payload.spanId).toBe('span-1');
    expect(payload.remediationHint).toBeDefined();
  });

  it('accepts non-Error inputs without throwing', () => {
    const payload = mapErrorCodeToTraceError('AZDBG_UNKNOWN', 'some string', {
      phase: 'pxe_execution',
      category: 'unknown',
    });
    expect(payload.message).toBe('some string');
    expect(payload.errorType).toBe('string');
  });
});
