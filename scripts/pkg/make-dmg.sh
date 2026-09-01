#!/usr/bin/env bash
#
# Build the macOS installer: a .pkg (installs the gelectron runtime +
# compat layer to /usr/local/bin) wrapped in a .dmg for distribution.
#
#   Gelectron-<version>-<arch>.dmg
#     └── Install gelectron.pkg   (double-click, runs macOS Installer as root)
#
# Requires macOS (pkgbuild + hdiutil). Ad-hoc signing only — no Developer ID
# certificate, so first launch shows a Gatekeeper warning on other machines.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

VERSION=""
ARCH=""
BINARY=""
COMPAT="$REPO_DIR/src/electron"
OUT_DIR="$REPO_DIR/dist"

usage() {
  cat <<'EOF'
  macOS installer builder (pkg inside DMG)

  Usage:
    scripts/pkg/make-dmg.sh -v VERSION -a ARCH [--binary PATH] [--compat DIR] [-o DIR]

  Options:
    -v, --version VER    Version string (e.g. 0.1.1)
    -a, --arch A         arm64 | x64
    -b, --binary PATH    Path to the gelectron binary
    -c, --compat DIR     Path to the compat layer (default: <repo>/src/electron)
    -o, --out DIR        Output directory (default: <repo>/dist)
    -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version) VERSION="${2:-}"; shift 2 ;;
    -a|--arch) ARCH="${2:-}"; shift 2 ;;
    -b|--binary) BINARY="${2:-}"; shift 2 ;;
    -c|--compat) COMPAT="${2:-}"; shift 2 ;;
    -o|--out) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -n "$VERSION" ]] || { echo "error: --version required" >&2; exit 1; }
VERSION="${VERSION#v}"
[[ -n "$ARCH" ]] || { echo "error: --arch required" >&2; exit 1; }
case "$ARCH" in arm64|x64) ;; *) echo "error: unsupported arch: $ARCH" >&2; exit 1 ;; esac

if [[ -z "$BINARY" ]]; then
  BINARY="$REPO_DIR/target/release/gelectron"
fi
[[ -f "$BINARY" ]] || { echo "error: binary not found: $BINARY" >&2; exit 1; }
[[ -d "$COMPAT" ]] || { echo "error: compat dir not found: $COMPAT" >&2; exit 1; }

log() { echo "==> $*"; }

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/gelectron-dmg.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

# ── Payload root (what pkgbuild installs into /usr/local/bin) ─────────────

PAYLOAD="$STAGE/gelectron"
mkdir -p "$PAYLOAD"

log "Staging payload..."
install -m 755 "$BINARY" "$PAYLOAD/gelectron"
mkdir -p "$PAYLOAD/compat"
install -m 644 "$COMPAT"/*.js "$PAYLOAD/compat/"

if command -v codesign >/dev/null 2>&1; then
  log "Ad-hoc signing binary..."
  codesign --force --sign - "$PAYLOAD/gelectron" 2>/dev/null || echo "  (warning: codesign failed)"
fi

# ── Component package ───────────────────────────────────────────────────────

PKG="$STAGE/Install gelectron.pkg"
log "Building package (installs to /usr/local/bin)..."
pkgbuild \
  --root "$PAYLOAD" \
  --identifier "com.gelectron.runtime.$ARCH" \
  --version "$VERSION" \
  --ownership recommended \
  --install-location /usr/local/bin \
  "$PKG"

# ── DMG ────────────────────────────────────────────────────────────────────

mkdir -p "$OUT_DIR"
DMG_NAME="Gelectron-$VERSION-$ARCH.dmg"
DMG_PATH="$OUT_DIR/$DMG_NAME"

DMG_STAGE="$STAGE/dmg"
mkdir -p "$DMG_STAGE"
cp "$PKG" "$DMG_STAGE/"

log "Creating $DMG_NAME ..."
hdiutil create \
  -volname "Gelectron $VERSION" \
  -srcfolder "$DMG_STAGE" \
  -format UDZO \
  -ov \
  "$DMG_PATH" >/dev/null

echo
log "Created installer: $DMG_PATH"
shasum -a 256 "$DMG_PATH"