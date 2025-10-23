# Aztec CLI Documentation Generator

A set of scripts to automatically generate comprehensive documentation for the Aztec CLI and Aztec Wallet CLI by recursively scanning all commands and their help output.

## Overview

This documentation system consists of three main components:

1. **Scanner** (`generate_cli_docs.py`) - Recursively scans any CLI and extracts help information
2. **Transformer** (`transform_cli_docs.py`) - Converts structured data into formatted Markdown
3. **Template** (`doc_template_example.py`) - Customizable configuration for output formatting

The system supports multiple CLIs:
- **Aztec CLI** (`aztec`) - Main Aztec command-line interface
- **Aztec Wallet CLI** (`aztec-wallet`) - Wallet-specific commands

## Quick Start

### Step 1: Scan the CLI

Generate structured documentation data:

```bash
# Generate JSON output
python scripts/generate_cli_docs.py --output cli_docs.json

# Or generate YAML output
python scripts/generate_cli_docs.py --output cli_docs.yaml --format yaml
```

This will:
- Recursively scan all `aztec` commands and subcommands
- Extract usage information, options, and descriptions
- Output structured JSON or YAML data

### Step 2: Transform to Markdown

Convert the structured data to readable documentation:

```bash
# Basic conversion
python scripts/transform_cli_docs.py --input cli_docs.json --output aztec-cli-reference.md

# With custom template
python scripts/transform_cli_docs.py \
  --input cli_docs.json \
  --output aztec-cli-reference.md \
  --template scripts/doc_template_example.py

# With custom title
python scripts/transform_cli_docs.py \
  --input cli_docs.json \
  --output aztec-cli-reference.md \
  --title "Aztec CLI Complete Reference"
```

### One-Step Generation

You can chain both steps together:

```bash
python scripts/generate_cli_docs.py --output cli_docs.json && \
python scripts/transform_cli_docs.py --input cli_docs.json --output aztec-cli-reference.md
```

### Convenience Scripts

For easy generation and deployment, use the provided shell scripts:

#### Generate Documentation (without deployment)

```bash
# Generate Aztec CLI docs
./scripts/generate_aztec_docs.sh

# Generate Aztec Wallet CLI docs
./scripts/generate_aztec_wallet_docs.sh [output_dir]
```

#### Update Documentation (with deployment)

These scripts generate the documentation and deploy it to the docs directories:

```bash
# CLI-specific wrapper scripts (backwards compatible)
./scripts/update_cli_docs.sh [target_version]
./scripts/update_cli_wallet_docs.sh [target_version]

# Unified interface (recommended for new usage)
./scripts/update_cli_docs_unified.sh <cli_name> [target_version]

# Update both CLIs at once
./scripts/update_all_cli_docs.sh [target_version]
```

**Examples:**
```bash
# Update all versions (current + all versioned docs)
./scripts/update_all_cli_docs.sh

# Update only the main docs folder
./scripts/update_all_cli_docs.sh current

# Update a specific version
./scripts/update_all_cli_docs.sh v2.0.2
```

## Customization

### Creating a Custom Template

Create a Python file with a `CONFIG` dictionary:

```python
# my_template.py
CONFIG = {
    "title": "My Custom CLI Docs",
    "include_toc": True,
    "option_table_format": "table",  # or "list"
    "max_depth": 3,
    "show_env_vars": True,
}
```

Then use it:

```bash
python scripts/transform_cli_docs.py \
  --input cli_docs.json \
  --output docs.md \
  --template my_template.py
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | "CLI Reference" | Document title |
| `include_toc` | boolean | true | Generate table of contents |
| `include_metadata` | boolean | true | Include scan date and command info |
| `show_usage` | boolean | true | Show usage examples |
| `show_env_vars` | boolean | true | Show environment variable mappings |
| `max_depth` | integer | 5 | Maximum subcommand depth |
| `option_table_format` | string | "list" | Format for options ("list" or "table") |

## Command Line Options

### generate_cli_docs.py

```
usage: generate_cli_docs.py [-h] --output OUTPUT [--format {json,yaml}] [--command COMMAND]

options:
  -o, --output OUTPUT       Output file path
  -f, --format FORMAT       Output format: json or yaml (default: json)
  -c, --command COMMAND     Base command to scan (default: aztec)
```

### transform_cli_docs.py

```
usage: transform_cli_docs.py [-h] --input INPUT --output OUTPUT [--template TEMPLATE] [--title TITLE]

options:
  -i, --input INPUT         Input JSON/YAML file
  -o, --output OUTPUT       Output Markdown file
  -t, --template TEMPLATE   Optional Python config file
  --title TITLE            Document title (overrides config)
