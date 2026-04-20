import {
  type SpanHandle,
  type TraceHandle,
  type TraceRecorder,
  extractPrivateCallFrames,
  safeRecorderCall,
} from '@aztec/debugger';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { FunctionCall } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type AztecTrace,
  type RedactionPreview,
  type RedactionPreviewRequest,
  RedactionPreviewRequestSchema,
  SOURCE_REF_SCHEMA_VERSION,
  type SourceRef,
  type TraceBundleExportRequest,
  TraceBundleExportRequestSchema,
} from '@aztec/stdlib/debug';
import type { NoteDao } from '@aztec/stdlib/note';
import type { ContractOverrides, PrivateExecutionResult } from '@aztec/stdlib/tx';

import type { BlockSynchronizer } from '../block_synchronizer/block_synchronizer.js';
import type { ContractFunctionSimulator } from '../contract_function_simulator/contract_function_simulator.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import type { NotesFilter } from '../notes_filter.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { AnchorBlockStore } from '../storage/index.js';
import type { NoteStore } from '../storage/note_store/note_store.js';

/** Opaque wrapper returned by `pxe.debug.exportBundle`. Attachments are in-memory file payloads. */
export type LocalTraceBundleExport = {
  result: import('@aztec/stdlib/debug').TraceBundleExportResult;
  attachments: Map<string, Buffer>;
};

/**
 * Methods provided by this class might help debugging but must not be used in production.
 * No backwards compatibility or API stability should be expected. Use at your own risk.
 */
