import { ERROR_CATALOG } from '@aztec/debugger/errors';
import type { LogFn } from '@aztec/foundation/log';
import type { AztecErrorCode } from '@aztec/stdlib/debug';

export type DebugHintsOptions = {
  error: string;
  json?: boolean;
};

export function runDebugHints(options: DebugHintsOptions, log: LogFn): void {
  const code = options.error;
  const entry = (ERROR_CATALOG as Readonly<Record<string, (typeof ERROR_CATALOG)[AztecErrorCode]>>)[code];
  if (!entry) {
    throw new Error(`unknown error code: ${code}`);
  }
  if (options.json) {
    log(
      JSON.stringify(
        {
          code,
          category: entry.category,
          severity: entry.severity,
          retryable: entry.retryable,
          remediationHint: entry.remediationHint ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }
  log(`code: ${code}`);
  log(`category: ${entry.category}`);
  log(`severity: ${entry.severity}`);
  log(`retryable: ${String(entry.retryable)}`);
  log(`remediation: ${entry.remediationHint ?? '(none)'}`);
}
