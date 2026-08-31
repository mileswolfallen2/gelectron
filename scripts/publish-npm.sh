#!/usr/bin/env bash
#
# publish-npm.sh
#
# Publishes all platform packages and the main gelectron package to npm.
# Run this after build-npm.sh has placed .node files in the npm/ folders.
#

set -eo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

PLATFORMS=(
  "npm/darwin-arm64"
  "npm/darwin-x64"
  "npm/win32-x64-msvc"
  "npm/win32-arm64-msvc"
  "npm/linux-x64-gnu"
  "npm/linux-arm64-gnu"
)

echo "═══════════════════════════════════════════════════"
echo " Gelectron NPM Publisher"
echo "═══════════════════════════════════════════════════"
echo ""

# Check if logged in
if ! npm whoami &>/dev/null; then
  echo "Not logged in to npm. Run 'npm login' first."
  exit 1
fi

published=0
skipped=0

for dir in "${PLATFORMS[@]}"; do
  pkg_name=$(node -e "console.log(require('./$dir/package.json').name)")
  has_node=false

  # Check if the .node file exists
  for f in "$dir"/*.node; do
    if [ -f "$f" ]; then
      has_node=true
      break
    fi
  done

  if $has_node; then
    echo "Publishing $pkg_name..."
    (cd "$dir" && npm publish --access public)
    published=$((published + 1))
  else
    echo "Skipping $pkg_name (no .node file)"
    skipped=$((skipped + 1))
  fi
done

echo ""
echo "Publishing main gelectron package..."
npm run prepublishOnly
npm publish --access public
published=$((published + 1))

echo ""
echo "═══════════════════════════════════════════════════"
echo " Done: $published published, $skipped skipped"
echo "═══════════════════════════════════════════════════"
