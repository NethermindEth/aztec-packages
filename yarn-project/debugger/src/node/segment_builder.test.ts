import {
  NODE_TRACE_SEGMENT_REQUEST_SCHEMA_VERSION,
  type AztecSpan,
  type NodeTraceSegmentRequest,
  NodeTraceSegmentSchema,
} from '@aztec/stdlib/debug';
import { TxStatus } from '@aztec/stdlib/tx';
import { TxExecutionPhase } from '@aztec/stdlib/tx';

import type { CallMetadataLike } from './call_frame_projector.js';
import { buildNodeTraceSegment } from './segment_builder.js';

const txHash = '0x' + 'a'.repeat(64);
const salt = Buffer.alloc(32, 0xab);

function fr(str: string) {
  return { toString: () => str };
}

function leafCall(phase: TxExecutionPhase, contract: string, selector: string, reverted = false): CallMetadataLike {
  return {
    phase,
    contractAddress: fr(contract),
    calldata: [fr(selector), fr('0x02')],
    isStaticCall: false,
    reverted,
    haltingMessage: reverted ? 'revert: access denied' : undefined,
    numNestedCalls: 0,
    nested: [],
    output: [fr('0x00')],
  };
}

const baseRequest: NodeTraceSegmentRequest = {
  schemaVersion: NODE_TRACE_SEGMENT_REQUEST_SCHEMA_VERSION,
  txHash,
  policy: 'strict',
};

