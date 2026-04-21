import type { AztecAttributeValue, AztecSpanEvent } from '@aztec/stdlib/debug';
import type { DebugLog } from '@aztec/stdlib/logs';

import { hmacDigestHex } from '../bundle/redaction.js';

export type DebugLogProjectionOptions = {
  /** HMAC salt shared with the call-frame projector for per-segment consistency. */
  salt: Buffer;
  /** Wrapper-span start time. Debug logs carry no per-log timestamp today. */
  wrapperSpanStartedAt: string;
};

/**
 * Project `DebugLog[]` into `AztecSpanEvent[]` attached to the public-phase
 * wrapper span. Raw `fields` never leave the boundary; only the field count
 * and an HMAC digest of the field values do.
 */
export function projectDebugLogs(logs: DebugLog[] | undefined, opts: DebugLogProjectionOptions): AztecSpanEvent[] {
  if (!logs || logs.length === 0) {
    return [];
  }
  return logs.map(log => {
    const attributes: Record<string, AztecAttributeValue> = {
      'aztec.contract.address': log.contractAddress.toString(),
      'aztec.log.level': log.level,
      'aztec.log.message_template': log.message,
      'aztec.log.field_count': log.fields.length,
      'aztec.log.fields_digest': hmacDigestHex(
        log.fields.map(f => f.toString()),
        opts.salt,
      ),
    };
    return {
      name: 'avm.debug_log',
      timestamp: opts.wrapperSpanStartedAt,
      attributes,
    };
  });
}
