import { TraceBundlePaths } from '@aztec/stdlib/debug';

import { buildManifest } from './manifest.js';

function files(entries: Record<string, string>): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const [path, text] of Object.entries(entries)) {
    map.set(path, Buffer.from(text, 'utf8'));
  }
  return map;
}

describe('buildManifest', () => {
  const base = {
    traceId: 'trace-1',
    policy: 'strict' as const,
    createdAt: '2026-04-21T00:00:00.000Z',
  };

  it('produces a byte-equal manifest for byte-equal inputs', () => {
    const a = buildManifest({ ...base, files: files({ 'trace.json': '{"a":1}', 'errors.json': '[]' }) });
    const b = buildManifest({ ...base, files: files({ 'trace.json': '{"a":1}', 'errors.json': '[]' }) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.bundleId).toBe(b.bundleId);
  });

  it('changes bundleId if any file changes', () => {
    const a = buildManifest({ ...base, files: files({ 'trace.json': '{"a":1}' }) });
    const b = buildManifest({ ...base, files: files({ 'trace.json': '{"a":2}' }) });
    expect(a.bundleId).not.toBe(b.bundleId);
  });

  it('excludes manifest.json from files but keeps payloads sorted', () => {
    const manifest = buildManifest({
      ...base,
      files: files({ 'trace.json': '{}', 'spans.ndjson': '' }),
    });
    expect(manifest.files.map(f => f.path)).toEqual(['spans.ndjson', 'trace.json']);
    expect(manifest.files.find(f => f.path === TraceBundlePaths.manifest)).toBeUndefined();
  });

  it('refuses input that already contains manifest.json', () => {
    expect(() =>
      buildManifest({
        ...base,
        files: files({ [TraceBundlePaths.manifest]: '{}' }),
      }),
    ).toThrow();
  });

  it('writes a 64-char hex content hash per entry', () => {
    const manifest = buildManifest({ ...base, files: files({ 'trace.json': 'abc' }) });
    expect(manifest.files[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files[0].byteLength).toBe(3);
  });
});
