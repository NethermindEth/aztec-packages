import {
  AZTEC_TRACE_ERROR_SCHEMA_VERSION,
  NODE_TRACE_SEGMENT_REQUEST_SCHEMA_VERSION,
  NODE_TRACE_SEGMENT_SCHEMA_VERSION,
  NODE_TRACE_STATUS_SCHEMA_VERSION,
  type NodeTraceSegment,
  type NodeTraceSegmentRequest,
  NodeTraceSegmentRequestSchema,
  NodeTraceSegmentSchema,
  type NodeTraceStatus,
  NodeTraceStatusSchema,
} from './index.js';

describe('NodeTraceSegmentRequestSchema', () => {
  const baseRequest: NodeTraceSegmentRequest = {
    schemaVersion: NODE_TRACE_SEGMENT_REQUEST_SCHEMA_VERSION,
    txHash: '0xabc',
    policy: 'strict',
  };

  it('accepts a minimal strict request', () => {
    expect(() => NodeTraceSegmentRequestSchema.parse(baseRequest)).not.toThrow();
  });

  it('rejects a non-strict policy at the boundary', () => {
    expect(() =>
      NodeTraceSegmentRequestSchema.parse({
        ...baseRequest,
        policy: 'balanced' as 'strict',
      }),
    ).toThrow();
  });

  it('rejects the wrong request schema version', () => {
    expect(() =>
      NodeTraceSegmentRequestSchema.parse({
        ...baseRequest,
        schemaVersion: 'aztec.node_segment_request.v0' as typeof NODE_TRACE_SEGMENT_REQUEST_SCHEMA_VERSION,
      }),
    ).toThrow();
  });

  it('accepts phase filters and boolean toggles', () => {
    const req: NodeTraceSegmentRequest = {
      ...baseRequest,
      phases: ['node_submission', 'public_execution'],
      includeDebugLogs: false,
      includePublicCallStack: true,
    };
    expect(NodeTraceSegmentRequestSchema.parse(req)).toEqual(req);
  });
});

describe('NodeTraceSegmentSchema', () => {
  const minimalSegment: NodeTraceSegment = {
    schemaVersion: NODE_TRACE_SEGMENT_SCHEMA_VERSION,
    txHash: '0xabc',
    anchors: { txHash: '0xabc' },
    status: 'awaiting_settlement',
    lifecycleState: 'pending_in_mempool',
    spans: [],
    callFrames: [],
    errors: [],
    createdAt: '2026-04-21T00:00:00.000Z',
    segmentRedactionSalt: 'a'.repeat(64),
  };

  it('round-trips a minimal segment', () => {
    expect(NodeTraceSegmentSchema.parse(minimalSegment)).toEqual(minimalSegment);
  });

  it('rejects a non-hex redaction salt', () => {
    expect(() => NodeTraceSegmentSchema.parse({ ...minimalSegment, segmentRedactionSalt: 'not-hex' })).toThrow();
  });

  it('accepts an AZSETTLE_DROPPED error entry', () => {
    const seg: NodeTraceSegment = {
      ...minimalSegment,
      errors: [
        {
          schemaVersion: AZTEC_TRACE_ERROR_SCHEMA_VERSION,
          errorId: 'err-1',
          code: 'AZSETTLE_DROPPED',
          message: 'dropped',
          category: 'settlement',
          severity: 'error',
          retryable: false,
        },
      ],
    };
    expect(NodeTraceSegmentSchema.parse(seg)).toEqual(seg);
  });
});

describe('NodeTraceStatusSchema', () => {
  it('round-trips a minimal status', () => {
    const status: NodeTraceStatus = {
      schemaVersion: NODE_TRACE_STATUS_SCHEMA_VERSION,
      txHash: '0xabc',
      status: 'ok',
      lifecycleState: 'finalized',
      anchors: { txHash: '0xabc' },
    };
    expect(NodeTraceStatusSchema.parse(status)).toEqual(status);
  });
});
