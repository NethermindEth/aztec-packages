import {
  REDACTION_MANIFEST_SCHEMA_VERSION,
  type RedactionManifest,
  RedactionManifestSchema,
} from './redaction.js';

const saltHex = 'a'.repeat(64);

const manifest: RedactionManifest = {
  schemaVersion: REDACTION_MANIFEST_SCHEMA_VERSION,
  policy: 'strict',
  saltHex,
  digestAlgorithm: 'HMAC-SHA256',
  redactedFields: ['args'],
  preservedFields: ['txHash'],
  createdAt: '2026-04-20T00:00:00Z',
};

describe('RedactionManifestSchema', () => {
  it('round-trips a valid manifest', () => {
    expect(RedactionManifestSchema.parse(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  });

  it('accepts uppercase hex for the salt', () => {
    const upper: RedactionManifest = { ...manifest, saltHex: 'A'.repeat(64) };
    expect(() => RedactionManifestSchema.parse(upper)).not.toThrow();
  });

  it('rejects a salt that is not 64 hex chars', () => {
    expect(() => RedactionManifestSchema.parse({ ...manifest, saltHex: 'abc' })).toThrow();
  });

  it('rejects a salt with a 0x prefix', () => {
    expect(() => RedactionManifestSchema.parse({ ...manifest, saltHex: '0x' + 'a'.repeat(62) })).toThrow();
  });

  it('rejects a salt with non-hex characters', () => {
    expect(() => RedactionManifestSchema.parse({ ...manifest, saltHex: 'z'.repeat(64) })).toThrow();
  });

  it('rejects an unknown schemaVersion', () => {
    expect(() => RedactionManifestSchema.parse({ ...manifest, schemaVersion: 'aztec.redaction.v2' })).toThrow();
  });

  it('rejects an unknown policy', () => {
    expect(() => RedactionManifestSchema.parse({ ...manifest, policy: 'open' })).toThrow();
  });
});
