#!/usr/bin/env bash
#
# gelectron release builder
#
# Pre-compiles the gelectron native binary and bundles it with the Electron
# compatibility layer (src/electron/*.js) into a single, self-contained
# installer archive per platform/arch:
#
#   gelectron-<version>-darwin-arm64.tar.gz
#   gelectron-<version>-darwin-x64.tar.gz
#   gelectron-<version>-win32-arm64.zip
#   gelectron-<version>-win32-x64.zip
#   gelectron-<version>-linux-arm64.tar.gz
#   gelectron-<version>-linux-x64.tar.gz
#
# Archive layout (the install scripts unpack this into PREFIX):
#   gelectron | gelectron.exe   native binary
#   compat/*.js                 Electron API compatibility layer
#
# This script is what the GitHub Actions workflow runs on every new release
# tag; it can also be run locally for testing or manual distributions.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

VERSION=""
PLATFORM=""
ARCH=""
BINARY=""
OUT_DIR="$REPO_DIR/dist"
BUILD=1

usage() {
  cat <<'EOF'
  gelectron release builder

  Usage:
    scripts/make-release.sh [options]

  Options:
    -v, --version VER    Release version (default: from package.json, minus v)
    -p, --platform P     Target OS: darwin, win32, linux (default: current)
    -a, --arch A         Target arch: x64, arm64 (default: current)
    -b, --binary PATH    Use an already-built gelectron binary (skips cargo build)
    -o, --out DIR        Output directory (default: <repo>/dist)
    -n, --no-build       Do not compile (requires --binary or an existing build)
    -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version) VERSION="${2:-}"; shift 2 ;;
    -p|--platform) PLATFORM="${2:-}"; shift 2 ;;
    -a|--arch) ARCH="${2:-}"; shift 2 ;;
    -b|--binary) BINARY="${2:-}"; shift 2 ;;
    -o|--out) OUT_DIR="${2:-}"; shift 2 ;;
    -n|--no-build) BUILD=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

# ── Resolve defaults ────────────────────────────────────────────────────────

if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('$REPO_DIR/package.json').version" 2>/dev/null || echo '0.0.0')"
fi
VERSION="${VERSION#v}"

if [[ -z "$PLATFORM" ]]; then
  case "$(uname -s)" in
    Darwin) PLATFORM="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="win32" ;;
    Linux) PLATFORM="linux" ;;
    *) echo "error: cannot detect platform" >&2; exit 1 ;;
  esac
fi

if [[ -z "$ARCH" ]]; then
  case "$(uname -m)" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64) ARCH="x64" ;;
    *) echo "error: cannot detect arch" >&2; exit 1 ;;
  esac
fi

case "$PLATFORM-$ARCH" in
  darwin-arm64|darwin-x64|win32-arm64|win32-x64|linux-arm64|linux-x64) ;;
  *) echo "error: unsupported platform/arch: $PLATFORM/$ARCH" >&2; exit 1 ;;
esac

EXE_SUFFIX=""
[[ "$PLATFORM" == "win32" ]] && EXE_SUFFIX=".exe"
[[ "$PLATFORM" == "win32" ]] && ARCHIVE_EXT="zip" || ARCHIVE_EXT="tar.gz"

log() { echo "==> $*"; }

# ── Locate or build the gelectron binary ────────────────────────────────────

BIN="$BINARY"
if [[ -z "$BIN" && "$BUILD" == "1" ]]; then
  CANDIDATES=(
    "$REPO_DIR/target/release/gelectron$EXE_SUFFIX"
    "$REPO_DIR/target/debug/gelectron$EXE_SUFFIX"
  )
  for c in "${CANDIDATES[@]}"; do
    if [[ -f "$c" ]]; then BIN="$c"; break; fi
  done
fi

if [[ -z "$BIN" && "$BUILD" == "1" ]]; then
  log "Building gelectron (release)..."
  cargo build --release --manifest-path "$REPO_DIR/Cargo.toml" -p gelectron
  BIN="$REPO_DIR/target/release/gelectron$EXE_SUFFIX"
fi

# A --binary path may omit the platform extension (e.g. CI passes the target
# path before the .exe suffix is appended).
if [[ -n "$BIN" && ! -f "$BIN" && -n "$EXE_SUFFIX" && -f "$BIN$EXE_SUFFIX" ]]; then
  BIN="$BIN$EXE_SUFFIX"
fi

if [[ -z "$BIN" || ! -f "$BIN" ]]; then
  echo "error: gelectron binary not found. Build it first (cargo build --release -p gelectron) or pass --binary." >&2
  exit 1
fi
BIN="$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")"

# ── Stage the payload ───────────────────────────────────────────────────────

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/gelectron-release.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

PAYLOAD="$STAGE/payload"
mkdir -p "$PAYLOAD"

log "Copying binary ($(basename "$BIN"))..."
install -m 755 "$BIN" "$PAYLOAD/gelectron$EXE_SUFFIX"

COMPAT_SRC="$REPO_DIR/src/electron"
if [[ ! -d "$COMPAT_SRC" || -z "$(ls "$COMPAT_SRC"/*.js 2>/dev/null)" ]]; then
  echo "error: compat layer not found in $COMPAT_SRC" >&2
  exit 1
fi
log "Copying compat layer..."
mkdir -p "$PAYLOAD/compat"
install -m 644 "$COMPAT_SRC"/*.js "$PAYLOAD/compat/"

# Ad-hoc sign so the binary actually runs on arm64 Macs (unsigned binaries
# are killed by the kernel). No certificate required.
if [[ "$PLATFORM" == "darwin" ]]; then
  if command -v codesign >/dev/null 2>&1; then
    log "Ad-hoc signing binary..."
    codesign --force --sign - "$PAYLOAD/gelectron" 2>/dev/null || echo "  (warning: codesign failed)"
  fi
fi

# ── Archive ─────────────────────────────────────────────────────────────────

mkdir -p "$OUT_DIR"
ARCHIVE_NAME="gelectron-$VERSION-$PLATFORM-$ARCH.$ARCHIVE_EXT"
ARCHIVE_PATH="$OUT_DIR/$ARCHIVE_NAME"

if [[ "$ARCHIVE_EXT" == "zip" ]]; then
  log "Creating $ARCHIVE_NAME..."
  if command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -Command "Compress-Archive -Path '$PAYLOAD/*' -DestinationPath '$ARCHIVE_PATH' -Force"
  else
    (cd "$PAYLOAD" && zip -qr "$ARCHIVE_PATH" .)
  fi
else
  log "Creating $ARCHIVE_NAME..."
  (cd "$PAYLOAD" && tar -czf "$ARCHIVE_PATH" .)
fi

echo
log "Created installer: $ARCHIVE_PATH"
sha256sum "$ARCHIVE_PATH" 2>/dev/null || shasum -a 256 "$ARCHIVE_PATH" 2>/dev/null || true