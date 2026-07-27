#!/usr/bin/env bash

BENCH_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$BENCH_DIR/.."
ELECTRON_BIN="$ROOT_DIR/node_modules/.bin/electron"
GEELECTRON_BIN="$ROOT_DIR/target/release/gelectron"
DEMO_APP="$BENCH_DIR"
RUNS=10
RESULTS_DIR="$BENCH_DIR/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$RESULTS_DIR"

echo ""
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Gelectron vs Electron Benchmark"
echo "   Runs: $RUNS"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Preflight ──
if [ ! -x "$ELECTRON_BIN" ]; then
  echo "  ✗ Electron not found. Run: npm install electron"
  exit 1
fi
if [ ! -x "$GEELECTRON_BIN" ]; then
  echo "  ✗ Gelectron binary not found. Run: cargo build --release"
  exit 1
fi

# ── Measure package size ──
echo "  Measuring package sizes..."

# Electron: the entire electron node_modules + demo
ELECTRON_SIZE=$(du -sm "$ROOT_DIR/node_modules/electron" 2>/dev/null | awk '{print $1}')
ELECTRON_DIST_SIZE=$(du -sm "$ROOT_DIR/node_modules/electron/dist" 2>/dev/null | awk '{print $1}')

# Gelectron: binary + compat layer + node
GEELECTRON_BIN_SIZE=$(du -sm "$GEELECTRON_BIN" 2>/dev/null | awk '{print $1}')
GEELECTRON_COMPAT_SIZE=$(du -sm "$ROOT_DIR/src/electron" 2>/dev/null | awk '{print $1}')
# Node.js bundled with gelectron would be ~20MB, but for dev we use system node
NODE_SIZE=$(du -sm "$(which node)" 2>/dev/null | awk '{print $1}')

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │           Package Size Comparison        │"
echo "  ├─────────────────────┬───────────┬────────┤"
echo "  │ Component           │  Electron │Gelectron│"
echo "  ├─────────────────────┼───────────┼────────┤"
printf "  │ Runtime (binary)    │ %7sMB │ %6sMB │\n" "${ELECTRON_DIST_SIZE:-?}" "${GEELECTRON_BIN_SIZE:-?}"
printf "  │ npm package total   │ %7sMB │     N/A │\n" "${ELECTRON_SIZE:-?}"
printf "  │ Compat layer        │      N/A │ %6sMB │\n" "${GEELECTRON_COMPAT_SIZE:-?}"
echo "  └─────────────────────┴───────────┴────────┘"
echo ""

# ── Benchmark function ──
# Runs a binary, waits for it to stabilize, captures memory, kills it, measures time.
benchmark_run() {
  local name="$1"
  shift
  local cmd=("$@")

  # Launch and capture PID
  "${cmd[@]}" &>/dev/null &
  local pid=$!

  # Wait for process to exist and settle
  sleep 2

  # Check if still running
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "0,0"
    return
  fi

  # Capture total RSS across parent + all child processes
  local rss_kb
  rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
  # Add child process (Node.js) memory
  local child_rss
  child_rss=$(ps -o rss= --ppid "$pid" 2>/dev/null | awk '{s+=$1} END {print s+0}')
  rss_kb=$(( ${rss_kb:-0} + ${child_rss:-0} ))

  # Kill it
  kill -9 "$pid" 2>/dev/null || true
  sleep 0.2

  echo "${rss_kb:-0}"
}

# ── Warmup run ──
echo "  Warming up..."
"$ELECTRON_BIN" "$BENCH_DIR" &>/dev/null &
sleep 3
killall -9 Electron 2>/dev/null || true
sleep 1

"$GEELECTRON_BIN" "$DEMO_APP" &>/dev/null &
sleep 3
killall -9 gelectron 2>/dev/null || true
sleep 1
echo "  Done."
echo ""

# ── Run benchmarks ──
ELECTRON_TIMES=()
ELECTRON_MEMS=()
GEELECTRON_TIMES=()
GEELECTRON_MEMS=()

