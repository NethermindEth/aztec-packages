import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

describe('aztec_start_action local-network namespace', () => {
  it('registers admin methods under the `nodeAdmin` namespace, not `node`', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, 'aztec_start_action.ts'), 'utf8');

    // Find the local-network branch. Both lines must exist so we know we are reading the
    // correct startup path and that admin is mounted under `nodeAdmin`, matching
    // `createAztecNodeAdminClient`'s `namespaceMethods: 'nodeAdmin'` pin.
    expect(source).toMatch(/services\.node\s*=\s*\[node,\s*AztecNodeApiSchema\]/);
    expect(source).toMatch(/adminServices\.nodeAdmin\s*=\s*\[node,\s*AztecNodeAdminApiSchema\]/);
    // And must not accidentally re-register admin under `node` on the admin port.
    expect(source).not.toMatch(/adminServices\.node\s*=\s*\[node,\s*AztecNodeAdminApiSchema\]/);
  });
});
