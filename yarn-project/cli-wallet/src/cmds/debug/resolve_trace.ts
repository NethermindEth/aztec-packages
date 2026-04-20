import type { WalletDB } from '../../storage/wallet_db.js';
import { aliasedTxHashParser } from '../../utils/options/options.js';

/**
 * Resolves an input string to a trace identifier. Accepts a transaction alias
 * (looked up in the wallet DB), a raw tx hash, a final trace id, or a
 * provisional trace id. Alias resolution falls through to the raw input so
 * raw trace/provisional ids still reach the recorder unmodified.
 */
export function resolveTraceIdentifier(input: string, db?: WalletDB): string {
  if (!input) {
    throw new Error('--tx requires a value');
  }
  try {
    return aliasedTxHashParser(input, db).toString();
  } catch {
    return input;
  }
}
