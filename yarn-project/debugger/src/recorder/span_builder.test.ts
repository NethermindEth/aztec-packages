import type { PrivateExecutionResult } from '@aztec/stdlib/tx';

import {
  ARGS_HASH_ATTR,
  RETURNS_HASH_ATTR,
  type ResolveFunction,
  type ResolveSource,
  extractPrivateCallFrames,
} from './span_builder.js';

type FakeCall = {
  publicInputs: {
    callContext: {
      contractAddress: { toString: () => string };
      functionSelector: { toString: () => string };
    };
    argsHash: { toString: () => string };
    returnsHash: { toString: () => string };
    startSideEffectCounter: { toString: () => string };
    endSideEffectCounter: { toString: () => string };
    noteHashes: { claimedLength: number };
    nullifiers: { claimedLength: number };
  };
  nestedExecutionResults: FakeCall[];
  profileResult?: { timings?: { witgen?: number } };
};

function fr(s: string): { toString: () => string } {
  return { toString: () => s };
}

function makeCall(
  contractAddress: string,
  selector: string,
  nestedExecutionResults: FakeCall[] = [],
  witgenMs?: number,
): FakeCall {
  return {
    publicInputs: {
      callContext: {
        contractAddress: fr(contractAddress),
        functionSelector: fr(selector),
      },
      argsHash: fr(`args-${contractAddress}-${selector}`),
      returnsHash: fr(`rets-${contractAddress}-${selector}`),
      startSideEffectCounter: fr('0'),
      endSideEffectCounter: fr('10'),
      noteHashes: { claimedLength: 1 },
      nullifiers: { claimedLength: 2 },
    },
    nestedExecutionResults,
    ...(witgenMs !== undefined ? { profileResult: { timings: { witgen: witgenMs } } } : {}),
  };
}

function makeFixture(): PrivateExecutionResult {
  const leafA = makeCall('0xAAA', '0x1111');
  const leafB = makeCall('0xBBB', '0x2222');
  const root = makeCall('0xROOT', '0xROOT_SEL', [leafA, leafB], 42);
  return {
    entrypoint: root as unknown,
  } as unknown as PrivateExecutionResult;
}

const noopResolveFunction: ResolveFunction = () => Promise.resolve(undefined);
const noopResolveSource: ResolveSource = () => Promise.resolve(undefined);