echo "  Running Electron x$RUNS..."
for i in $(seq 1 $RUNS); do
  START=$(python3 -c 'import time; print(time.time())')

  "$ELECTRON_BIN" "$BENCH_DIR" &>/dev/null &
  PID=$!
  sleep 3

  # Total RSS: parent + all children
  PARENT_RSS=$(ps -o rss= -p "$PID" 2>/dev/null | tr -d ' ')
  CHILD_RSS=$(ps -o rss= --ppid "$PID" 2>/dev/null | awk '{s+=$1} END {print s+0}')
  RSS=$(( ${PARENT_RSS:-0} + ${CHILD_RSS:-0} ))
  END=$(python3 -c 'import time; print(time.time())')

  kill -9 "$PID" 2>/dev/null || true
  sleep 0.2

  ELAPSED=$(python3 -c "print(f'{$END - $START:.3f}')")
  MEM_MB=$(python3 -c "print(f'{$RSS / 1024:.1f}')")

  ELECTRON_TIMES+=("$ELAPSED")
  ELECTRON_MEMS+=("$MEM_MB")
  printf "    Run %2d: %ss startup, %sMB total RSS\n" "$i" "$ELAPSED" "$MEM_MB"
done

echo ""
echo "  Running Gelectron x$RUNS..."
for i in $(seq 1 $RUNS); do
  START=$(python3 -c 'import time; print(time.time())')

  "$GEELECTRON_BIN" "$DEMO_APP" &>/dev/null &
  PID=$!
  sleep 3

  # Total RSS: parent + all children (Rust + Node.js)
  PARENT_RSS=$(ps -o rss= -p "$PID" 2>/dev/null | tr -d ' ')
  CHILD_RSS=$(ps -o rss= --ppid "$PID" 2>/dev/null | awk '{s+=$1} END {print s+0}')
  RSS=$(( ${PARENT_RSS:-0} + ${CHILD_RSS:-0} ))
  END=$(python3 -c 'import time; print(time.time())')

  kill -9 "$PID" 2>/dev/null || true
  # Also kill Node.js child
  ps -o pid= --ppid "$PID" 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 0.2

  ELAPSED=$(python3 -c "print(f'{$END - $START:.3f}')")
  MEM_MB=$(python3 -c "print(f'{$RSS / 1024:.1f}')")

  GEELECTRON_TIMES+=("$ELAPSED")
  GEELECTRON_MEMS+=("$MEM_MB")
  printf "    Run %2d: %ss startup, %sMB total RSS\n" "$i" "$ELAPSED" "$MEM_MB"
done

# ── Compute averages ──
E_TIMES_STR=$(IFS=,; echo "${ELECTRON_TIMES[*]}")
E_MEMS_STR=$(IFS=,; echo "${ELECTRON_MEMS[*]}")
G_TIMES_STR=$(IFS=,; echo "${GEELECTRON_TIMES[*]}")
G_MEMS_STR=$(IFS=,; echo "${GEELECTRON_MEMS[*]}")

AVG_E_TIME=$(python3 -c "ts=[$E_TIMES_STR]; print(f'{sum(ts)/len(ts):.3f}')")
AVG_E_MEM=$(python3 -c "ms=[$E_MEMS_STR]; print(f'{sum(ms)/len(ms):.1f}')")
AVG_G_TIME=$(python3 -c "ts=[$G_TIMES_STR]; print(f'{sum(ts)/len(ts):.3f}')")
AVG_G_MEM=$(python3 -c "ms=[$G_MEMS_STR]; print(f'{sum(ms)/len(ms):.1f}')")

# ── Compute min/max ──
MIN_E_TIME=$(python3 -c "print(f'{min([float(x) for x in [$E_TIMES_STR]]):.3f}')")
MAX_E_TIME=$(python3 -c "print(f'{max([float(x) for x in [$E_TIMES_STR]]):.3f}')")
MIN_G_TIME=$(python3 -c "print(f'{min([float(x) for x in [$G_TIMES_STR]]):.3f}')")
MAX_G_TIME=$(python3 -c "print(f'{max([float(x) for x in [$G_TIMES_STR]]):.3f}')")

MIN_E_MEM=$(python3 -c "print(f'{min([float(x) for x in [$E_MEMS_STR]]):.1f}')")
MAX_E_MEM=$(python3 -c "print(f'{max([float(x) for x in [$E_MEMS_STR]]):.1f}')")
MIN_G_MEM=$(python3 -c "print(f'{min([float(x) for x in [$G_MEMS_STR]]):.1f}')")
MAX_G_MEM=$(python3 -c "print(f'{max([float(x) for x in [$G_MEMS_STR]]):.1f}')")

