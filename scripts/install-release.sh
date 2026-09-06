#!/usr/bin/env bash
#
# gelectron installer
#
# Downloads the pre-built gelectron binary + Electron compatibility layer from
# GitHub Releases and installs it into PREFIX so `gelectron <app>` works from
# anywhere. No Rust toolchain or Node dependency manager required.
#
#   Install layout:
#     <PREFIX>/gelectron          native binary
#     <PREFIX>/compat/*.js        Electron API compat layer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/mileswolfallen2/gelectron/main/scripts/install-release.sh | bash
#   ./scripts/install-release.sh                 latest release
#   ./scripts/install-release.sh --version v0.1.1
#   ./scripts/install-release.sh --file /path/to/gelectron-0.1.1-darwin-arm64.tar.gz
#   PREFIX=~/bin ./scripts/install-release.sh    custom prefix
#   ./scripts/install-release.sh --uninstall     remove installed files

set -euo pipefail

DEFAULT_REPO="mileswolfallen2/gelectron"
DEFAULT_PREFIX="${HOME}/.local/bin"

REPO="$DEFAULT_REPO"
PREFIX="${PREFIX:-$DEFAULT_PREFIX}"
VERSION=""
FILE=""
UNINSTALL=0

usage() {
  cat <<'EOF'
  gelectron installer — install pre-built gelectron from GitHub Releases

  Usage:
    install-release.sh [options]

  Options:
    --repo owner/repo    GitHub repo to fetch releases from (default: mileswolfallen2/gelectron)
    --prefix DIR         Install directory (env: PREFIX, default: ~/.local/bin)
    --version TAG        Install a specific release tag (default: latest)
    --file PATH          Install from a local release archive instead of downloading
    --uninstall          Remove previously installed files
    -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --prefix) PREFIX="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --file) FILE="${2:-}"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

# ── Detect platform / arch ──────────────────────────────────────────────────

case "$(uname -s)" in
  Darwin)  PLATFORM="darwin" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="win32" ;;
  Linux)   PLATFORM="linux" ;;
  *) echo "error: unsupported platform: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
  *) echo "error: unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

[[ "$PLATFORM" == "win32" ]] && ARCHIVE_EXT="zip" || ARCHIVE_EXT="tar.gz"

# ── Uninstall ───────────────────────────────────────────────────────────────

if [[ "$UNINSTALL" == "1" ]]; then
  rm -f "$PREFIX/gelectron"
  rm -f "$PREFIX/gelectron.exe"
  rm -f "$PREFIX/node"
  rm -f "$PREFIX/node.exe"
  rm -rf "$PREFIX/compat"
  echo "Removed $PREFIX/gelectron, $PREFIX/node and $PREFIX/compat"
  exit 0
fi

# ── Resolve version + archive ───────────────────────────────────────────────

if [[ -n "$FILE" ]]; then
  ARCHIVE_FILE="$FILE"
else
  if [[ -n "$VERSION" ]]; then
    TAG="${VERSION#v}"
    TAG="v${TAG}"
  else
    echo "==> Resolving latest release from $REPO..."
    if ! command -v curl >/dev/null 2>&1; then
      echo "error: curl is required" >&2
      exit 1
    fi
    API_URL="https://api.github.com/repos/$REPO/releases/latest"
    TAG="$(curl -fsSL "$API_URL" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
    if [[ -z "$TAG" ]]; then
      echo "error: could not resolve latest release from $API_URL" >&2
      exit 1
    fi
  fi
  VER="${TAG#v}"
  ASSET="gelectron-$VER-$PLATFORM-$ARCH.$ARCHIVE_EXT"
  URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"
  echo "==> Downloading $ASSET ..."
  ARCHIVE_FILE="$(mktemp /tmp/gelectron-install.XXXXXX.$ARCHIVE_EXT)"
  trap 'rm -f "$ARCHIVE_FILE"' EXIT
  curl -fsSL -L "$URL" -o "$ARCHIVE_FILE"
fi

# ── Extract ─────────────────────────────────────────────────────────────────

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/gelectron-install-stage.XXXXXX")"
trap 'rm -rf "$STAGE" "${ARCHIVE_FILE:-}"' EXIT

echo "==> Extracting archive..."
case "$ARCHIVE_EXT" in
  zip)  unzip -qo "$ARCHIVE_FILE" -d "$STAGE" ;;
  *)    tar -xzf "$ARCHIVE_FILE" -C "$STAGE" ;;
