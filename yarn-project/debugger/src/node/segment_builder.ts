import { sha256 } from '@aztec/foundation/crypto/sha256';
import {
  AZTEC_TRACE_ERROR_SCHEMA_VERSION,
  type AztecAttributeValue,
  type AztecCallFrame,
  type AztecSpanStatus,
  type AztecSpan,
  type AztecSpanEvent,
  type AztecTraceAnchors,
  type AztecTraceError,
  NodeTraceSegmentPhases,
  NODE_TRACE_SEGMENT_SCHEMA_VERSION,
  type NodeTraceSegmentPhase,
  type NodeTraceSegment,
  type NodeTraceSegmentRequest,
} from '@aztec/stdlib/debug';
import type { DebugLog } from '@aztec/stdlib/logs';
import { TxStatus } from '@aztec/stdlib/tx';

import { randomBytes } from 'node:crypto';

import { ERROR_CATALOG } from '../errors/catalog.js';
import { type CallMetadataLike, projectCallStackMetadata } from './call_frame_projector.js';
import { projectDebugLogs } from './debug_log_projector.js';
import { buildAnchors, mapTxStatusToLifecycleState } from './settlement.js';

export type NodeTraceSources = {
  txHash: string;
  traceId?: string;
  txStatus: TxStatus;
  known: boolean;
  receiptBlockNumber?: number;
  receiptBlockHash?: string;
  provenBlockNumber: number;
  callStackMetadata?: CallMetadataLike[];
  revertReason?: { message: string };
  debugLogs: DebugLog[];
  /** Additional spans the node captured in-process (e.g. #sendTx, isValidTx). */
  nodeSpans?: AztecSpan[];
  spanErrors?: AztecTraceError[];
};

export type BuildOptions = {
  now?: () => string;
  /** Override the 32-byte random salt. Primarily for deterministic test runs. */
  salt?: Buffer;
};

const WRAPPER_SPAN_NAME = 'aztec_node.simulate_public_calls';
const PUBLIC_CALL_SPAN_NAME = 'aztec_node.public_call';

function deterministicSpanId(txHash: string, name: string): string {
  return sha256(Buffer.from(['span', txHash, name].join('|'), 'utf8'))
    .toString('hex')
    .slice(0, 32);
}

function buildWrapperSpan(
  txHash: string,
  startedAt: string,
  callFrameCount: number,
  events: AztecSpanEvent[],
  status: AztecSpanStatus,
): AztecSpan {
  const attributes: Record<string, AztecAttributeValue> = {
    'aztec.tx.hash': txHash,
    'aztec.simulator.phase': 'all',
    'aztec.call.depth': 0,
    'aztec.public_call_frames.count': callFrameCount,
    debugLogAttribution: 'tx_level',
    debugLogTimestampFidelity: 'wrapper_span_time',
  };
  return {
    spanId: deterministicSpanId(txHash, WRAPPER_SPAN_NAME),
    name: WRAPPER_SPAN_NAME,
    component: 'aztec_node',
    phase: 'node_submission',
    kind: 'public',
    sensitivity: 'public',
    status,
    startedAt,
    attributes,
    events: events.length > 0 ? events : undefined,
  };
}

function buildPerCallSpan(txHash: string, frame: AztecCallFrame, parentSpanId: string, startedAt: string): AztecSpan {
  const attributes: Record<string, AztecAttributeValue> = {
    'aztec.tx.hash': txHash,
  };
  if (frame.contractAddress !== undefined) {
    attributes['aztec.address.target'] = frame.contractAddress;
  }
  const phaseAttr = frame.attributes?.phase;
  if (typeof phaseAttr === 'string') {
    attributes['aztec.trace.phase_label'] = phaseAttr;
  }
  return {
    spanId: deterministicSpanId(txHash, `${PUBLIC_CALL_SPAN_NAME}:${frame.callFrameId}`),
    parentSpanId,
    name: PUBLIC_CALL_SPAN_NAME,
    component: 'simulator',
    phase: 'node_submission',
    kind: 'public',
    sensitivity: 'public',
    status: frame.attributes?.reverted === true ? 'error' : 'ok',
    startedAt,
    attributes,
    callFrameId: frame.callFrameId,
  };
}

