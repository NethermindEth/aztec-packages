import type { AztecErrorCode, AztecTraceErrorCategory, AztecTraceErrorSeverity } from '@aztec/stdlib/debug';

export type ErrorDefaults = {
  category: AztecTraceErrorCategory;
  severity: AztecTraceErrorSeverity;
  retryable: boolean;
  remediationHint?: string;
};

/** Default category/severity/retryable/remediationHint per v1 `AztecErrorCode`. */
export const ERROR_CATALOG: Readonly<Record<AztecErrorCode, ErrorDefaults>> = Object.freeze({
  AZPXE_ORACLE_VERSION_MISMATCH: {
    category: 'pxe',
    severity: 'error',
    retryable: false,
    remediationHint:
      'Contract was compiled against an oracle version incompatible with this PXE. Upgrade the PXE or recompile the contract.',
  },
  AZPXE_SCOPE_DENIED: {
    category: 'pxe',
    severity: 'error',
    retryable: false,
    remediationHint: 'Register the caller/scope address with the PXE, or widen the simulation scopes list.',
  },
  AZPXE_REORG_DIVERGENCE: {
    category: 'pxe',
    severity: 'warn',
    retryable: true,
    remediationHint: 'Local PXE state diverged from the node. Re-sync the PXE and retry.',
  },
  AZNODE_PUBLIC_REVERT: {
    category: 'node',
    severity: 'error',
    retryable: false,
    remediationHint: 'Public execution reverted on the node. Inspect public simulation output for the revert reason.',
  },
  AZNODE_SIMULATION_INCLUSION_MISMATCH: {
    category: 'node',
    severity: 'error',
    retryable: false,
    remediationHint: 'Node rejected the simulated tx as non-includable. Re-simulate against a fresh anchor block.',
  },
  AZPROVE_JOB_FAILED: {
    category: 'proving',
    severity: 'error',
    retryable: true,
    remediationHint: 'Private kernel proving job failed. Check the prover logs and retry.',
  },
  AZSETTLE_NOT_YET_PROVEN: {
    category: 'settlement',
    severity: 'info',
    retryable: true,
    remediationHint: 'Block has not yet been proven on L1. Poll again later.',
  },
  AZSETTLE_DROPPED: {
    category: 'settlement',
    severity: 'error',
    retryable: false,
    remediationHint: 'Transaction was dropped from the mempool before inclusion. Re-send with up-to-date state.',
  },
  AZSEC_UNSAFE_EXPORT_CONTEXT: {
    category: 'security',
    severity: 'error',
    retryable: false,
    remediationHint: 'Only the strict redaction policy is allowed through pxe.debug.exportBundle.',
  },
  AZDBG_UNKNOWN: {
    category: 'unknown',
    severity: 'error',
    retryable: false,
    remediationHint: 'Unrecognized error. See message for details.',
  },
});
