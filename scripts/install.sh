#!/usr/bin/env bash
#
# gelectron install script
#
# Builds the native gelectron binary and installs it plus the JS compat
# layer so `gelectron <app>` works from anywhere.
#
# Install layout (binary looks up compat/ next to itself):
#   <PREFIX>/gelectron          native binary
#   <PREFIX>/compat/*.js        Electron API compat layer
#
# Usage:
#   ./scripts/install.sh                install to ~/.local/bin
#   PREFIX=~/bin ./scripts/install.sh   install elsewhere
#   ./scripts/install.sh --uninstall    remove the installed files
#

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${PREFIX:-$HOME/.local/bin}"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$PREFIX/gelectron"
  rm -rf "$PREFIX/compat"
  echo "Removed $PREFIX/gelectron and $PREFIX/compat"
  exit 0
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found. Install Rust first: https://rustup.rs/" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found. Gelectron needs Node.js to run apps." >&2
  exit 1
fi

echo "==> Building gelectron (release)..."
cargo build --release -p gelectron
BIN="$REPO_DIR/target/release/gelectron"
if [[ ! -f "$BIN" ]]; then
  echo "error: build finished but $BIN is missing" >&2
  exit 1
fi

mkdir -p "$PREFIX/compat"

echo "==> Installing binary to $PREFIX/gelectron"
install -m 755 "$BIN" "$PREFIX/gelectron"

echo "==> Installing compat layer to $PREFIX/compat"
install -m 644 "$REPO_DIR"/src/electron/*.js "$PREFIX/compat/"

echo "==> Done."
echo

if ! command -v gelectron >/dev/null 2>&1; then
  echo "warning: $PREFIX is not on your PATH."
  case "$SHELL" in
    *zsh)  RC="$HOME/.zshrc" ;;
    *bash) RC="$HOME/.bashrc" ;;
    *)     RC="$HOME/.profile" ;;
  esac
  echo "Add this line to $RC:"
  echo "  export PATH=\"$PREFIX:\$PATH\""
else
  echo "gelectron is on your PATH."
fi

"$PREFIX/gelectron" --version 2>/dev/null || echo "Run: gelectron <path-to-app>"
