import {
  SOURCE_INDEX_SCHEMA_VERSION,
  SOURCE_REF_SCHEMA_VERSION,
  type SourceIndex,
  SourceIndexSchema,
  type SourceRef,
  SourceRefSchema,
} from './source.js';

const validRef: SourceRef = {
  schemaVersion: SOURCE_REF_SCHEMA_VERSION,
  artifactId: 'artifact-1',
  contractName: 'Token',
  functionName: 'transfer',
  path: 'src/main.nr',
  fileId: 0,
  span: { start: 0, end: 10 },
  line: 5,
  column: 2,
};

describe('SourceRefSchema', () => {
  it('round-trips a valid reference', () => {
    const parsed = SourceRefSchema.parse(JSON.parse(JSON.stringify(validRef)));
    expect(parsed).toEqual(validRef);
  });

  it('rejects an unknown schemaVersion', () => {
    expect(() => SourceRefSchema.parse({ ...validRef, schemaVersion: 'aztec.source_ref.v2' })).toThrow();
  });

  it('rejects a source span whose end is before its start', () => {
    expect(() => SourceRefSchema.parse({ ...validRef, span: { start: 10, end: 5 } })).toThrow();
  });
});

describe('SourceIndexSchema', () => {
  const index: SourceIndex = {
    schemaVersion: SOURCE_INDEX_SCHEMA_VERSION,
    createdAt: '2026-04-20T00:00:00Z',
    files: [{ fileId: 0, path: 'src/main.nr' }],
    entries: [{ artifactId: 'artifact-1', fileId: 0 }],
    limitations: ['getFunctionDebugMetadata currently uses the first debug info entry for a function.'],
  };

  it('round-trips a valid index', () => {
    const parsed = SourceIndexSchema.parse(JSON.parse(JSON.stringify(index)));
    expect(parsed).toEqual(index);
  });

  it('rejects an unknown schemaVersion', () => {
    expect(() => SourceIndexSchema.parse({ ...index, schemaVersion: 'aztec.source_index.v2' })).toThrow();
  });
});