function assertNoSecrets(serialized: string) {
  for (const forbidden of ['partialWitness', 'capsule', 'authWitness', 'tagged_nonce']) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe('buildNodeTraceSegment', () => {
  it('scenario (a): pending tx with no public calls', () => {
    const segment = buildNodeTraceSegment(
      baseRequest,
      {
        txHash,
        txStatus: TxStatus.PENDING,
        known: true,
        provenBlockNumber: 0,
        debugLogs: [],
      },
      { salt, now: () => '2026-04-21T00:00:00.000Z' },
    );

    expect(NodeTraceSegmentSchema.parse(segment)).toEqual(segment);
    expect(segment.callFrames).toEqual([]);
    expect(segment.status).toBe('awaiting_settlement');
    expect(segment.lifecycleState).toBe('pending_in_mempool');
    expect(segment.errors).toEqual([]);
    assertNoSecrets(JSON.stringify(segment));
  });

  it('scenario (b): mined tx with setup/app_logic/teardown public calls and debug logs', () => {
    const roots: CallMetadataLike[] = [
      leafCall(TxExecutionPhase.SETUP, '0x10', '0xaaaa'),
      leafCall(TxExecutionPhase.APP_LOGIC, '0x11', '0xbbbb'),
      leafCall(TxExecutionPhase.TEARDOWN, '0x12', '0xcccc'),
    ];

    const debugLogs = [
      {
        contractAddress: fr('0x11'),
        level: 'info',
        message: 'hello {0}',
        fields: [fr('0x2a')],
      } as any,
    ];

    const segment = buildNodeTraceSegment(
      baseRequest,
      {
        txHash,
        txStatus: TxStatus.FINALIZED,
        known: true,
        provenBlockNumber: 100,
        receiptBlockNumber: 5,
        receiptBlockHash: '0xbeef',
        callStackMetadata: roots,
        debugLogs,
      },
      { salt, now: () => '2026-04-21T00:00:00.000Z' },
    );

    expect(NodeTraceSegmentSchema.parse(segment)).toEqual(segment);
    const phases = segment.callFrames.map(f => f.attributes?.phase);
    expect(phases).toEqual(['setup', 'app_logic', 'teardown']);
    expect(segment.status).toBe('ok');
    expect(segment.lifecycleState).toBe('finalized');

    // Wrapper span + three per-call spans (depth-0 only).
    expect(segment.spans[0].name).toBe('aztec_node.simulate_public_calls');
    expect(segment.spans.slice(1).map(s => s.name)).toEqual([
      'aztec_node.public_call',
      'aztec_node.public_call',
      'aztec_node.public_call',
    ]);
    expect(segment.spans[0].events).toHaveLength(1);
    expect(segment.spans[0].events![0].name).toBe('avm.debug_log');

    const serialized = JSON.stringify(segment);
    assertNoSecrets(serialized);
    // Raw Fr field values must not leak.
    expect(serialized).not.toContain('"fields"');
  });

  it('scenario (c): dropped tx emits AZSETTLE_DROPPED', () => {
    const segment = buildNodeTraceSegment(
      baseRequest,
      {
        txHash,
        txStatus: TxStatus.DROPPED,
        known: true,
        provenBlockNumber: 0,
        debugLogs: [],
      },
      { salt, now: () => '2026-04-21T00:00:00.000Z' },
    );

    expect(segment.status).toBe('error');
    expect(segment.lifecycleState).toBe('dropped');
    expect(segment.errors.map(e => e.code)).toEqual(['AZSETTLE_DROPPED']);
    expect(NodeTraceSegmentSchema.parse(segment)).toEqual(segment);
  });

  it('scenario (d): reverted public call emits AZNODE_PUBLIC_REVERT', () => {
    const roots: CallMetadataLike[] = [leafCall(TxExecutionPhase.APP_LOGIC, '0x11', '0xbbbb', true)];
    const segment = buildNodeTraceSegment(
      baseRequest,
      {
        txHash,
        txStatus: TxStatus.PROPOSED,
        known: true,
        provenBlockNumber: 0,
        callStackMetadata: roots,
        revertReason: { message: 'revert: access denied' },
        debugLogs: [],
      },
      { salt, now: () => '2026-04-21T00:00:00.000Z' },
    );

    expect(segment.errors.map(e => e.code)).toEqual(['AZNODE_PUBLIC_REVERT']);
    expect(segment.callFrames[0].attributes?.reverted).toBe(true);
    expect(segment.spans[0].status).toBe('error');
  });

  it('unknown tx maps to dropped', () => {
    const segment = buildNodeTraceSegment(
      baseRequest,
      {
        txHash,
        txStatus: TxStatus.PENDING,
        known: false,
        provenBlockNumber: 0,
        debugLogs: [],
      },
      { salt, now: () => '2026-04-21T00:00:00.000Z' },
    );
    expect(segment.lifecycleState).toBe('dropped');
    expect(segment.errors.map(e => e.code)).toContain('AZSETTLE_DROPPED');
  });

  it('honors phase filters for public execution vs settlement', () => {
    const roots: CallMetadataLike[] = [leafCall(TxExecutionPhase.APP_LOGIC, '0x11', '0xbbbb', true)];

    const settlementOnly = buildNodeTraceSegment(
      { ...baseRequest, phases: ['settlement'] },
      {
        txHash,
        txStatus: TxStatus.DROPPED,
        known: false,
        provenBlockNumber: 0,
        callStackMetadata: roots,
        revertReason: { message: 'revert: access denied' },
        debugLogs: [],
      },
      { salt, now: () => '2026-04-21T00:00:00.000Z' },
    );

    expect(settlementOnly.spans).toEqual([]);
    expect(settlementOnly.callFrames).toEqual([]);
    expect(settlementOnly.errors.map(e => e.code)).toEqual(['AZSETTLE_DROPPED']);

    const publicOnly = buildNodeTraceSegment(
      { ...baseRequest, phases: ['public_execution'] },
      {
        txHash,
        txStatus: TxStatus.DROPPED,
        known: false,
        provenBlockNumber: 0,
        callStackMetadata: roots,
        revertReason: { message: 'revert: access denied' },
        debugLogs: [],
      },
      { salt, now: () => '2026-04-21T00:00:00.000Z' },
    );

    expect(publicOnly.callFrames).toHaveLength(1);
    expect(publicOnly.errors.map(e => e.code)).toEqual(['AZNODE_PUBLIC_REVERT']);
  });

  it('includes cached node-submission spans only when requested', () => {
    const nodeSpan: AztecSpan = {
      spanId: `${txHash}:sendTx`,
      name: 'AztecNodeService.sendTx',
      component: 'aztec_node',
      phase: 'node_submission',
      kind: 'public',
      sensitivity: 'public',
      status: 'ok',
      startedAt: '2026-04-21T00:00:00.000Z',
      endedAt: '2026-04-21T00:00:01.000Z',
      attributes: { 'aztec.tx.hash': txHash },
    };

    const segment = buildNodeTraceSegment(
      { ...baseRequest, phases: ['node_submission'] },
      {
        txHash,
        txStatus: TxStatus.PENDING,
        known: true,
        provenBlockNumber: 0,
        debugLogs: [],
        nodeSpans: [nodeSpan],
      },
      { salt, now: () => '2026-04-21T00:00:00.000Z' },
    );

    expect(segment.spans).toEqual([nodeSpan]);
    expect(segment.callFrames).toEqual([]);
    expect(segment.errors).toEqual([]);
    expect(NodeTraceSegmentSchema.parse(segment)).toEqual(segment);
  });
});