esac

BIN_ABS="$STAGE/gelectron"
[[ -f "$STAGE/gelectron.exe" ]] && BIN_ABS="$STAGE/gelectron.exe"
if [[ ! -f "$BIN_ABS" ]]; then
  echo "error: archive does not contain gelectron" >&2
  ls -la "$STAGE" >&2
  exit 1
fi

# ── Install ─────────────────────────────────────────────────────────────────

echo "==> Installing to $PREFIX"
mkdir -p "$PREFIX"

install -m 755 "$BIN_ABS" "$PREFIX/$(basename "$BIN_ABS")"
if [[ -d "$STAGE/compat" ]]; then
  mkdir -p "$PREFIX/compat"
  install -m 644 "$STAGE"/compat/*.js "$PREFIX/compat/"
fi

# Download a private Node.js runtime next to the binary so `gelectron <app>`
# works on machines that don't have Node installed. The binary's runtime
# resolution checks its own directory first, so this private copy wins.
NODE_VERSION="20.18.1"
NODE_INSTALLED="$PREFIX/node"
if [[ "$PLATFORM" == "win32" ]]; then NODE_INSTALLED="$PREFIX/node.exe"; fi
if [[ ! -x "$NODE_INSTALLED" ]]; then
  echo "==> Installing private Node.js v$NODE_VERSION ..."
  case "$PLATFORM-$ARCH" in
    darwin-*)  NODE_PLATFORM="darwin-$ARCH"; NODE_EXT="tar.gz" ;;
    linux-*)   NODE_PLATFORM="linux-$ARCH";  NODE_EXT="tar.xz" ;;
    win32-*)   NODE_PLATFORM="win-$ARCH";    NODE_EXT="zip" ;;
  esac
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_PLATFORM}.${NODE_EXT}"
  NODE_ARCHIVE="$(mktemp /tmp/gelectron-node.XXXXXX.${NODE_EXT})"
  curl -fsSL -L "$NODE_URL" -o "$NODE_ARCHIVE"
  NODE_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/gelectron-node-stage.XXXXXX")"
  case "$NODE_EXT" in
    zip)     unzip -qo "$NODE_ARCHIVE" -d "$NODE_STAGE" ;;
    tar.gz)  tar -xzf "$NODE_ARCHIVE" -C "$NODE_STAGE" ;;
    tar.xz)  tar -xJf "$NODE_ARCHIVE" -C "$NODE_STAGE" ;;
  esac
  NODE_BIN="$(find "$NODE_STAGE" -type f \( -name 'node.exe' -o -name 'node' \) | head -n1)"
  if [[ -n "$NODE_BIN" ]]; then
    install -m 755 "$NODE_BIN" "$NODE_INSTALLED"
  else
    echo "  warning: could not install private Node.js — apps will require a system Node" >&2
  fi
  rm -rf "$NODE_STAGE" "$NODE_ARCHIVE"
fi

# Downloaded-from-GitHub binaries carry a quarantine attribute on macOS and
# Gatekeeper will block the first launch. Clear it — the binary is ad-hoc
# signed, so this is the only thing standing in the way.
if [[ "$PLATFORM" == "darwin" ]]; then
  xattr -dr com.apple.quarantine "$PREFIX/$(basename "$BIN_ABS")" 2>/dev/null || true
fi

echo
echo "  ✓ Installed: $PREFIX/$(basename "$BIN_ABS")"
echo "  ✓ Installed: $PREFIX/compat/"

if ! command -v gelectron >/dev/null 2>&1 || [[ "$(command -v gelectron)" != "$PREFIX/gelectron" ]]; then
  echo
  echo "  warning: $PREFIX is not on your PATH."
  case "$SHELL" in
    *zsh)  RC="$HOME/.zshrc" ;;
    *bash) RC="$HOME/.bashrc" ;;
    *)     RC="$HOME/.profile" ;;
  esac
  echo "  Add this line to $RC:"
  echo "    export PATH=\"$PREFIX:\$PATH\""
fi

echo
"$PREFIX/$(basename "$BIN_ABS")" --version >/dev/null 2>&1 && \
  echo "  Run: gelectron /path/to/electron-app" || \
  echo "  Hint: $PREFIX/$(basename "$BIN_ABS") --version"