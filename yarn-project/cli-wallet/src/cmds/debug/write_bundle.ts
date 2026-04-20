import type { LocalTraceBundleExport } from '@aztec/debugger/bundle';

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type WriteBundleOptions = {
  force?: boolean;
};

export type WriteBundleResult = {
  bundleDirectory: string;
  writtenRelativePaths: string[];
};

/**
 * Writes the attachments of an in-memory bundle to disk under
 * `<outDir>/<bundleId>/`. Refuses a non-empty target unless `force` is set,
 * rejects absolute or `..`-bearing attachment paths, and returns the list of
 * written relative paths (lexicographically sorted).
 */
export async function writeBundleToDirectory(
  bundle: LocalTraceBundleExport,
  outDir: string,
  options: WriteBundleOptions = {},
): Promise<WriteBundleResult> {
  const bundleId = bundle.result.bundleId;
  if (!bundleId) {
    throw new Error('writeBundleToDirectory: bundle.result.bundleId is empty');
  }
  const bundleIdSegments = bundleId.split(/[\\/]+/);
  if (
    path.isAbsolute(bundleId) ||
    bundleIdSegments.length !== 1 ||
    bundleIdSegments.some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`writeBundleToDirectory: refusing unsafe bundle id ${bundleId}`);
  }
  const resolvedOut = path.resolve(outDir);
  const bundleDirectory = path.resolve(resolvedOut, bundleId);
  const bundleRel = path.relative(resolvedOut, bundleDirectory);
  if (bundleRel.startsWith('..') || path.isAbsolute(bundleRel)) {
    throw new Error(`writeBundleToDirectory: bundle id escapes output directory: ${bundleId}`);
  }

  let existingEntries: string[] = [];
  try {
    existingEntries = await fs.readdir(bundleDirectory);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
  if (existingEntries.length > 0 && options.force !== true) {
    throw new Error(
      `writeBundleToDirectory: target directory ${bundleDirectory} is not empty; pass --force to overwrite`,
    );
  }
  if (existingEntries.length > 0 && options.force === true) {
    await fs.rm(bundleDirectory, { recursive: true, force: true });
  }

  await fs.mkdir(bundleDirectory, { recursive: true });

  const written: string[] = [];
  for (const [relPath, buffer] of bundle.attachments) {
    if (!relPath) {
      throw new Error('writeBundleToDirectory: refusing to write empty attachment path');
    }
    if (path.isAbsolute(relPath)) {
      throw new Error(`writeBundleToDirectory: refusing absolute attachment path ${relPath}`);
    }
    const segments = relPath.split(/[\\/]+/);
    if (segments.some(segment => segment === '..')) {
      throw new Error(`writeBundleToDirectory: refusing attachment path with '..' segment: ${relPath}`);
    }
    const abs = path.resolve(bundleDirectory, relPath);
    const rel = path.relative(bundleDirectory, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`writeBundleToDirectory: attachment escapes bundle directory: ${relPath}`);
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    written.push(relPath);
  }
  written.sort();

  return { bundleDirectory, writtenRelativePaths: written };
}
