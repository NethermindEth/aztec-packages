#!/bin/bash
# Wrapper script for backwards compatibility
# This script now uses the unified implementation
# Usage: ./scripts/update_cli_docs.sh [target_version]
#
# Examples:
#   ./scripts/update_cli_docs.sh                    # Updates all versions
#   ./scripts/update_cli_docs.sh v2.0.2             # Updates only v2.0.2
#   ./scripts/update_cli_docs.sh current            # Updates only main docs folder

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/update_cli_docs_unified.sh" aztec "$@"
