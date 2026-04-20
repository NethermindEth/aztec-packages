import { randomBytes } from '@aztec/foundation/crypto/random';
import {
  AZTEC_TRACE_ERROR_SCHEMA_VERSION,
  type AztecErrorCode,
  AztecErrorCodeSchema,
  type AztecTraceError,
  type AztecTraceErrorCategory,
  type AztecTracePhase,
} from '@aztec/stdlib/debug';
import { SimulationError } from '@aztec/stdlib/errors';

import { ERROR_CATALOG } from './catalog.js';

export type ClassifyStage = 'private' | 'kernel' | 'public' | 'validation' | 'proving' | 'utility';

export type ClassifyHint = {
  phase: AztecTracePhase;
  category: AztecTraceErrorCategory;
  stage?: ClassifyStage;
};

/** The hint shape a caller may attach directly to an Error to short-circuit the classifier. */
type ErrorWithDebuggerHint = Error & { debuggerErrorCode?: string };

/**
 * Classifies an `unknown` error thrown inside PXE phases into a stable v1
 * `AztecErrorCode`. Dispatch order matches plan D7:
 *   1) explicit `err.debuggerErrorCode` hint validated against the schema;
 *   2) typed `SimulationError` plus `stage`;
 *   3) narrow message-regex fallbacks for current plain `Error` sources;
 *   4) `AZDBG_UNKNOWN`.
 */
export function classifyPxeError(err: unknown, hint: ClassifyHint): AztecErrorCode {
  if (err && typeof err === 'object' && 'debuggerErrorCode' in err) {
    const candidate = (err as ErrorWithDebuggerHint).debuggerErrorCode;
    const parsed = AztecErrorCodeSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
  }

  if (err instanceof SimulationError) {
    if (hint.stage === 'public') {
      return 'AZNODE_PUBLIC_REVERT';
    }
    // Private/kernel simulation failures have no typed subclass to distinguish
    // further; fall through to the generic bucket.
    return 'AZDBG_UNKNOWN';
  }

  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';

  if (message.length > 0) {
    if (/Incompatible private environment version|expected oracle major version/i.test(message)) {
      return 'AZPXE_ORACLE_VERSION_MISMATCH';
    }
    if (/is not in the allowed scopes list|Key validation request denied/i.test(message)) {
      return 'AZPXE_SCOPE_DENIED';
    }
    if (/not yet proven|has not been proven|hasn't been proven/i.test(message)) {
      return 'AZSETTLE_NOT_YET_PROVEN';
    }
    if (/proven[- _]block[- _]?mismatch/i.test(message)) {
      return 'AZPXE_REORG_DIVERGENCE';
    }
    if (/tx was dropped|dropped from (the )?mempool|transaction was dropped/i.test(message)) {
      return 'AZSETTLE_DROPPED';
    }
  }

  return 'AZDBG_UNKNOWN';
}

/**
 * Produces a schema-valid `AztecTraceError` from a classified code + original
 * error. Callers that already know the phase/stage context should set them on
 * `hint`; attribute-level leakage is avoided (the redaction transform still
 * owns value protection).
 */
export function mapErrorCodeToTraceError(
  code: AztecErrorCode,
  err: unknown,
  hint: ClassifyHint,
  spanId?: string,
): AztecTraceError {
  const defaults = ERROR_CATALOG[code];
  const category = defaults.category ?? hint.category;
  const message = err instanceof Error ? err.message : String(err);
  const errorType = err instanceof Error ? err.name : typeof err;

  return {
    schemaVersion: AZTEC_TRACE_ERROR_SCHEMA_VERSION,
    errorId: randomBytes(16).toString('hex'),
    code,
    message,
    category,
    severity: defaults.severity,
    retryable: defaults.retryable,
    errorType,
    spanId,
    remediationHint: defaults.remediationHint,
  };
}
