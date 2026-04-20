import type { LocalTraceBundleExport } from '@aztec/debugger/bundle';
import {
  TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
  TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
  TraceBundlePaths,
} from '@aztec/stdlib/debug';

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runDebugExport } from './export.js';
import type { DebugSurface } from './types.js';

function makeBundle(bundleId = 'bundle-test-1'): LocalTraceBundleExport {
  const attachments = new Map<string, Buffer>([
    [TraceBundlePaths.trace, Buffer.from('{"trace":true}\n', 'utf8')],
    [TraceBundlePaths.spans, Buffer.from('{"spanId":"s"}\n', 'utf8')],
    [TraceBundlePaths.callFrames, Buffer.from('[]\n', 'utf8')],
    [TraceBundlePaths.errors, Buffer.from('[]\n', 'utf8')],
    [TraceBundlePaths.redaction, Buffer.from('{}\n', 'utf8')],
    [TraceBundlePaths.sourceIndex, Buffer.from('{"files":[]}\n', 'utf8')],
    [TraceBundlePaths.manifest, Buffer.from('{"bundleId":"m"}\n', 'utf8')],
  ]);
  return {
    result: {
      schemaVersion: TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
      bundleId,
      traceId: 'trace-x',
      outputPath: `memory://${bundleId}`,
      manifest: {
        schemaVersion: TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
        bundleId,
        traceId: 'trace-x',
        createdAt: '2026-04-20T00:00:00Z',
        policy: 'strict',
        files: [],
      },
    },
    attachments,
  };
}

function makeDebug(bundle: LocalTraceBundleExport | undefined): DebugSurface {
  return {
    getTrace: () => Promise.resolve(undefined),
    redactionPreview: () => Promise.resolve(undefined),
    exportBundle: () => Promise.resolve(bundle),
  };
}

function makeTmpDir(label: string): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), `azdbg-export-${label}-`));
}

describe('runDebugExport', () => {
  it('writes each attachment under <outDir>/<bundleId>/', async () => {
    const outDir = await makeTmpDir('happy');
    const bundle = makeBundle();
    await runDebugExport(makeDebug(bundle), 'trace-x', { outDir }, () => {});
    for (const rel of bundle.attachments.keys()) {
      const bytes = await fs.readFile(path.join(outDir, bundle.result.bundleId, rel));
      expect(Buffer.compare(bytes, bundle.attachments.get(rel)!)).toBe(0);
    }
  });

  it('throws when exportBundle resolves to undefined', async () => {
    const outDir = await makeTmpDir('none');
    await expect(runDebugExport(makeDebug(undefined), 'trace-x', { outDir }, () => {})).rejects.toThrow(
      /no trace found/,
    );
  });

  it('refuses a non-empty target without force; succeeds with force', async () => {
    const outDir = await makeTmpDir('force');
    const bundle = makeBundle();
    await runDebugExport(makeDebug(bundle), 'trace-x', { outDir }, () => {});
    await expect(runDebugExport(makeDebug(bundle), 'trace-x', { outDir }, () => {})).rejects.toThrow(/not empty/);
    await runDebugExport(makeDebug(bundle), 'trace-x', { outDir, force: true }, () => {});
  });

  it('success log includes bundleId and an absolute output path', async () => {
    const outDir = await makeTmpDir('log');
    const bundle = makeBundle();
    const lines: string[] = [];
    await runDebugExport(makeDebug(bundle), 'trace-x', { outDir }, msg => lines.push(msg));
    expect(lines.some(l => l.includes(bundle.result.bundleId))).toBe(true);
    expect(lines.some(l => l.includes(path.resolve(outDir, bundle.result.bundleId)))).toBe(true);
  });

  it('emits JSON when --json is set', async () => {
    const outDir = await makeTmpDir('json');
    const bundle = makeBundle();
    const lines: string[] = [];
    await runDebugExport(makeDebug(bundle), 'trace-x', { outDir, json: true }, msg => lines.push(msg));
    const parsed = JSON.parse(lines[0]);
    expect(parsed.bundleId).toBe(bundle.result.bundleId);
    expect(Array.isArray(parsed.files)).toBe(true);
  });

  it('two sequential exports with the same bundle produce byte-identical files under different bundleIds', async () => {
    const outDirA = await makeTmpDir('detA');
    const outDirB = await makeTmpDir('detB');
    const bundleA = makeBundle('bundle-A');
    const bundleB = makeBundle('bundle-B');
    // Same attachments map content for both
    for (const [k, v] of bundleA.attachments) {
      bundleB.attachments.set(k, Buffer.from(v));
    }
    await runDebugExport(makeDebug(bundleA), 'trace-x', { outDir: outDirA }, () => {});
    await runDebugExport(makeDebug(bundleB), 'trace-x', { outDir: outDirB }, () => {});
    for (const rel of bundleA.attachments.keys()) {
      const a = await fs.readFile(path.join(outDirA, 'bundle-A', rel));
      const b = await fs.readFile(path.join(outDirB, 'bundle-B', rel));
      expect(Buffer.compare(a, b)).toBe(0);
    }
  });

  it('no bundle file contains representative banned secret-value substrings', async () => {
    const bannedStrings = [
      'auth_witness_secret',
      'partial_witness',
      'capsule_data',
      'note_plaintext',
      'tagging_secret',
      'shared_secret',
      'wallet_from_address_secret_value',
    ];
    const outDir = await makeTmpDir('negative');
    const bundle = makeBundle();
    await runDebugExport(makeDebug(bundle), 'trace-x', { outDir }, () => {});
    const files = Array.from(bundle.attachments.keys());
    let concatenated = Buffer.alloc(0);
    for (const rel of files) {
      const bytes = await fs.readFile(path.join(outDir, bundle.result.bundleId, rel));
      concatenated = Buffer.concat([concatenated, bytes]);
    }
    const asString = concatenated.toString('utf8');
    for (const banned of bannedStrings) {
      expect(asString.includes(banned)).toBe(false);
    }
  });
});