describe('extractPrivateCallFrames', () => {
  it('emits one frame and one span per private call, root first (preorder)', async () => {
    const result = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });

    expect(result.frames).toHaveLength(3);
    expect(result.spanInputs).toHaveLength(3);

    expect(result.frames[0].contractAddress).toBe('0xROOT');
    expect(result.frames[1].contractAddress).toBe('0xAAA');
    expect(result.frames[2].contractAddress).toBe('0xBBB');
  });

  it('wires parent/child relationships for both frames and spans', async () => {
    const { frames, spanInputs } = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });

    expect(frames[0].parentCallFrameId).toBeUndefined();
    expect(frames[1].parentCallFrameId).toBe(frames[0].callFrameId);
    expect(frames[2].parentCallFrameId).toBe(frames[0].callFrameId);

    expect(spanInputs[0].parentSpanId).toBe('phase-span');
    expect(spanInputs[1].parentSpanId).toBe(spanInputs[0].spanId);
    expect(spanInputs[2].parentSpanId).toBe(spanInputs[0].spanId);
  });

  it('produces deterministic, stable call-frame ids and span ids', async () => {
    const a = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });
    const b = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });
    expect(a.frames.map(f => f.callFrameId)).toEqual(b.frames.map(f => f.callFrameId));
    expect(a.spanInputs.map(s => s.spanId)).toEqual(b.spanInputs.map(s => s.spanId));
  });

  it('uses a global preorder index so repeated nested calls do not collide', async () => {
    const repeatedLeaf = () => makeCall('0xSAME', '0xSEL');
    const privateExecutionResult = {
      entrypoint: makeCall('0xROOT', '0xROOT_SEL', [
        makeCall('0xPARENT_A', '0xPARENT_SEL', [repeatedLeaf()]),
        makeCall('0xPARENT_B', '0xPARENT_SEL', [repeatedLeaf()]),
      ]),
    } as unknown as PrivateExecutionResult;

    const { frames, spanInputs } = await extractPrivateCallFrames({
      privateExecutionResult,
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });

    expect(new Set(frames.map(f => f.callFrameId)).size).toBe(frames.length);
    expect(new Set(spanInputs.map(s => s.spanId)).size).toBe(spanInputs.length);
  });

  it('every emitted frame and span is marked secret_local', async () => {
    const { frames, spanInputs } = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });
    for (const frame of frames) {
      expect(frame.sensitivity).toBe('secret_local');
      expect(frame.kind).toBe('private');
    }
    for (const span of spanInputs) {
      expect(span.sensitivity).toBe('secret_local');
      expect(span.kind).toBe('private');
      expect(span.name).toBe('pxe.private_call');
      expect(span.phase).toBe('pxe_execution');
      expect(span.component).toBe('pxe');
    }
  });

  it('stores args_hash / returns_hash only in internal secret-local attributes', async () => {
    const { frames, spanInputs } = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });
    for (const frame of frames) {
      expect(frame.attributes?.[ARGS_HASH_ATTR]).toBeDefined();
      expect(frame.attributes?.[RETURNS_HASH_ATTR]).toBeDefined();
      expect((frame as { argsDigest?: string }).argsDigest).toBeUndefined();
      expect((frame as { returnDigest?: string }).returnDigest).toBeUndefined();
    }
    // Spans carry side-effect counts and display-name only; never the raw args/return fields.
    for (const span of spanInputs) {
      expect(span.attributes).toBeDefined();
      expect(Object.keys(span.attributes ?? {})).not.toContain('returnValues');
    }
  });

  it('never copies partialWitness, acir, vk, newNotes, offchainEffects, taggingIndexRanges, contractClassLogs, returnValues', async () => {
    const { frames, spanInputs } = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });
    const blob = JSON.stringify({ frames, spanInputs });
    for (const forbidden of [
      'partialWitness',
      'acir',
      'vk',
      'newNotes',
      'offchainEffects',
      'taggingIndexRanges',
      'contractClassLogs',
      'returnValues',
    ]) {
      expect(blob).not.toContain(forbidden);
    }
  });

  it('uses resolveFunction and resolveSource outputs for display names and sourceRef', async () => {
    const resolveFunction: ResolveFunction = (addr, _selector) =>
      Promise.resolve({
        artifactId: `artifact-${addr}`,
        contractName: `Contract${addr}`,
        functionName: 'myFn',
        displayName: `Contract${addr}:myFn`,
      });
    const resolveSource: ResolveSource = addr =>
      Promise.resolve({
        schemaVersion: 'aztec.source_ref.v1',
        artifactId: `artifact-${addr}`,
        contractName: `Contract${addr}`,
        functionName: 'myFn',
        path: 'src/a.nr',
        line: 10,
        column: 4,
      });

    const { frames } = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction,
      resolveSource,
    });
    expect(frames[0].sourceRef?.path).toBe('src/a.nr');
    expect(frames[0].attributes?.['aztec.private.contract_name']).toBe('Contract0xROOT');
    expect(frames[0].attributes?.['aztec.private.function_name']).toBe('myFn');
    expect(frames[0].attributes?.['aztec.private.display_name']).toBe('Contract0xROOT:myFn');
  });

  it('omits sourceRef on a frame whose resolver returns undefined', async () => {
    const { frames } = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });
    for (const frame of frames) {
      expect(frame.sourceRef).toBeUndefined();
    }
  });

  it('surfaces profileResult.timings.witgen as a span attribute when present', async () => {
    const { spanInputs } = await extractPrivateCallFrames({
      privateExecutionResult: makeFixture(),
      parentSpanId: 'phase-span',
      resolveFunction: noopResolveFunction,
      resolveSource: noopResolveSource,
    });
    expect(spanInputs[0].attributes?.['aztec.private.timings.witgen']).toBe(42);
    expect(spanInputs[1].attributes?.['aztec.private.timings.witgen']).toBeUndefined();
  });
});
