import type { TraceRecorder } from '@aztec/debugger';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { CLIWallet } from './wallet.js';

export const DEFAULT_TX_TIMEOUT_S = 180;

/*
 * Wrapper class for CLIWallet and AztecNode, avoids initialization issues due to closures when providing CLIWallet
 * and AztecNode to injected commander.js commands
 */
export class CliWalletAndNodeWrapper {
  private _wallet: CLIWallet | undefined;
  private _node: AztecNode | undefined;
  private _traceRecorder: TraceRecorder | undefined;

  constructor() {}

  get wallet() {
    if (!this._wallet) {
      throw new Error('Wallet not initialized while it should have been initialized in preSubcommand');
    }
    return this._wallet;
  }

  get node(): AztecNode {
    if (!this._node) {
      throw new Error('Node not initialized while it should have been initialized in preSubcommand');
    }
    return this._node;
  }

  /** Returns the CLI-side debugger recorder when `--debug-capture` was enabled, otherwise undefined. */
  get traceRecorder(): TraceRecorder | undefined {
    return this._traceRecorder;
  }

  setNodeAndWallet(node: AztecNode, wallet: CLIWallet, traceRecorder?: TraceRecorder) {
    this._node = node;
    this._wallet = wallet;
    this._traceRecorder = traceRecorder;
  }
}
