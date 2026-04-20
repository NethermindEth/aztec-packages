import type { TraceRecorder } from '@aztec/debugger';
import type { LocalTraceBundleExport } from '@aztec/debugger/bundle';
import {
  TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
  TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
  TraceBundlePaths,
} from '@aztec/stdlib/debug';

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { withErrorBundle } from './on_error.js';
import type { DebugSurface } from './types.js';

function makeBundle(id = 'bundle-err'): LocalTraceBundleExport {
  return {
    result: {
      schemaVersion: TRACE_BUNDLE_EXPORT_RESULT_SCHEMA_VERSION,
      bundleId: id,
      traceId: 'tr',
      outputPath: `memory://${id}`,
      manifest: {
        schemaVersion: TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
        bundleId: id,
        traceId: 'tr',
        createdAt: '2026-04-20T00:00:00Z',
        policy: 'strict',
        files: [],
      },
    },
    attachments: new Map<string, Buffer>([
      [TraceBundlePaths.trace, Buffer.from('{}\n', 'utf8')],
      [TraceBundlePaths.manifest, Buffer.from('{}\n', 'utf8')],
    ]),
  };
}

function makeDebug(fn: (traceId: string) => LocalTraceBundleExport | undefined): DebugSurface {
  return {
    getTrace: () => Promise.resolve(undefined),
    redactionPreview: () => Promise.resolve(undefined),
    exportBundle: req => Promise.resolve(fn(req.traceId)),
  };
}

function makeRecorder(lastId: string | undefined): TraceRecorder {
  return {
    startTrace: () => Promise.resolve({ traceId: '', provisionalTraceId: '' }),
    startSpan: () => Promise.resolve({ traceId: '', spanId: '' }),
    endSpan: () => Promise.resolve(),
    recordEvent: () => Promise.resolve(),
    recordError: () => Promise.resolve(),
    appendCallFrames: () => Promise.resolve(),
    bindTxHash: () => Promise.resolve(),
    getTrace: () => Promise.resolve(undefined),
    lastStartedTraceId: () => Promise.resolve(lastId),
    clear: () => Promise.resolve(),
  };
}

function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'azdbg-err-'));
}

describe('withErrorBundle', () => {
  it('runs fn unchanged when outDir is undefined', async () => {
    const debug = makeDebug(() => undefined);
    const result = await withErrorBundle({ debug }, { outDir: undefined, log: () => {} }, () => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('returns fn result on success and never exports a bundle', async () => {
    const outDir = await makeTmpDir();
    let called = false;
    const debug: DebugSurface = {
      getTrace: () => Promise.resolve(undefined),
      redactionPreview: () => Promise.resolve(undefined),
      exportBundle: () => {
        called = true;
        return Promise.resolve(makeBundle());
      },
    };
    const result = await withErrorBundle({ debug }, { outDir, log: () => {} }, () => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(called).toBe(false);
  });

  it('on error with txHash: exports keyed on tx hash, re-throws original error', async () => {
    const outDir = await makeTmpDir();
    const captured: string[] = [];
    const debug = makeDebug(traceId => {
      captured.push(traceId);
      return makeBundle('err-tx');
    });
    const original = new Error('kaboom');
    await expect(
      withErrorBundle({ debug }, { outDir, txHash: '0xdeadbeef', log: () => {} }, () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(captured).toEqual(['0xdeadbeef']);
    const bytes = await fs.readFile(path.join(outDir, 'err-tx', TraceBundlePaths.trace));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('on error before binding: falls back to lastStartedTraceId from the recorder', async () => {
    const outDir = await makeTmpDir();
    const captured: string[] = [];
    const debug = makeDebug(traceId => {
      captured.push(traceId);
      return makeBundle('err-prov');
    });
    const original = new Error('pre-bind');
    const recorder = makeRecorder('last-trace-id');
    await expect(
      withErrorBundle({ debug, recorder }, { outDir, log: () => {} }, () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(captured).toEqual(['last-trace-id']);
  });

  it('exportBundle undefined: logs a warning, still re-throws the original error', async () => {
    const outDir = await makeTmpDir();
    const debug = makeDebug(() => undefined);
    const logs: string[] = [];
    const original = new Error('no-trace');
    await expect(
      withErrorBundle({ debug }, { outDir, txHash: '0xff', log: msg => logs.push(msg) }, () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(logs.some(l => /no trace found/.test(l))).toBe(true);
  });

  it('disk write failure is swallowed; original error is still re-thrown', async () => {
    const outDir = await makeTmpDir();
    // Bundle has an absolute attachment path, which writeBundleToDirectory rejects.
    const bundle = makeBundle('err-fail');
    bundle.attachments.clear();
    bundle.attachments.set('/absolute', Buffer.from('x'));
    const debug = makeDebug(() => bundle);
    const logs: string[] = [];
    const original = new Error('boom');
    await expect(
      withErrorBundle({ debug }, { outDir, txHash: '0xff', log: msg => logs.push(msg) }, () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(logs.some(l => /debug bundle export failed/.test(l))).toBe(true);
  });

  it('no identifier available: logs a warning, still re-throws the original error', async () => {
    const outDir = await makeTmpDir();
    const debug = makeDebug(() => makeBundle());
    const logs: string[] = [];
    const original = new Error('orphan');
    const recorder = makeRecorder(undefined);
    await expect(
      withErrorBundle({ debug, recorder }, { outDir, log: msg => logs.push(msg) }, () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(logs.some(l => /no in-flight trace identifier/.test(l))).toBe(true);
  });
});
