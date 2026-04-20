import { runDebugHints } from './hints.js';

describe('runDebugHints', () => {
  it('prints code, category, severity, retryable, and remediation for a known code', () => {
    const lines: string[] = [];
    const log = (msg: string) => lines.push(msg);
    runDebugHints({ error: 'AZPXE_SCOPE_DENIED' }, log);
    expect(lines.join('\n')).toMatch(/code: AZPXE_SCOPE_DENIED/);
    expect(lines.join('\n')).toMatch(/category: pxe/);
    expect(lines.join('\n')).toMatch(/severity: error/);
    expect(lines.join('\n')).toMatch(/retryable: false/);
    expect(lines.join('\n')).toMatch(/remediation: .+/);
  });

  it('throws on an unknown code', () => {
    const log = () => {};
    expect(() => runDebugHints({ error: 'AZ_UNKNOWN_CODE' }, log)).toThrow(/unknown error code: AZ_UNKNOWN_CODE/);
  });

  it('prints a JSON object when --json is set', () => {
    const lines: string[] = [];
    const log = (msg: string) => lines.push(msg);
    runDebugHints({ error: 'AZPXE_SCOPE_DENIED', json: true }, log);
    const parsed = JSON.parse(lines.join('\n'));
    expect(parsed.code).toBe('AZPXE_SCOPE_DENIED');
    expect(parsed.category).toBe('pxe');
    expect(parsed.severity).toBe('error');
    expect(parsed.retryable).toBe(false);
    expect(typeof parsed.remediationHint === 'string' || parsed.remediationHint === null).toBe(true);
  });
});
