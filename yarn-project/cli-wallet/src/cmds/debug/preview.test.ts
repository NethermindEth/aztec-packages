import { REDACTION_PREVIEW_SCHEMA_VERSION, type RedactionPolicy } from '@aztec/stdlib/debug';

import { runDebugPreview } from './preview.js';
import type { DebugSurface } from './types.js';

function makeDebug(
  preview: { redactedFields: string[]; preservedFields: string[]; policy: RedactionPolicy } | undefined,
): DebugSurface {
  return {
    getTrace: () => Promise.resolve(undefined),
    redactionPreview: req =>
      Promise.resolve(
        preview
          ? {
              schemaVersion: REDACTION_PREVIEW_SCHEMA_VERSION,
              traceId: req.traceId,
              policy: preview.policy,
              redactedFields: preview.redactedFields,
              preservedFields: preview.preservedFields,
            }
          : undefined,
      ),
    exportBundle: () => Promise.resolve(undefined),
  };
}

describe('runDebugPreview', () => {
  it('prints redacted and preserved paths; never prints values', async () => {
    const debug = makeDebug({
      redactedFields: ['spans[0].attributes.secret'],
      preservedFields: ['traceId'],
      policy: 'strict',
    });
    const lines: string[] = [];
    await runDebugPreview(debug, 't', { policy: 'strict' }, msg => lines.push(msg));
    const out = lines.join('\n');
    expect(out).toContain('spans[0].attributes.secret');
    expect(out).toContain('traceId');
    expect(out).toMatch(/Redacted paths \(1\):/);
    expect(out).toMatch(/Preserved paths \(1\):/);
  });

  it('accepts all three redaction policies', async () => {
    for (const policy of ['strict', 'balanced', 'local_full'] as RedactionPolicy[]) {
      const debug = makeDebug({ redactedFields: [], preservedFields: [], policy });
      await expect(runDebugPreview(debug, 't', { policy }, () => {})).resolves.toBeUndefined();
    }
  });

  it('emits single-line JSON when --json is set', async () => {
    const debug = makeDebug({ redactedFields: ['a'], preservedFields: ['b'], policy: 'balanced' });
    const lines: string[] = [];
    await runDebugPreview(debug, 't', { policy: 'balanced', json: true }, msg => lines.push(msg));
    const parsed = JSON.parse(lines[0]);
    expect(parsed.redactedFields).toEqual(['a']);
    expect(parsed.preservedFields).toEqual(['b']);
  });

  it('throws when the preview resolves to undefined', async () => {
    const debug = makeDebug(undefined);
    await expect(runDebugPreview(debug, 't', { policy: 'strict' }, () => {})).rejects.toThrow(/no trace found/);
  });
});
