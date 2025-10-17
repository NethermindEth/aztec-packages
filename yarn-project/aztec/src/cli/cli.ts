import type { LogFn, Logger } from '@aztec/foundation/log';

import { Command } from 'commander';

import { aztecStartOptions } from './aztec_start_options.js';
import { addOptions, printAztecStartHelpText } from './util.js';

/**
 * Returns commander program that defines the 'aztec' command line interface.
 * @param userLog - log function for logging user output.
 * @param debugLogger - logger for logging debug messages.
 */
export function injectAztecCommands(program: Command, userLog: LogFn, debugLogger: Logger): Command {
  const startCmd = new Command('start').description(
    'Starts Aztec modules. Options for each module can be set as key-value pairs (e.g. "option1=value1,option2=value2") or as environment variables.',
  );

  // Assuming commands are added elsewhere, here we just add options to the main program
  Object.keys(aztecStartOptions).forEach(category => {
    addOptions(startCmd, aztecStartOptions[category]);
  });

  startCmd.helpInformation = printAztecStartHelpText;

  startCmd.action(async options => {
    const { aztecStart } = await import('./aztec_start_action.js');
    return await aztecStart(options, userLog, debugLogger);
  });

  program.addCommand(startCmd);

  program.configureHelp({ sortSubcommands: true });

  program.addHelpText(
    'after',
    `

  Additional commands:

    init [folder] [options]: creates a new Noir project
      Options:
        --name <name>       Name of the package
        --lib               Use a library template
        --bin               Use a binary template
        --contract          Use a contract template (default)
      Examples:
        $ aztec init                    # creates a contract project in current directory
        $ aztec init my-project         # creates a contract project in ./my-project
        $ aztec init --lib              # creates a library project

    compile [options]: compiles Aztec Noir contracts
      Compiles contracts with nargo compile and then postprocesses them to generate Aztec-specific artifacts including:
        - Transpiled contract artifacts
        - Verification keys
      The compiled contracts will be placed in the target/ directory by default.
      Supports standard nargo compile options.

    fmt [options]: formats Noir code using nargo fmt
      Example:
        $ aztec fmt                     # formats all Noir files in the project

    check [options]: type-checks Noir code without compiling using nargo check
      Example:
        $ aztec check                   # checks all Noir files in the project

    test [options]: starts a dockerized TXE node via
      $ aztec start --txe
    then runs
      $ aztec-nargo test --silence-warnings --oracle-resolver=<TXE_ADDRESS> [options]
    `,
  );

  program
    .command('preload-crs')
    .description('Preload the points data needed for proving and verifying')
    .action(async options => {
      const { preloadCrs } = await import('./preload_crs.js');
      return await preloadCrs(options, userLog, debugLogger);
    });

  return program;
}
