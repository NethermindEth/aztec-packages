import { Command } from 'commander';
import { mock } from 'jest-mock-extended';

import type { WalletDB } from '../../storage/wallet_db.js';
import type { CliWalletAndNodeWrapper } from '../../utils/cli_wallet_and_node_wrapper.js';
import { injectDebugCommands } from './index.js';

describe('injectDebugCommands', () => {
  function makeGroup() {
    const db = mock<WalletDB>();
    const walletAndNodeWrapper = mock<CliWalletAndNodeWrapper>();
    const program = new Command('aztec-wallet').exitOverride();
    const debugCommand = program.command('debug').description('debug group');
    injectDebugCommands(debugCommand, () => {}, walletAndNodeWrapper, db);
    return { program, debugCommand };
  }

  it('registers trace, export, preview, and hints', () => {
    const { debugCommand } = makeGroup();
    const names = debugCommand.commands.map(c => c.name());
    expect(names.sort()).toEqual(['export', 'hints', 'preview', 'trace']);
  });

  it('debug export rejects --policy balanced at option parsing', async () => {
    const { program } = makeGroup();
    await expect(
      program.parseAsync(['node', 'wallet', 'debug', 'export', '--tx', 't', '--out', '/tmp/x', '--policy', 'balanced']),
    ).rejects.toThrow(/balanced/);
  });

  it('debug export rejects --policy local_full at option parsing', async () => {
    const { program } = makeGroup();
    await expect(
      program.parseAsync(['node', 'wallet', 'debug', 'export', '--tx', 't', '--out', '/tmp/x', '--policy', 'local_full']),
    ).rejects.toThrow(/local_full/);
  });

  it('debug preview accepts balanced and local_full', () => {
    const { debugCommand } = makeGroup();
    const preview = debugCommand.commands.find(c => c.name() === 'preview')!;
    const policyOpt = preview.options.find(o => o.long === '--policy');
    expect(policyOpt?.argChoices?.sort()).toEqual(['balanced', 'local_full', 'strict']);
  });

  it('debug export only accepts strict', () => {
    const { debugCommand } = makeGroup();
    const exportCmd = debugCommand.commands.find(c => c.name() === 'export')!;
    const policyOpt = exportCmd.options.find(o => o.long === '--policy');
    expect(policyOpt?.argChoices).toEqual(['strict']);
  });
});