# ── Compute percentages ──
TIME_PCT=$(python3 -c "e=$AVG_E_TIME; g=$AVG_G_TIME; print(f'{(1 - g / e) * 100:+.1f}')")
MEM_PCT=$(python3 -c "e=$AVG_E_MEM; g=$AVG_G_MEM; print(f'{(1 - g / e) * 100:+.1f}')")
SIZE_PCT=$(python3 -c "e=${ELECTRON_DIST_SIZE:-1}; g=${GEELECTRON_BIN_SIZE:-0}; print(f'{(1 - g / max(e, 1)) * 100:+.1f}')")

# ── Results ──
echo ""
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   RESULTS ($RUNS runs, averages)"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ┌──────────────────────┬──────────┬──────────┬──────────┐"
echo "  │ Metric               │ Electron │Gelectron │   Delta  │"
echo "  ├──────────────────────┼──────────┼──────────┼──────────┤"
printf "  │ Startup time (avg)   │ %7ss │ %7ss │  %6s%%  │\n" "$AVG_E_TIME" "$AVG_G_TIME" "$TIME_PCT"
printf "  │ Startup time (min)   │ %7ss │ %7ss │          │\n" "$MIN_E_TIME" "$MIN_G_TIME"
printf "  │ Startup time (max)   │ %7ss │ %7ss │          │\n" "$MAX_E_TIME" "$MAX_G_TIME"
echo "  ├──────────────────────┼──────────┼──────────┼──────────┤"
printf "  │ Memory RSS (avg)     │ %6sMB │ %6sMB │  %6s%%  │\n" "$AVG_E_MEM" "$AVG_G_MEM" "$MEM_PCT"
printf "  │ Memory RSS (min)     │ %6sMB │ %6sMB │          │\n" "$MIN_E_MEM" "$MIN_G_MEM"
printf "  │ Memory RSS (max)     │ %6sMB │ %6sMB │          │\n" "$MAX_E_MEM" "$MAX_G_MEM"
echo "  ├──────────────────────┼──────────┼──────────┼──────────┤"
printf "  │ Runtime binary size  │ %6sMB │ %6sMB │  %6s%%  │\n" "${ELECTRON_DIST_SIZE:-?}" "${GEELECTRON_BIN_SIZE:-?}" "$SIZE_PCT"
echo "  └──────────────────────┴──────────┴──────────┴──────────┘"
echo ""
echo "  Positive delta = Gelectron is smaller/faster"
echo "  Negative delta = Gelectron is larger/slower"
echo ""

# ── Save raw data ──
RESULT_FILE="$RESULTS_DIR/benchmark_${TIMESTAMP}.json"
cat > "$RESULT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "runs": $RUNS,
  "platform": "$(uname -s) $(uname -m)",
  "electron": {
    "version": "$($ELECTRON_BIN --version 2>/dev/null || echo 'unknown')",
    "avg_startup_s": $AVG_E_TIME,
    "min_startup_s": $MIN_E_TIME,
    "max_startup_s": $MAX_E_TIME,
    "avg_memory_mb": $AVG_E_MEM,
    "min_memory_mb": $MIN_E_MEM,
    "max_memory_mb": $MAX_E_MEM,
    "runtime_size_mb": ${ELECTRON_DIST_SIZE:-0},
    "raw_times": [$(printf '%s,' "${ELECTRON_TIMES[@]}" | sed 's/,$//')],
    "raw_memory": [$(printf '%s,' "${ELECTRON_MEMS[@]}" | sed 's/,$//')]
  },
  "gelectron": {
    "avg_startup_s": $AVG_G_TIME,
    "min_startup_s": $MIN_G_TIME,
    "max_startup_s": $MAX_G_TIME,
    "avg_memory_mb": $AVG_G_MEM,
    "min_memory_mb": $MIN_G_MEM,
    "max_memory_mb": $MAX_G_MEM,
    "runtime_size_mb": ${GEELECTRON_BIN_SIZE:-0},
    "raw_times": [$(printf '%s,' "${GEELECTRON_TIMES[@]}" | sed 's/,$//')],
    "raw_memory": [$(printf '%s,' "${GEELECTRON_MEMS[@]}" | sed 's/,$//')]
  }
}
EOF

echo "  Raw data saved to: $RESULT_FILE"
echo ""
echo "  ── Done ──"
echo ""
