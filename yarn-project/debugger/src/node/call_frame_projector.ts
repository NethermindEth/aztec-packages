// Do not add `DebugLog` imports to this file: public call frames are projected
// only from `CallStackMetadata`. Log-text parsing is never load-bearing here.
import { sha256 } from '@aztec/foundation/crypto/sha256';
import type { AztecAttributeValue, AztecCallFrame } from '@aztec/stdlib/debug';
import { TxExecutionPhase } from '@aztec/stdlib/tx';

import { hmacDigestHex } from '../bundle/redaction.js';

export type PhaseName = 'setup' | 'app_logic' | 'teardown';

/** Subset of `CallStackMetadata` the projector depends on. Keeps the file decoupled. */
export type CallMetadataLike = {
  phase: TxExecutionPhase;
  contractAddress: { toString(): string };
  calldata: Array<{ toString(): string }>;
  isStaticCall: boolean;
  reverted: boolean;
  haltingMessage?: string;
  numNestedCalls: number;
  nested: CallMetadataLike[];
  output: Array<{ toString(): string }>;
};

export type CallFrameProjectionOptions = {
  txHash: string;
  /** 32-byte random HMAC salt, one per segment export. */
  salt: Buffer;
  haltingMessageCapChars?: number;
};

const DEFAULT_HALTING_MESSAGE_CAP = 256;

const PHASE_NAMES: Record<TxExecutionPhase, PhaseName> = {
  [TxExecutionPhase.SETUP]: 'setup',
  [TxExecutionPhase.APP_LOGIC]: 'app_logic',
  [TxExecutionPhase.TEARDOWN]: 'teardown',
};

function phaseToName(phase: TxExecutionPhase): PhaseName {
  return PHASE_NAMES[phase] ?? 'app_logic';
}

function frameIdFor(txHash: string, phase: PhaseName, indexPath: readonly number[]): string {
  return sha256(Buffer.from(['frame', txHash, phase, ...indexPath].join('|'), 'utf8'))
    .toString('hex')
    .slice(0, 32);
}

function truncate(message: string, cap: number): string {
  if (message.length <= cap) {
    return message;
  }
  return `${message.slice(0, cap)}…[truncated]`;
}

/**
 * Project a list of top-level `CallStackMetadata` trees (one per enqueued call)
 * into a flat list of `AztecCallFrame` records, preserving setup/app_logic/
 * teardown ordering. Recursive descent is depth-first preorder.
 */
export function projectCallStackMetadata(
  roots: CallMetadataLike[] | undefined,
  opts: CallFrameProjectionOptions,
): AztecCallFrame[] {
  if (!roots || roots.length === 0) {
    return [];
  }
  const cap = opts.haltingMessageCapChars ?? DEFAULT_HALTING_MESSAGE_CAP;
  const frames: AztecCallFrame[] = [];

  const walk = (
    call: CallMetadataLike,
    indexPath: readonly number[],
    parentId: string | undefined,
    depth: number,
  ): void => {
    const phase = phaseToName(call.phase);
    const callFrameId = frameIdFor(opts.txHash, phase, indexPath);
    const contractAddress = call.contractAddress.toString();
    const functionSelector = call.calldata.length > 0 ? call.calldata[0].toString() : undefined;

    const attributes: Record<string, AztecAttributeValue> = {
      phase,
      reverted: call.reverted,
      isStaticCall: call.isStaticCall,
      numNestedCalls: call.numNestedCalls,
      callDepth: depth,
    };
    if (call.haltingMessage !== undefined) {
      attributes.haltingMessage = truncate(call.haltingMessage, cap);
    }
    if (call.numNestedCalls > call.nested.length) {
      attributes.truncatedNestedCalls = true;
    }

    const argsDigest = hmacDigestHex(
      call.calldata.map(f => f.toString()),
      opts.salt,
    );
    const returnDigest = hmacDigestHex(
      call.output.map(f => f.toString()),
      opts.salt,
    );

    frames.push({
      callFrameId,
      parentCallFrameId: parentId,
      kind: 'public',
      sensitivity: 'public',
      contractAddress,
      functionSelector,
      argsDigest,
      returnDigest,
      attributes,
    });

    call.nested.forEach((child, childIdx) => {
      walk(child, [...indexPath, childIdx], callFrameId, depth + 1);
    });
  };

  roots.forEach((root, rootIdx) => {
    walk(root, [rootIdx], undefined, 0);
  });

  return frames;
}
