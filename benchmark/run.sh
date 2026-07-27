#!/usr/bin/env bash

BENCH_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_BIN="$BENCH_DIR/node_modules/.bin/electron"
GEELECTRON_BIN="$BENCH_DIR/../target/release/gelectron"

echo ""
echo "  ── Gelectron Benchmark ──"
echo ""

# Run Electron first
if [ -x "$ELECTRON_BIN" ]; then
  echo "  ▶ Opening Electron benchmark…"
  echo "    Close the window when done."
  "$ELECTRON_BIN" "$BENCH_DIR" 2>/dev/null || true
  echo "  ✓ Electron done"
else
  echo "  ✗ Electron not found. Run: npm install electron"
fi

echo ""

# Then Gelectron
if [ -x "$GEELECTRON_BIN" ]; then
  echo "  ▶ Opening Gelectron benchmark…"
  echo "    Close the window when done."
  "$GEELECTRON_BIN" "$BENCH_DIR" 2>/dev/null || true
  echo "  ✓ Gelectron done"
else
  echo "  ✗ Gelectron not found. Run: cargo build --release"
fi

echo ""
echo "  ── Done ──"
echo ""
