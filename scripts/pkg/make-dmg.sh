#!/usr/bin/env bash
#
# Build the macOS installer: a .pkg wrapped in a .dmg for distribution.
#
# The package is fully self-contained — it installs the gelectron runtime, the
# Electron compatibility layer AND a private Node.js runtime into
# /usr/local/lib/gelectron and symlinks gelectron into /usr/local/bin. Apps run
# with `gelectron <app>` with no other runtime installed on the machine.
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
NODE_VERSION="20.18.1"

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

# ── Payload root: what pkgbuild installs into /usr/local/lib/gelectron ─────

PAYLOAD="$STAGE/payload/usr/local/lib/gelectron"
mkdir -p "$PAYLOAD"

log "Staging payload..."
install -m 755 "$BINARY" "$PAYLOAD/gelectron"
mkdir -p "$PAYLOAD/compat"
install -m 644 "$COMPAT"/*.js "$PAYLOAD/compat/"

# Private Node.js runtime so the installed CLI works with no system Node
NODE_ARCH="$( [[ "$ARCH" == "arm64" ]] && echo arm64 || echo x64 )"
NODE_ARCHIVE="$STAGE/node.tar.gz"
if [[ ! -f "$NODE_ARCHIVE" ]]; then
  log "Downloading Node.js v$NODE_VERSION..."
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz" -o "$NODE_ARCHIVE"
fi
log "Extracting Node.js..."
mkdir -p "$STAGE/node"
tar -xzf "$NODE_ARCHIVE" -C "$STAGE/node"
install -m 755 "$STAGE/node"/node-v${NODE_VERSION}-darwin-${NODE_ARCH}/bin/node "$PAYLOAD/node"

if command -v codesign >/dev/null 2>&1; then
  log "Ad-hoc signing binary..."
  codesign --force --sign - "$PAYLOAD/gelectron" 2>/dev/null || echo "  (warning: codesign failed)"
fi

# ── Postinstall script: symlink /usr/local/bin/gelectron → runtime ─────────

SCRIPTS="$STAGE/scripts"
mkdir -p "$SCRIPTS"
cat > "$SCRIPTS/postinstall" <<'EOF'
#!/bin/bash
set -e
ln -sf /usr/local/lib/gelectron/gelectron /usr/local/bin/gelectron
exit 0
EOF
chmod +x "$SCRIPTS/postinstall"

# ── Component package ───────────────────────────────────────────────────────

PKG="$STAGE/Install gelectron.pkg"
log "Building package (installs to /usr/local/lib/gelectron)..."
pkgbuild \
  --root "$STAGE/payload" \
  --scripts "$SCRIPTS" \
  --identifier "com.gelectron.runtime.$ARCH" \
  --version "$VERSION" \
  --ownership recommended \
  --install-location / \
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