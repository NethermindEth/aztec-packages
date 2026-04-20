import type { LocalTraceBundleExport } from '@aztec/debugger/bundle';
import {
  TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
  TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
  TraceBundlePaths,
} from '@aztec/stdlib/debug';

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { writeBundleToDirectory } from './write_bundle.js';

const traceBytes = Buffer.from('{"trace":true}\n', 'utf8');
const spansBytes = Buffer.from('{"spanId":"s"}\n', 'utf8');
const manifestBytes = Buffer.from('{"bundleId":"b"}\n', 'utf8');

function makeBundle(overrides: { attachments?: Map<string, Buffer>; bundleId?: string } = {}): LocalTraceBundleExport {
  const attachments =
    overrides.attachments ??
    new Map<string, Buffer>([
      [TraceBundlePaths.trace, traceBytes],
      [TraceBundlePaths.spans, spansBytes],
      [TraceBundlePaths.manifest, manifestBytes],
    ]);
  const bundleId = overrides.bundleId ?? 'bundle-001';
  return {
    result: {
      schemaVersion: TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
      bundleId,
      traceId: 'trace-001',
      outputPath: `memory://${bundleId}`,
      manifest: {
        schemaVersion: TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
        bundleId,
        traceId: 'trace-001',
        createdAt: '2026-04-20T00:00:00Z',
        policy: 'strict',
        files: [],
      },
    },
    attachments,
  };
}

function makeTmpDir(label: string): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), `azdbg-write-${label}-`));
}

describe('writeBundleToDirectory', () => {
  it('writes every attachment exactly once under <outDir>/<bundleId>/', async () => {
    const outDir = await makeTmpDir('happy');
    const bundle = makeBundle();
    const { bundleDirectory, writtenRelativePaths } = await writeBundleToDirectory(bundle, outDir);
    expect(bundleDirectory).toBe(path.join(outDir, bundle.result.bundleId));
    for (const relPath of bundle.attachments.keys()) {
      const bytes = await fs.readFile(path.join(bundleDirectory, relPath));
      expect(Buffer.compare(bytes, bundle.attachments.get(relPath)!)).toBe(0);
    }
    expect(writtenRelativePaths).toEqual([...bundle.attachments.keys()].sort());
  });

  it('returns relative paths in lexicographic order', async () => {
    const outDir = await makeTmpDir('lex');
    const { writtenRelativePaths } = await writeBundleToDirectory(makeBundle(), outDir);
    const sorted = [...writtenRelativePaths].sort();
    expect(writtenRelativePaths).toEqual(sorted);
  });

  it('refuses a non-empty target without --force', async () => {
    const outDir = await makeTmpDir('nonempty');
    const bundle = makeBundle();
    await writeBundleToDirectory(bundle, outDir);
    await expect(writeBundleToDirectory(bundle, outDir)).rejects.toThrow(/not empty/);
  });

  it('overwrites a non-empty target when --force is set', async () => {
    const outDir = await makeTmpDir('force');
    const bundle = makeBundle();
    await writeBundleToDirectory(bundle, outDir);
    await fs.writeFile(path.join(outDir, bundle.result.bundleId, 'stale.txt'), 'stale');
    const overridden = makeBundle({
      attachments: new Map<string, Buffer>([[TraceBundlePaths.trace, Buffer.from('updated', 'utf8')]]),
    });
    await writeBundleToDirectory(overridden, outDir, { force: true });
    const bytes = await fs.readFile(path.join(outDir, bundle.result.bundleId, TraceBundlePaths.trace));
    expect(bytes.toString('utf8')).toBe('updated');
    await expect(fs.access(path.join(outDir, bundle.result.bundleId, 'stale.txt'))).rejects.toThrow();
  });

  it('rejects absolute attachment paths', async () => {
    const outDir = await makeTmpDir('abs');
    const bundle = makeBundle({ attachments: new Map([['/etc/passwd', Buffer.from('x')]]) });
    await expect(writeBundleToDirectory(bundle, outDir)).rejects.toThrow(/absolute attachment path/);
  });

  it('rejects attachment paths containing .. segments', async () => {
    const outDir = await makeTmpDir('traversal');
    const bundle = makeBundle({ attachments: new Map([['../escape.txt', Buffer.from('x')]]) });
    await expect(writeBundleToDirectory(bundle, outDir)).rejects.toThrow(/\.\.'? segment/);
  });

  it('rejects empty attachment paths', async () => {
    const outDir = await makeTmpDir('empty');
    const bundle = makeBundle({ attachments: new Map([['', Buffer.from('x')]]) });
    await expect(writeBundleToDirectory(bundle, outDir)).rejects.toThrow(/empty attachment path/);
  });

  it('rejects bundle ids that are not a single safe directory name', async () => {
    const outDir = await makeTmpDir('bundleid');
    await expect(writeBundleToDirectory(makeBundle({ bundleId: '../escape' }), outDir)).rejects.toThrow(
      /unsafe bundle id/,
    );
    await expect(writeBundleToDirectory(makeBundle({ bundleId: 'nested/bundle' }), outDir)).rejects.toThrow(
      /unsafe bundle id/,
    );
  });

  it('writes trace.json byte-for-byte identically to the bundle attachments', async () => {
    const outDir = await makeTmpDir('bytes');
    const bundle = makeBundle();
    const { bundleDirectory } = await writeBundleToDirectory(bundle, outDir);
    const bytes = await fs.readFile(path.join(bundleDirectory, TraceBundlePaths.trace));
    expect(Buffer.compare(bytes, bundle.attachments.get(TraceBundlePaths.trace)!)).toBe(0);
  });
});
