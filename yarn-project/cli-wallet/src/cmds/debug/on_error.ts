import type { TraceRecorder } from '@aztec/debugger';
import type { LogFn } from '@aztec/foundation/log';
import { TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION } from '@aztec/stdlib/debug';

import path from 'node:path';

import type { DebugSurface } from './types.js';
import { writeBundleToDirectory } from './write_bundle.js';

export type WithErrorBundleDebug = {
  debug: DebugSurface;
  recorder?: TraceRecorder;
};

export type WithErrorBundleParams = {
  outDir: string | undefined;
  txHash?: string;
  provisionalTraceId?: string;
  log: LogFn;
};

/**
 * Runs `fn` and, on error, attempts a best-effort strict bundle export into
 * `<outDir>/<bundleId>/`. The original error is always re-thrown unchanged;
 * bundle-export failures are logged as warnings and never mask the cause.
 */
export async function withErrorBundle<T>(
  wallet: WithErrorBundleDebug,
  params: WithErrorBundleParams,
  fn: () => Promise<T>,
): Promise<T> {
  if (!params.outDir) {
    return await fn();
  }
  try {
    return await fn();
  } catch (err) {
    await tryExportBundle(wallet, params, err).catch(bundleErr => {
      params.log(`warn: debug bundle export failed: ${(bundleErr as Error).message ?? bundleErr}`);
    });
    throw err;
  }
}

async function tryExportBundle(
  wallet: WithErrorBundleDebug,
  params: WithErrorBundleParams,
  _cause: unknown,
): Promise<void> {
  const outDir = params.outDir!;
  let identifier = params.txHash ?? params.provisionalTraceId;
  if (!identifier && wallet.recorder) {
    identifier = await wallet.recorder.lastStartedTraceId();
  }
  if (!identifier) {
    params.log('warn: debug bundle export skipped: no in-flight trace identifier is available');
    return;
  }
  const resolvedOut = path.resolve(outDir);
  const bundle = await wallet.debug.exportBundle({
    schemaVersion: TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION,
    traceId: identifier,
    policy: 'strict',
    outputPath: resolvedOut,
  });
  if (!bundle) {
    params.log('warn: debug bundle export skipped: no trace found for the in-flight identifier');
    return;
  }
  const { bundleDirectory } = await writeBundleToDirectory(bundle, resolvedOut, { force: false });
  params.log(`debug: wrote error bundle to ${bundleDirectory}`);
}