```

## Architecture

### Structured Data Format

The scanner produces JSON/YAML with this structure:

```json
{
  "command": "aztec",
  "scanned_at": "2024-01-15 10:30:00",
  "data": {
    "format": "commander",
    "usage": "aztec [options] [command]",
    "description": "Aztec command line interface",
    "options": [
      {
        "short": "-V",
        "long": "--version",
        "description": "output the version number"
      }
    ],
    "commands": [
      {
        "name": "deploy",
        "signature": "deploy [options] [artifact]",
        "description": "Deploys a compiled Aztec.nr contract"
      }
    ],
    "subcommands": {
      "deploy": {
        "format": "commander",
        "usage": "...",
        "options": [...],
        ...
      }
    }
  }
}
```

## Examples

### Generate Full Documentation

```bash
# Step 1: Scan the CLI
python scripts/generate_cli_docs.py --output /tmp/aztec_cli.json

# Step 2: Transform to Markdown with custom template
python scripts/transform_cli_docs.py \
  --input /tmp/aztec_cli.json \
  --output docs/cli-reference.md \
  --template scripts/doc_template_example.py
```

### Quick Test Run

Scan just a few levels deep by modifying max_depth in your template:

```python
# quick_template.py
CONFIG = {
    "title": "Aztec CLI Quick Reference",
    "max_depth": 2,  # Only go 2 levels deep
}
```

### Generate for Different Commands

The scanner can work with any CLI command:

```bash
# Document the aztec-wallet CLI
python scripts/generate_cli_docs.py --command "aztec-wallet" --output aztec_wallet_cli.json

# Document any other CLI command
python scripts/generate_cli_docs.py --command "npm" --output npm_docs.json
```

### Real-World Examples

#### Generate and Deploy Aztec CLI Docs

```bash
# Generate for current version only
./scripts/update_cli_docs.sh current

# Generate for all versions (current + versioned)
./scripts/update_cli_docs.sh
```

#### Generate and Deploy Aztec Wallet CLI Docs

```bash
# Generate for current version only
./scripts/update_cli_wallet_docs.sh current

# Generate for all versions (current + versioned)
./scripts/update_cli_wallet_docs.sh
```

#### Update Both CLIs

```bash
# Update both Aztec CLI and Aztec Wallet CLI for all versions
./scripts/update_all_cli_docs.sh

# Update both for current version only
./scripts/update_all_cli_docs.sh current
```

## Troubleshooting

### Command Times Out

If scanning hangs on certain commands, the scanner has a 10-second timeout per command. Check the output for warnings.

### Formatting Issues

If the help output isn't parsed correctly:
1. Check the raw JSON/YAML output to see what was captured
2. The `format: "raw"` fallback preserves the original help text
3. Customize the parser in `generate_cli_docs.py` for your specific format

### Missing Subcommands

Some commands have dynamic subcommands that aren't listed in `--help`. You may need to:
1. Manually add them to the JSON/YAML
2. Extend the scanner to handle special cases

## Contributing

To extend these scripts:

1. **Add new parsers**: Implement format detection in `CLIScanner.scan_command()`
2. **Custom renderers**: Add methods to `MarkdownGenerator`
3. **New output formats**: Subclass `MarkdownGenerator` for HTML, PDF, etc.

## Dependencies

- Python 3.7+
- PyYAML (for YAML support): `pip install pyyaml`
- Bash 3.2+ (for shell scripts)

## Architecture Notes

### Unified Script Implementation

The documentation system uses a **unified script architecture** to reduce code duplication:

**Core Scripts:**
- `generate_cli_docs.py` - Python scanner (CLI-agnostic)
- `transform_cli_docs.py` - Python transformer (CLI-agnostic)
- `update_cli_docs_unified.sh` - Unified update script
- `generate_cli_docs_unified.sh` - Unified generation script

**Wrapper Scripts (Backwards Compatible):**
- `update_cli_docs.sh` → delegates to unified script with `aztec` parameter
- `update_cli_wallet_docs.sh` → delegates to unified script with `aztec-wallet` parameter
- `generate_aztec_docs.sh` → delegates to unified script with `aztec` parameter
- `generate_aztec_wallet_docs.sh` → delegates to unified script with `aztec-wallet` parameter

**Adding a New CLI:**
To add support for a new CLI (e.g., `aztec-prover`):
1. Add configuration case to `update_cli_docs_unified.sh`
2. Add configuration case to `generate_cli_docs_unified.sh`
3. Optionally create wrapper script for backwards compatibility
4. Add to `CLIS` array in `update_all_cli_docs.sh`

## License

Part of the Aztec project. See main repository LICENSE.
