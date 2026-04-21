import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type AztecNodeDebug, AztecNodeDebugApiSchema } from './aztec-node-debug.js';

describe('AztecNodeDebugApiSchema', () => {
  let handler: MockAztecNodeDebug;
  let context: JsonRpcTestContext<AztecNodeDebug>;

  const tested: Set<string> = new Set();

  beforeEach(async () => {
    handler = new MockAztecNodeDebug();
    context = await createJsonRpcTestSetup<AztecNodeDebug>(handler, AztecNodeDebugApiSchema);
  });

  afterEach(() => {
    tested.add(/^AztecNodeDebugApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(AztecNodeDebugApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('mineBlock', async () => {
    await context.client.mineBlock();
  });
});

describe('AztecNodeDebugApiSchema public-debug contract', () => {
  it('does not expose admin-only trace export on the node debug RPC surface', () => {
    const keys = Object.keys(AztecNodeDebugApiSchema);
    expect(keys).not.toContain('exportTraceSegment');
    expect(keys).not.toContain('getTraceStatus');
  });
});

class MockAztecNodeDebug implements AztecNodeDebug {
  mineBlock(): Promise<void> {
    return Promise.resolve();
  }
}
