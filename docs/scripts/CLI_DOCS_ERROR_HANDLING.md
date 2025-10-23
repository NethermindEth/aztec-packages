# CLI Documentation Error Handling

## Overview

The CLI documentation generator includes robust error handling to gracefully skip commands that fail during help generation.

## Known Issues

### BigInt Serialization Error

Some commands fail with a BigInt serialization error when their `--help` is invoked:

```
TypeError: Do not know how to serialize a BigInt
    at JSON.stringify (<anonymous>)
    at Help.optionDescription (/usr/src/yarn-project/node_modules/commander/lib/help.js:314:62)
```

This is a Commander.js issue that occurs when option default values contain BigInt types that cannot be serialized to JSON.

## How the Generator Handles Errors

### 1. Detection

The scanner (`generate_cli_docs.py`) checks help output for error markers:
- `"ERROR: cli Error in command execution"`
- `"TypeError: Do not know how to serialize"`
- `"TypeError:"`
- `"Error:"`
- `"at JSON.stringify"`

### 2. Graceful Recording

When an error is detected:
- A warning is printed: `⚠️ Command failed with error, skipping`
- The command is recorded with error metadata in JSON
- The command is **included** in the subcommands list (so it appears in docs)
- Scanning continues for remaining commands

### 3. Documentation Generation

The markdown transformer (`transform_cli_docs.py`):
- Creates a stub section for commands with errors
- Includes error commands in the table of contents
- For `bigint_serialization` errors, adds: `*Help for this command is currently unavailable due to a technical issue with option serialization.*`
- For other errors, adds: `*This command help is currently unavailable due to a technical issue.*`

## Currently Affected Commands

Based on recent scans, the following commands are affected by BigInt errors:
- `aztec bootstrap-network`
- `aztec cancel-tx`
- `aztec fast-forward-epochs`

These commands still appear in the main command list (since they're visible in the top-level help), but don't have detailed documentation sections.

## Future Improvements

To resolve these errors, the underlying CLI code should be fixed to:
1. Convert BigInt default values to strings before passing to Commander.js
2. Use a custom help formatter that handles BigInt serialization
3. Avoid using BigInt types for option defaults where possible

## Testing Error Handling

To test the error handling:

```bash
# Run the scanner
python3 scripts/generate_cli_docs.py --output test.json

# Watch for warning messages
# ⚠️ Command failed with error, skipping

# Check the JSON output
python3 -c "
import json
data = json.load(open('test.json'))
# Errored commands won't appear in subcommands dict
print(f'Total commands documented: {len(data[\"data\"][\"subcommands\"])}')
"
```

## Impact

The error handling ensures:
- ✅ Documentation generation never crashes
- ✅ Successful commands are fully documented
- ✅ Failed commands have stub sections with explanatory notes
- ✅ Users can see which commands exist and know they're unavailable
- ✅ Scanning process continues for all commands
- ✅ Error commands appear in correct alphabetical order
- ✅ Table of contents includes all commands

The trade-off is that a few commands (currently 3 out of 60+) have stub sections instead of detailed help until the underlying BigInt issue is resolved in the CLI source code.
