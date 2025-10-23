#!/bin/bash
# Wrapper script for backwards compatibility
# This script now uses the unified implementation
# Usage: ./scripts/generate_aztec_wallet_docs.sh [output_dir]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/generate_cli_docs_unified.sh" aztec-wallet "$@"
