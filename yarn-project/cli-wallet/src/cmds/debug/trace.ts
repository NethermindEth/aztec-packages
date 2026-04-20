import type { LogFn } from '@aztec/foundation/log';

import type { DebugSurface } from './types.js';

export type DebugTraceOptions = {
  tx: string;
  json?: boolean;
};

/** No-trace error used by `debug trace`, `debug export`, and `debug preview`. */
export const NO_TRACE_FOUND_ERROR =
  'debug: no trace found; re-run the failing command with --debug-capture or --debug-bundle-on-error ' +
  '(or set AZTEC_WALLET_DEBUG_CAPTURE=1)';

export async function runDebugTrace(
  debug: DebugSurface,
  identifier: string,
  options: Pick<DebugTraceOptions, 'json'>,
  log: LogFn,
): Promise<void> {
  const trace = await debug.getTrace(identifier);
  if (!trace) {
    throw new Error(NO_TRACE_FOUND_ERROR);
  }
  if (options.json) {
    log(JSON.stringify(trace));
    return;
  }
  log(JSON.stringify(trace, null, 2));
}
