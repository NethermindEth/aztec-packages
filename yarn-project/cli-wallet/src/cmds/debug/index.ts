import type { LogFn } from '@aztec/foundation/log';
import type { RedactionPolicy } from '@aztec/stdlib/debug';

import type { Command } from 'commander';
import { Option } from 'commander';

import type { WalletDB } from '../../storage/wallet_db.js';
import type { CliWalletAndNodeWrapper } from '../../utils/cli_wallet_and_node_wrapper.js';

const POLICY_CHOICES_EXPORT = ['strict'] as const;
const POLICY_CHOICES_PREVIEW = ['strict', 'balanced', 'local_full'] as const;

/** Registers `debug trace`, `debug export`, `debug preview`, and `debug hints` under `debugCommand`. */
export function injectDebugCommands(
  debugCommand: Command,
  log: LogFn,
  walletAndNodeWrapper: CliWalletAndNodeWrapper,
  db: WalletDB,
): Command {
  debugCommand
    .command('trace')
    .description('Prints the recorded AztecTrace for a tx hash, alias, or trace id. Local-only; unredacted.')
    .requiredOption('--tx <hashOrAliasOrTraceId>', 'Transaction hash, alias, trace id, or provisional trace id.')
    .option('--json', 'Emit output as a single-line JSON document', false)
    .action(async options => {
      const { runDebugTrace } = await import('./trace.js');
      const { resolveTraceIdentifier } = await import('./resolve_trace.js');
      const wallet = walletAndNodeWrapper.wallet;
      const identifier = resolveTraceIdentifier(options.tx, db);
      await runDebugTrace(wallet.debug, identifier, { json: options.json === true }, log);
    });

  debugCommand
    .command('export')
    .description('Writes a strict-redacted bundle directory. Creates <out>/<bundleId>/ ; never overwrites without --force.')
    .requiredOption('--tx <hashOrAliasOrTraceId>', 'Transaction hash, alias, trace id, or provisional trace id.')
    .requiredOption('--out <dir>', 'Output directory; a subdirectory named <bundleId> is created here.')
    .addOption(
      new Option('--policy <policy>', 'Redaction policy (only strict is reachable here).')
        .choices([...POLICY_CHOICES_EXPORT])
        .default('strict'),
    )
    .option('--force', 'Allow writing into a non-empty <bundleId> directory.', false)
    .option('--json', 'Emit output as JSON', false)
    .action(async options => {
      const { runDebugExport } = await import('./export.js');
      const { resolveTraceIdentifier } = await import('./resolve_trace.js');
      const wallet = walletAndNodeWrapper.wallet;
      const identifier = resolveTraceIdentifier(options.tx, db);
      await runDebugExport(
        wallet.debug,
        identifier,
        { outDir: options.out, force: options.force === true, json: options.json === true },
        log,
      );
    });

  debugCommand
    .command('preview')
    .description('Prints redacted / preserved field paths for a trace under a redaction policy. No values are shown.')
    .requiredOption('--tx <hashOrAliasOrTraceId>', 'Transaction hash, alias, trace id, or provisional trace id.')
    .addOption(
      new Option('--policy <policy>', 'Redaction policy to preview.')
        .choices([...POLICY_CHOICES_PREVIEW])
        .default('strict'),
    )
    .option('--json', 'Emit output as JSON', false)
    .action(async options => {
      const { runDebugPreview } = await import('./preview.js');
      const { resolveTraceIdentifier } = await import('./resolve_trace.js');
      const wallet = walletAndNodeWrapper.wallet;
      const identifier = resolveTraceIdentifier(options.tx, db);
      await runDebugPreview(
        wallet.debug,
        identifier,
        { policy: options.policy as RedactionPolicy, json: options.json === true },
        log,
      );
    });

  debugCommand
    .command('hints')
    .description('Prints the remediation hint for a known debugger error code. Does not talk to the PXE.')
    .requiredOption('--error <code>', 'Debugger error code, e.g. AZPXE_SCOPE_DENIED.')
    .option('--json', 'Emit output as JSON', false)
    .action(async options => {
      const { runDebugHints } = await import('./hints.js');
      runDebugHints({ error: options.error, json: options.json === true }, log);
    });

  return debugCommand;
}