export class PXEDebugUtils {
  #putJobInQueue!: <T>(job: (jobId: string) => Promise<T>) => Promise<T>;
  #getSimulatorForTx!: (overrides?: { contracts?: ContractOverrides }) => ContractFunctionSimulator;
  #executeUtility!: (
    contractFunctionSimulator: ContractFunctionSimulator,
    call: FunctionCall,
    authWitnesses: AuthWitness[] | undefined,
    scopes: AztecAddress[],
    jobId: string,
  ) => Promise<any>;

  constructor(
    private contractSyncService: ContractSyncService,
    private noteStore: NoteStore,
    private blockStateSynchronizer: BlockSynchronizer,
    private anchorBlockStore: AnchorBlockStore,
    private contractStore: ContractStore,
    public readonly recorder: TraceRecorder,
  ) {}

  /**
   * Returns a recorded trace by trace id, tx hash, or provisional id. Resolves to undefined if
   * the trace is unknown or the recorder fails.
   */
  public getTrace(idOrTxHashOrProvisionalId: string): Promise<AztecTrace | undefined> {
    return safeRecorderCall<AztecTrace | undefined>(
      'getTrace',
      () => this.recorder.getTrace(idOrTxHashOrProvisionalId),
      undefined,
    );
  }

  /** Not injected through constructor since they're are co-dependant */
  public setPXEHelpers(
    putJobInQueue: <T>(job: (jobId: string) => Promise<T>) => Promise<T>,
    getSimulatorForTx: (overrides?: { contracts?: ContractOverrides }) => ContractFunctionSimulator,
    executeUtility: (
      contractFunctionSimulator: ContractFunctionSimulator,
      call: FunctionCall,
      authWitnesses: AuthWitness[] | undefined,
      scopes: AztecAddress[],
      jobId: string,
    ) => Promise<any>,
  ) {
    this.#putJobInQueue = putJobInQueue;
    this.#getSimulatorForTx = getSimulatorForTx;
    this.#executeUtility = executeUtility;
  }

  /**
   * A debugging utility to get notes based on the provided filter.
   *
   * Note that this should not be used in production code because the structure of notes is considered to be
   * an implementation detail of contracts. This is only meant to be used for debugging purposes. If you need to obtain
   * note-related information in production code, please implement a custom utility function on your contract and call
   * that function instead (e.g. `get_balance(owner: AztecAddress) -> u128` utility function on a Token contract).
   *
   * @param filter - The filter to apply to the notes.
   * @returns The requested notes.
   */
  public getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    return this.#putJobInQueue(async (jobId: string) => {
      await this.blockStateSynchronizer.sync();

      const anchorBlockHeader = await this.anchorBlockStore.getBlockHeader();

      const contractFunctionSimulator = this.#getSimulatorForTx();

      await this.contractSyncService.ensureContractSynced(
        filter.contractAddress,
        null,
        async (privateSyncCall, execScopes) =>
          await this.#executeUtility(contractFunctionSimulator, privateSyncCall, [], execScopes, jobId),
        anchorBlockHeader,
        jobId,
        filter.scopes,
      );

      return this.noteStore.getNotes(filter, jobId);
    });
  }

  /**
   * Triggers a sync of the PXE with the node.
   * Blocks until the sync is complete.
   */
  public sync(): Promise<void> {
    return this.#putJobInQueue(() => this.blockStateSynchronizer.sync());
  }

  /**
   * Extracts per-call-frame metadata from a completed `PrivateExecutionResult` and
   * appends it to the live trace as `AztecCallFrame[]` plus matching
   * `pxe.private_call` spans parented to the supplied phase span. Every recorder
   * action is wrapped in `safeRecorderCall`, so a redaction or recorder failure
   * cannot change outer PXE behavior.
   */
  public async recordPrivateCallFrames(
    trace: TraceHandle,
    phaseSpan: SpanHandle,
    privateExecutionResult: PrivateExecutionResult,
  ): Promise<void> {
    await safeRecorderCall<void>(
      'recordPrivateCallFrames',
      async () => {
        const resolveFunction = async (addr: string, selector: string) => {
          try {
            const address = AztecAddress.fromString(addr);
            const fnSelector = FunctionSelector.fromString(selector);
            const instance = await this.contractStore.getContractInstance(address);
            const artifactId = instance?.currentContractClassId.toString();
            const fn = await this.contractStore.getFunctionArtifact(address, fnSelector);
            const displayName = await this.contractStore.getDebugFunctionName(address, fnSelector);
            return {
              artifactId,
              contractName: fn?.contractName,
              functionName: fn?.name,
              displayName,
            };
          } catch {
            return undefined;
          }
        };
        const resolveSource = async (addr: string, selector: string): Promise<SourceRef | undefined> => {
          try {
            const address = AztecAddress.fromString(addr);
            const fnSelector = FunctionSelector.fromString(selector);
            const instance = await this.contractStore.getContractInstance(address);
            const artifactId = instance?.currentContractClassId.toString();
            if (!artifactId) {
              return undefined;
            }
            const debugMetadata = await this.contractStore.getFunctionDebugMetadata(address, fnSelector);
            const fn = await this.contractStore.getFunctionArtifact(address, fnSelector);
            const source: SourceRef = {
              schemaVersion: SOURCE_REF_SCHEMA_VERSION,
              artifactId,
              contractName: fn?.contractName,
              functionName: fn?.name,
            };
            const firstFileEntry = debugMetadata?.files && Object.entries(debugMetadata.files)[0];
            if (firstFileEntry) {
              const [fileIdRaw, fileInfo] = firstFileEntry;
              const fileId = Number(fileIdRaw);
              if (Number.isFinite(fileId)) {
                source.fileId = fileId;
              }
              if (fileInfo.path) {
                source.path = fileInfo.path;
              }
              const funcLoc = fileInfo.function_locations?.find(f => f.name === fn?.name);
              if (funcLoc) {
                source.span = { start: funcLoc.start, end: funcLoc.start };
              }
            }
            return source;
          } catch {
            return undefined;
          }
        };

        const { frames, spanInputs } = await extractPrivateCallFrames({
          privateExecutionResult,
          parentSpanId: phaseSpan.spanId,
          resolveFunction,
          resolveSource,
        });

        await safeRecorderCall('appendCallFrames', () => this.recorder.appendCallFrames(trace, frames), undefined);

        for (const input of spanInputs) {
          const handle = await safeRecorderCall<SpanHandle | undefined>(
            'startSpan',
            () => this.recorder.startSpan(trace, input),
            undefined,
          );
          if (handle) {
            await safeRecorderCall('endSpan', () => this.recorder.endSpan(handle, { status: 'ok' }), undefined);
          }
        }
      },
      undefined,
    );
  }

  /**
   * Returns the list of redacted / preserved field paths for the recorded trace
   * under a given policy. No values are surfaced. Returns `undefined` if the
   * trace is unknown or a redaction-internal error occurs.
   */
  public redactionPreview(req: RedactionPreviewRequest): Promise<RedactionPreview | undefined> {
    return safeRecorderCall<RedactionPreview | undefined>(
      'redactionPreview',
      async () => {
        const parsed = RedactionPreviewRequestSchema.parse(req);
        const trace = await this.recorder.getTrace(parsed.traceId);
        if (!trace) {
          return undefined;
        }
        const { randomBytes } = await import('@aztec/foundation/crypto/random');
        const { redactTrace } = await import('@aztec/debugger/bundle');
        const out = redactTrace(trace, parsed.policy, randomBytes(32), { preview: true });
        return {
          schemaVersion: 'aztec.redaction_preview.v1',
          traceId: parsed.traceId,
          policy: parsed.policy,
          redactedFields: out.redactedFields,
          preservedFields: out.preservedFields,
        };
      },
      undefined,
    );
  }

  /**
   * Builds a deterministic in-memory bundle for the given trace under the
   * `strict` redaction policy. Any other policy resolves to `undefined`
   * (the exporter throws `AZSEC_UNSAFE_EXPORT_CONTEXT` internally and the
   * error is swallowed at the `pxe.debug.*` boundary via `safeRecorderCall`).
   */
  public exportBundle(req: TraceBundleExportRequest): Promise<LocalTraceBundleExport | undefined> {
    return safeRecorderCall<LocalTraceBundleExport | undefined>(
      'exportBundle',
      async () => {
        const parsed = TraceBundleExportRequestSchema.parse(req);
        const trace = await this.recorder.getTrace(parsed.traceId);
        if (!trace) {
          return undefined;
        }
        const { buildLocalBundle } = await import('@aztec/debugger/bundle');
        return buildLocalBundle(trace, parsed);
      },
      undefined,
    );
  }
}
