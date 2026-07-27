#!/usr/bin/env bash
set -e

BENCH_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_BIN="$BENCH_DIR/node_modules/.bin/electron"
GEELECTRON_BIN="$BENCH_DIR/../target/release/gelectron"

usage() {
  echo ""
  echo "  Usage: ./benchmark/run.sh [options]"
  echo ""
  echo "  Options:"
  echo "    --electron       Run with Electron only"
  echo "    --gelectron      Run with Gelectron only"
  echo "    (no args)        Run both back-to-back"
  echo ""
}

run_electron() {
  if [ -x "$ELECTRON_BIN" ] || command -v electron &>/dev/null; then
    local bin="${ELECTRON_BIN:-electron}"
    echo ""
    echo "  ▶ Opening Electron benchmark…"
    echo "    Close the window when done."
    "$bin" "$BENCH_DIR" 2>/dev/null
    echo "  ✓ Electron done"
  else
    echo ""
    echo "  ✗ Electron not found. Install with: npm install electron"
  fi
}

run_gelectron() {
  if [ -x "$GEELECTRON_BIN" ]; then
    echo ""
    echo "  ▶ Opening Gelectron benchmark…"
    echo "    Close the window when done."
    "$GEELECTRON_BIN" "$BENCH_DIR" 2>/dev/null
    echo "  ✓ Gelectron done"
  elif command -v gelectron &>/dev/null; then
    echo ""
    echo "  ▶ Opening Gelectron benchmark…"
    echo "    Close the window when done."
    gelectron "$BENCH_DIR" 2>/dev/null
    echo "  ✓ Gelectron done"
  else
    echo ""
    echo "  ✗ Gelectron not found. Build with: cargo build --release"
  fi
}

MODE="both"
for arg in "$@"; do
  case "$arg" in
    --electron) MODE="electron" ;;
    --gelectron) MODE="gelectron" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "  Unknown option: $arg"; usage; exit 1 ;;
  esac
done

echo ""
echo "  ── Gelectron Benchmark ──"

if [ "$MODE" = "both" ] || [ "$MODE" = "electron" ]; then
  run_electron
fi

if [ "$MODE" = "both" ] || [ "$MODE" = "gelectron" ]; then
  run_gelectron
fi

if [ "$MODE" = "both" ]; then
  echo ""
  echo "  ── Done ──"
  echo "  Both benchmarks ran. Results are shown in each window."
  echo "  The second window auto-loads a comparison if result files exist."
  echo ""
fi
