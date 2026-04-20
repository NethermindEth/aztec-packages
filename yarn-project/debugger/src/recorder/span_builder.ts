import { sha256 } from '@aztec/foundation/crypto/sha256';
import type { AztecAttributeValue, AztecCallFrame, SourceRef } from '@aztec/stdlib/debug';
import type { PrivateCallExecutionResult, PrivateExecutionResult } from '@aztec/stdlib/tx';

import type { StartSpanInput } from './trace_recorder.js';

/** Function-display metadata used to label a private call frame and its span. */
export type ResolvedFunction = {
  artifactId?: string;
  contractName?: string;
  functionName?: string;
  displayName?: string;
};

export type ResolveFunction = (
  contractAddress: string,
  functionSelector: string,
) => Promise<ResolvedFunction | undefined>;

export type ResolveSource = (contractAddress: string, functionSelector: string) => Promise<SourceRef | undefined>;

export type ExtractPrivateCallFramesInput = {
  privateExecutionResult: PrivateExecutionResult;
  parentSpanId: string;
  resolveFunction: ResolveFunction;
  resolveSource: ResolveSource;
};

export type ExtractPrivateCallFramesOutput = {
  frames: AztecCallFrame[];
  spanInputs: StartSpanInput[];
};

/** Internal attribute names consumed by the strict-redaction transform (see bundle/redaction.ts). */
export const ARGS_HASH_ATTR = 'aztec.private.args_hash';
export const RETURNS_HASH_ATTR = 'aztec.private.returns_hash';

function hashHex32(parts: readonly (string | number)[]): string {
  return sha256(Buffer.from(parts.map(String).join('|'), 'utf8'))
    .toString('hex')
    .slice(0, 32);
}

function deterministicCallFrameId(depth: number, index: number, contractAddress: string, selector: string): string {
  return hashHex32(['frame', depth, index, contractAddress, selector]);
}

function deterministicSpanId(callFrameId: string): string {
  return hashHex32(['span', callFrameId]);
}

type Node = {
  depth: number;
  parentCallFrameId?: string;
  parentSpanId: string;
  call: PrivateCallExecutionResult;
};

/**
 * Project a PrivateExecutionResult into AztecCallFrame[] plus matching StartSpanInput[]
 * for `pxe.private_call` spans. Frames/spans are emitted depth-first, preorder (root first).
 *
 * The function MUST NOT read `partialWitness`, `acir`, `vk`, `newNotes`, `returnValues`,
 * `offchainEffects.data`, `taggingIndexRanges`, or `contractClassLogs` contents. Only
 * whitelisted `publicInputs` fields are surfaced, and `argsHash` / `returnsHash` are
 * stored on internal `secret_local` attributes so the redaction transform can digest
 * them into `argsDigest` / `returnDigest` on the call frame and strip the originals.
 */
export async function extractPrivateCallFrames({
  privateExecutionResult,
  parentSpanId,
  resolveFunction,
  resolveSource,
}: ExtractPrivateCallFramesInput): Promise<ExtractPrivateCallFramesOutput> {
  const frames: AztecCallFrame[] = [];
  const spanInputs: StartSpanInput[] = [];
  let preorderIndex = 0;

  // Iterative preorder traversal; children pushed in reverse so leftmost is popped first.
  const stack: Node[] = [
    {
      depth: 0,
      parentCallFrameId: undefined,
      parentSpanId,
      call: privateExecutionResult.entrypoint,
    },
  ];

  while (stack.length > 0) {
    const node = stack.pop()!;
    const { depth, call, parentCallFrameId, parentSpanId: parentSpan } = node;
    const index = preorderIndex++;

    const contractAddress = call.publicInputs.callContext.contractAddress.toString();
    const functionSelector = call.publicInputs.callContext.functionSelector.toString();

    const callFrameId = deterministicCallFrameId(depth, index, contractAddress, functionSelector);
    const spanId = deterministicSpanId(callFrameId);

    const resolved = await resolveFunction(contractAddress, functionSelector).catch(() => undefined);
    const sourceRef = await resolveSource(contractAddress, functionSelector).catch(() => undefined);

    const frameAttributes: Record<string, AztecAttributeValue> = {
      [ARGS_HASH_ATTR]: call.publicInputs.argsHash.toString(),
      [RETURNS_HASH_ATTR]: call.publicInputs.returnsHash.toString(),
    };
    if (resolved?.contractName !== undefined) {
      frameAttributes['aztec.private.contract_name'] = resolved.contractName;
    }
    if (resolved?.functionName !== undefined) {
      frameAttributes['aztec.private.function_name'] = resolved.functionName;
    }
    if (resolved?.displayName !== undefined) {
      frameAttributes['aztec.private.display_name'] = resolved.displayName;
    }

    const frame: AztecCallFrame = {
      callFrameId,
      parentCallFrameId,
      kind: 'private',
      sensitivity: 'secret_local',
      contractAddress,
      functionSelector,
      sourceRef,
      attributes: frameAttributes,
    };
    frames.push(frame);

    const spanAttributes: Record<string, AztecAttributeValue> = {
      'aztec.private.contract_address': contractAddress,
      'aztec.private.function_selector': functionSelector,
      'aztec.private.side_effect_counter.start': call.publicInputs.startSideEffectCounter.toString(),
      'aztec.private.side_effect_counter.end': call.publicInputs.endSideEffectCounter.toString(),
      'aztec.private.note_hashes.count': call.publicInputs.noteHashes.claimedLength,
      'aztec.private.nullifiers.count': call.publicInputs.nullifiers.claimedLength,
    };
    if (resolved?.displayName !== undefined) {
      spanAttributes['aztec.private.display_name'] = resolved.displayName;
    }
    if (call.profileResult?.timings?.witgen !== undefined) {
      spanAttributes['aztec.private.timings.witgen'] = call.profileResult.timings.witgen;
    }

    const spanInput: StartSpanInput = {
      spanId,
      parentSpanId: parentSpan,
      name: 'pxe.private_call',
      component: 'pxe',
      phase: 'pxe_execution',
      kind: 'private',
      sensitivity: 'secret_local',
      status: 'ok',
      attributes: spanAttributes,
      sourceRef,
      callFrameId,
    };
    spanInputs.push(spanInput);

    // Push children in reverse order so the first child is processed next.
    const nested = call.nestedExecutionResults ?? [];
    for (let i = nested.length - 1; i >= 0; i--) {
      stack.push({
        depth: depth + 1,
        parentCallFrameId: callFrameId,
        parentSpanId: spanId,
        call: nested[i],
      });
    }
  }

  return { frames, spanInputs };
}
