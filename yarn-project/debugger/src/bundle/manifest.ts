import { sha256 } from '@aztec/foundation/crypto/sha256';
import {
  type RedactionPolicy,
  TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
  type TraceBundleFileEntry,
  type TraceBundleManifest,
  TraceBundlePaths,
} from '@aztec/stdlib/debug';

import { deterministicStringify } from './deterministic_json.js';

/** Computes sha256(bytes).toString('hex') on a payload file. */
export function hashFileBytes(bytes: Buffer): string {
  return sha256(bytes).toString('hex');
}

export type BuildManifestInput = {
  traceId: string;
  policy: RedactionPolicy;
  createdAt: string;
  /**
   * Payload files by path (relative). `manifest.json` itself must NOT be included;
   * it would cause a recursion on the content hash.
   */
  files: Map<string, Buffer>;
};

/**
 * Derives a `TraceBundleManifest` from the raw payload-file bytes. The
 * resulting `bundleId` is `sha256(manifest-without-bundle-id-bytes)` so it is
 * stable across runs given identical inputs, and the manifest never lists
 * itself under `files`.
 */
export function buildManifest({ traceId, policy, createdAt, files }: BuildManifestInput): TraceBundleManifest {
  if (files.has(TraceBundlePaths.manifest)) {
    throw new Error(`buildManifest: input files must not include ${TraceBundlePaths.manifest}`);
  }

  const entries: TraceBundleFileEntry[] = [];
  for (const [path, bytes] of files) {
    entries.push({
      path,
      contentHash: hashFileBytes(bytes),
      byteLength: bytes.byteLength,
    });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const manifestWithoutBundleId = {
    schemaVersion: TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
    traceId,
    createdAt,
    policy,
    files: entries,
  };
  const bundleId = sha256(Buffer.from(deterministicStringify(manifestWithoutBundleId), 'utf8')).toString('hex');

  return {
    schemaVersion: TRACE_BUNDLE_MANIFEST_SCHEMA_VERSION,
    bundleId,
    traceId,
    createdAt,
    policy,
    files: entries,
  };
}
