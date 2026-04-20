import { type Logger, createLogger } from '@aztec/foundation/log';

const logger: Logger = createLogger('debugger:safe_call');

/**
 * Wraps a recorder call so that its rejection cannot change user-visible
 * wallet/PXE behavior. Logs the failure at warn level and resolves with the
 * caller-provided fallback instead.
 */
export async function safeRecorderCall<T>(op: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`TraceRecorder ${op} failed; ignoring`, err);
    return fallback;
  }
}
