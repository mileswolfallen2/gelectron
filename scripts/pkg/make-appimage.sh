#!/usr/bin/env bash
#
# Build the Linux AppImage: bundles the gelectron binary, the compat layer
# and a Node.js runtime into a single self-contained, downloadable AppImage.
#
#   Gelectron-<version>-x86_64.AppImage
#
# Requires: the gelectron binary (built against webkit2gtk-4.1), compat layer,
# and network access (downloads Node.js + appimagetool).
#
# Usage:
#   scripts/pkg/make-appimage.sh -v VERSION [--binary PATH] [--compat DIR] [-o DIR]

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_VERSION="20.18.1"

VERSION=""
BINARY=""
COMPAT="$REPO_DIR/src/electron"
OUT_DIR="$REPO_DIR/dist"

usage() {
  cat <<'EOF'
  Linux AppImage builder

  Usage:
    scripts/pkg/make-appimage.sh -v VERSION [--binary PATH] [--compat DIR] [-o DIR]

  Options:
    -v, --version VER    Version string (e.g. 0.1.1)
    -b, --binary PATH    Path to the gelectron binary
    -c, --compat DIR     Path to the compat layer (default: <repo>/src/electron)
    -o, --out DIR        Output directory (default: <repo>/dist)
    -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version) VERSION="${2:-}"; shift 2 ;;
    -b|--binary) BINARY="${2:-}"; shift 2 ;;
    -c|--compat) COMPAT="${2:-}"; shift 2 ;;
    -o|--out) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

VERSION="${VERSION#v}"
[[ -n "$VERSION" ]] || { echo "error: --version required" >&2; exit 1; }
if [[ -z "$BINARY" ]]; then
  BINARY="$REPO_DIR/target/release/gelectron"
fi
[[ -f "$BINARY" ]] || { echo "error: binary not found: $BINARY" >&2; exit 1; }
[[ -d "$COMPAT" ]] || { echo "error: compat dir not found: $COMPAT" >&2; exit 1; }

log() { echo "==> $*"; }

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/gelectron-appimage.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

APPDIR="$STAGE/Gelectron.AppDir"
mkdir -p "$APPDIR/usr/bin"

# ── Binaries ────────────────────────────────────────────────────────────────

log "Staging binary..."
install -m 755 "$BINARY" "$APPDIR/usr/bin/gelectron"

log "Staging compat layer (usr/bin/compat, resolved next to the binary)..."
mkdir -p "$APPDIR/usr/bin/compat"
install -m 644 "$COMPAT"/*.js "$APPDIR/usr/bin/compat/"

# Node.js runtime (gelectron's Node mode requires node on PATH)
NODE_DIR="$STAGE/node"
if [[ ! -d "$NODE_DIR" ]]; then
  log "Downloading Node.js v$NODE_VERSION..."
  mkdir -p "$NODE_DIR"
  NODE_ARCHIVE="$STAGE/node.tar.xz"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o "$NODE_ARCHIVE"
  tar -xJf "$NODE_ARCHIVE" -C "$NODE_DIR"
fi
install -m 755 "$NODE_DIR"/node-v${NODE_VERSION}-linux-x64/bin/node "$APPDIR/usr/bin/node"
install -m 644 "$NODE_DIR"/node-v${NODE_VERSION}-linux-x64/lib/libnode.so* "$APPDIR/usr/lib/" 2>/dev/null || true

mkdir -p "$APPDIR/usr/lib"
cp "$NODE_DIR"/node-v${NODE_VERSION}-linux-x64/lib/libnode.so* "$APPDIR/usr/lib/" 2>/dev/null || true

# ── AppImage metadata ───────────────────────────────────────────────────────

cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
SELF="$(dirname "$(readlink -f "$0")")"
export PATH="$SELF/usr/bin:$PATH"
export LD_LIBRARY_PATH="$SELF/usr/lib:${LD_LIBRARY_PATH:-}"
export GELECTRON_NATIVE=1
exec "$SELF/usr/bin/gelectron" "$@"
EOF
chmod +x "$APPDIR/AppRun"

cat > "$APPDIR/gelectron.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Gelectron
Comment=Firefox-engine alternative to Electron, powered by Servo
Exec=gelectron
Icon=gelectron
Terminal=false
Categories=Development;
EOF

if [[ -f "$REPO_DIR/logo.png" ]]; then
  install -m 644 "$REPO_DIR/logo.png" "$APPDIR/gelectron.png"
fi

# ── appimagetool ────────────────────────────────────────────────────────────

TOOL="$STAGE/appimagetool"
if [[ ! -f "$TOOL" ]]; then
  log "Downloading appimagetool..."
  curl -fsSL "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage" -o "$TOOL"
fi
chmod +x "$TOOL"

# ── Build ───────────────────────────────────────────────────────────────────

mkdir -p "$OUT_DIR"
APPIMAGE_NAME="Gelectron-$VERSION-x86_64.AppImage"
APPIMAGE_PATH="$OUT_DIR/$APPIMAGE_NAME"

export VERSION="$VERSION"
export ARCH="x86_64"
# Run appimagetool without FUSE (Ubuntu 24.04+ runners don't ship libfuse2)
export APPIMAGE_EXTRACT_AND_RUN=1
log "Creating $APPIMAGE_NAME ..."
"$TOOL" "$APPDIR" "$APPIMAGE_PATH" >/dev/null

echo
log "Created installer: $APPIMAGE_PATH"
sha256sum "$APPIMAGE_PATH" 2>/dev/null || shasum -a 256 "$APPIMAGE_PATH" 2>/dev/null || true