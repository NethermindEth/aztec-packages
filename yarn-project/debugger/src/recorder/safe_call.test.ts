import { safeRecorderCall } from './safe_call.js';

describe('safeRecorderCall', () => {
  it('returns the awaited value on success', async () => {
    const result = await safeRecorderCall('op', () => Promise.resolve(42), 0);
    expect(result).toBe(42);
  });

  it('returns the fallback when the call rejects', async () => {
    const result = await safeRecorderCall('op', () => Promise.reject(new Error('boom')), 'fallback');
    expect(result).toBe('fallback');
  });

  it('returns the fallback when the callback throws synchronously', async () => {
    const result = await safeRecorderCall(
      'op',
      () => {
        throw new Error('sync boom');
      },
      'fallback',
    );
    expect(result).toBe('fallback');
  });
});