function errorEntry(
  code: 'AZNODE_PUBLIC_REVERT' | 'AZSETTLE_DROPPED',
  errorId: string,
  message: string,
  extra?: Partial<AztecTraceError>,
): AztecTraceError {
  const defaults = ERROR_CATALOG[code];
  return {
    schemaVersion: AZTEC_TRACE_ERROR_SCHEMA_VERSION,
    errorId,
    code,
    message,
    category: defaults.category,
    severity: defaults.severity,
    retryable: defaults.retryable,
    remediationHint: defaults.remediationHint,
    ...extra,
  };
}

/**
 * Assemble a `NodeTraceSegment` from pre-gathered node-side sources.
 * The input is plain data — the node fills this DTO and delegates here.
 * No I/O is performed. No private wallet data enters the output.
 */
export function buildNodeTraceSegment(
  request: NodeTraceSegmentRequest,
  sources: NodeTraceSources,
  options: BuildOptions = {},
): NodeTraceSegment {
  const now = options.now?.() ?? new Date().toISOString();
  const salt = options.salt ?? randomBytes(32);
  if (salt.byteLength !== 32) {
    throw new Error(`buildNodeTraceSegment: salt must be 32 bytes (got ${salt.byteLength})`);
  }

  const includePublicCallStack = request.includePublicCallStack !== false;
  const includeDebugLogs = request.includeDebugLogs !== false;
  const requestedPhases = new Set<NodeTraceSegmentPhase>(request.phases ?? [...NodeTraceSegmentPhases]);
  const includeNodeSubmission = requestedPhases.has('node_submission');
  const includePublicExecution = requestedPhases.has('public_execution');
  const includeSettlement = requestedPhases.has('settlement');

  const { status, lifecycleState } = mapTxStatusToLifecycleState({
    txStatus: sources.txStatus,
    known: sources.known,
    receiptBlockNumber: sources.receiptBlockNumber,
    provenBlockNumber: sources.provenBlockNumber,
  });

  const anchors: AztecTraceAnchors = buildAnchors({
    txHash: sources.txHash,
    traceId: sources.traceId,
    receiptBlockNumber: sources.receiptBlockNumber,
    receiptBlockHash: sources.receiptBlockHash,
  });

  const callFrames: AztecCallFrame[] = includePublicExecution && includePublicCallStack
    ? projectCallStackMetadata(sources.callStackMetadata, { txHash: sources.txHash, salt })
    : [];

  const events: AztecSpanEvent[] = includePublicExecution && includeDebugLogs
    ? projectDebugLogs(sources.debugLogs, { salt, wrapperSpanStartedAt: now })
    : [];

  const publicExecutionSpans: AztecSpan[] = includePublicExecution
    ? (() => {
        const wrapperSpan = buildWrapperSpan(
          sources.txHash,
          now,
          callFrames.length,
          events,
          sources.revertReason !== undefined ? 'error' : 'ok',
        );
        const perCallSpans = callFrames
          .filter(frame => frame.attributes?.callDepth === 0)
          .map(frame => buildPerCallSpan(sources.txHash, frame, wrapperSpan.spanId, now));
        return [wrapperSpan, ...perCallSpans];
      })()
    : [];

  const nodeSpans = includeNodeSubmission
    ? (sources.nodeSpans ?? []).filter(span => span.phase === 'node_submission')
    : [];
  const spans: AztecSpan[] = [...publicExecutionSpans, ...nodeSpans];

  const spanIds = new Set(spans.map(span => span.spanId));
  const errors: AztecTraceError[] = (sources.spanErrors ?? []).filter(
    error => error.spanId === undefined || spanIds.has(error.spanId),
  );
  if (includeSettlement && lifecycleState === 'dropped') {
    errors.push(errorEntry('AZSETTLE_DROPPED', `${sources.txHash}:dropped`, 'Transaction dropped from mempool'));
  }
  if (includePublicExecution && sources.revertReason !== undefined && publicExecutionSpans.length > 0) {
    errors.push(
      errorEntry(
        'AZNODE_PUBLIC_REVERT',
        `${sources.txHash}:public_revert`,
        sources.revertReason.message,
        {
          spanId: publicExecutionSpans[0].spanId,
        },
      ),
    );
  }

  return {
    schemaVersion: NODE_TRACE_SEGMENT_SCHEMA_VERSION,
    txHash: sources.txHash,
    traceId: sources.traceId,
    anchors,
    status,
    lifecycleState,
    spans,
    callFrames,
    errors,
    createdAt: now,
    segmentRedactionSalt: salt.toString('hex'),
  };
}
