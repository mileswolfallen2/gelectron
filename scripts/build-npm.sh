#!/usr/bin/env bash
#
# build-npm.sh
#
# Builds the gelectron-core N-API addon for every supported platform target
# and copies the resulting .node files into the corresponding npm/ package
# folders.
#
# Each target is attempted. If the toolchain or linker isn't available,
# it's skipped with a warning. To build more targets:
#   - Linux:  brew install mingw-w64  (for Windows), or use Docker/cross
#   - Run this script on each target OS for best results
#

set -eo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

HOST_TARGET="$(rustc -vV | grep '^host:' | awk '{print $2}')"
HAS_RUSTUP=false
command -v rustup &>/dev/null && HAS_RUSTUP=true

NAPI="$REPO_DIR/node_modules/.bin/napi"
if [ ! -x "$NAPI" ]; then
  echo "Error: napi not found. Run 'npm install' first."
  exit 1
fi

# Each line: target_triple|npm_folder|node_filename
TARGETS=(
  "aarch64-apple-darwin|npm/darwin-arm64|gelectron_core.darwin-arm64.node"
  "x86_64-apple-darwin|npm/darwin-x64|gelectron_core.darwin-x64.node"
  "x86_64-pc-windows-msvc|npm/win32-x64-msvc|gelectron_core.win32-x64-msvc.node"
  "aarch64-pc-windows-msvc|npm/win32-arm64-msvc|gelectron_core.win32-arm64-msvc.node"
  "x86_64-unknown-linux-gnu|npm/linux-x64-gnu|gelectron_core.linux-x64-gnu.node"
  "aarch64-unknown-linux-gnu|npm/linux-arm64-gnu|gelectron_core.linux-arm64-gnu.node"
)

built=0
skipped=0

echo "═══════════════════════════════════════════════════"
echo " Gelectron NPM Builder"
echo "═══════════════════════════════════════════════════"
echo " Host target: $HOST_TARGET"
echo " rustup:      $HAS_RUSTUP"
echo "═══════════════════════════════════════════════════"
echo ""

for entry in "${TARGETS[@]}"; do
  target="$(echo "$entry" | cut -d'|' -f1)"
  dest_dir="$(echo "$entry" | cut -d'|' -f2)"
  node_name="$(echo "$entry" | cut -d'|' -f3)"

  echo "── $target ──"

  # Add the Rust target
  if $HAS_RUSTUP; then
    if ! rustup target add "$target" 2>/dev/null; then
      echo "  ⚠  Could not install Rust target — skipping"
      skipped=$((skipped + 1))
      echo ""
      continue
    fi
  elif [ "$target" != "$HOST_TARGET" ]; then
    echo "  ⚠  No rustup and not host target — skipping"
    echo "     Install rustup: brew install rustup && rustup-init"
    skipped=$((skipped + 1))
    echo ""
    continue
  fi

  # Build
  echo "  Building..."
  if $NAPI build --platform --release --target "$target" --package gelectron-core 2>/dev/null; then
    node_file="crates/gelectron-core/${node_name}"

    if [ ! -f "$node_file" ]; then
      node_file=$(ls crates/gelectron-core/gelectron_core.*.node 2>/dev/null | head -1 || true)
    fi

    if [ -n "$node_file" ] && [ -f "$node_file" ]; then
      mkdir -p "$dest_dir"
      cp "$node_file" "$dest_dir/$node_name"
      size=$(ls -lh "$dest_dir/$node_name" | awk '{print $5}')
      echo "  ✓  Built ($size) → $dest_dir/$node_name"
      built=$((built + 1))
    else
      echo "  ✗  Build succeeded but .node file not found"
      skipped=$((skipped + 1))
    fi
  else
    echo "  ✗  Build failed (missing linker or toolchain)"
    skipped=$((skipped + 1))
  fi
  echo ""
done

echo "═══════════════════════════════════════════════════"
echo " Done: $built built, $skipped skipped"
echo "═══════════════════════════════════════════════════"
