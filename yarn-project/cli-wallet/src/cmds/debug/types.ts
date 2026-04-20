import type { LocalTraceBundleExport } from '@aztec/debugger/bundle';
import type {
  AztecTrace,
  RedactionPreview,
  RedactionPreviewRequest,
  TraceBundleExportRequest,
} from '@aztec/stdlib/debug';

/**
 * Narrow debugger surface the CLI depends on. A CLI `wallet.debug` must
 * satisfy this shape; the real `PXEDebugUtils` does, as does the fake used
 * in unit tests.
 */
export interface DebugSurface {
  getTrace(idOrTxHashOrProvisionalId: string): Promise<AztecTrace | undefined>;
  redactionPreview(req: RedactionPreviewRequest): Promise<RedactionPreview | undefined>;
  exportBundle(req: TraceBundleExportRequest): Promise<LocalTraceBundleExport | undefined>;
}
