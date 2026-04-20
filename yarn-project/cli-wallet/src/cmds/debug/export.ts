import type { LogFn } from '@aztec/foundation/log';
import { TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION } from '@aztec/stdlib/debug';

import path from 'node:path';

import { NO_TRACE_FOUND_ERROR } from './trace.js';
import type { DebugSurface } from './types.js';
import { writeBundleToDirectory } from './write_bundle.js';

export type DebugExportOptions = {
  outDir: string;
  force?: boolean;
  json?: boolean;
};

export async function runDebugExport(
  debug: DebugSurface,
  identifier: string,
  options: DebugExportOptions,
  log: LogFn,
): Promise<void> {
  const resolvedOut = path.resolve(options.outDir);
  const bundle = await debug.exportBundle({
    schemaVersion: TRACE_BUNDLE_EXPORT_REQUEST_SCHEMA_VERSION,
    traceId: identifier,
    policy: 'strict',
    outputPath: resolvedOut,
  });
  if (!bundle) {
    throw new Error(NO_TRACE_FOUND_ERROR);
  }
  const { bundleDirectory, writtenRelativePaths } = await writeBundleToDirectory(bundle, resolvedOut, {
    force: options.force,
  });
  if (options.json) {
    log(
      JSON.stringify({
        bundleId: bundle.result.bundleId,
        traceId: bundle.result.traceId,
        bundleDirectory,
        files: writtenRelativePaths,
      }),
    );
    return;
  }
  log(`bundleId: ${bundle.result.bundleId}`);
  log(`outputPath: ${bundleDirectory}`);
  log(`files: ${writtenRelativePaths.length}`);
  for (const p of writtenRelativePaths) {
    log(`  ${p}`);
  }
}
