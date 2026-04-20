import type { LogFn } from '@aztec/foundation/log';
import { REDACTION_PREVIEW_REQUEST_SCHEMA_VERSION, type RedactionPolicy } from '@aztec/stdlib/debug';

import { NO_TRACE_FOUND_ERROR } from './trace.js';
import type { DebugSurface } from './types.js';

export type DebugPreviewOptions = {
  policy: RedactionPolicy;
  json?: boolean;
};

export async function runDebugPreview(
  debug: DebugSurface,
  identifier: string,
  options: DebugPreviewOptions,
  log: LogFn,
): Promise<void> {
  const preview = await debug.redactionPreview({
    schemaVersion: REDACTION_PREVIEW_REQUEST_SCHEMA_VERSION,
    traceId: identifier,
    policy: options.policy,
  });
  if (!preview) {
    throw new Error(NO_TRACE_FOUND_ERROR);
  }
  if (options.json) {
    log(JSON.stringify(preview));
    return;
  }
  log(`Policy: ${preview.policy}`);
  log(`Redacted paths (${preview.redactedFields.length}):`);
  for (const pathName of preview.redactedFields) {
    log(`  ${pathName}`);
  }
  log(`Preserved paths (${preview.preservedFields.length}):`);
  for (const pathName of preview.preservedFields) {
    log(`  ${pathName}`);
  }
}
