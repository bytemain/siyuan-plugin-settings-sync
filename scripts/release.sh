#!/bin/bash
set -e

# Release script for siyuan-plugin-settings-sync
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.2.0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Parse arguments ---
SKIP_EDIT=false
VERSION=""
for arg in "$@"; do
  case "$arg" in
    --no-edit) SKIP_EDIT=true ;;
    *) VERSION="$arg" ;;
  esac
done

if [ -z "$VERSION" ]; then
  error "Usage: $0 [--no-edit] <version> (e.g., 0.2.0)"
fi

# Strip leading 'v' if provided (e.g., v0.2.0 -> 0.2.0)
VERSION="${VERSION#v}"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  error "Invalid version format: $VERSION (expected: x.y.z)"
fi

TAG="v${VERSION}"

# --- Pre-flight checks ---
info "Starting release ${TAG}..."

# Check for clean working tree
if [ -n "$(git status --porcelain)" ]; then
  error "Working tree is not clean. Please commit or stash changes first."
fi

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  error "Tag ${TAG} already exists."
fi

# --- Step 1: Update package.json version ---
info "Updating package.json version to ${VERSION}..."
if command -v node >/dev/null 2>&1; then
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '${VERSION}';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
else
  error "Node.js is required but not found."
fi

# --- Step 2: Update plugin.json version ---
info "Updating plugin.json version to ${VERSION}..."
node -e "
  const fs = require('fs');
  const plugin = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
  plugin.version = '${VERSION}';
  fs.writeFileSync('plugin.json', JSON.stringify(plugin, null, 2) + '\n');
"

# --- Step 3: Run npm install and npm run build ---
info "Running npm install..."
npm install

info "Running npm run build..."
npm run build

# --- Step 4: Update CHANGELOG.md ---
info "Updating CHANGELOG.md..."
DATE=$(date +%Y-%m-%d)

# Check if changelog entry already exists
if grep -q "## ${TAG}" CHANGELOG.md; then
  warn "Changelog entry for ${TAG} already exists, skipping."
else
  # Insert new version section after the "# Changelog" header
  node -e "
    const fs = require('fs');
    let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const header = '# Changelog';
    const newEntry = '\n\n## ${TAG} (${DATE})\n\n* <!-- Add release notes here -->';
    if (changelog.startsWith(header)) {
      changelog = header + newEntry + changelog.slice(header.length);
    } else {
      changelog = header + newEntry + '\n\n' + changelog;
    }
    fs.writeFileSync('CHANGELOG.md', changelog);
  "
  info "Added changelog entry for ${TAG}. Please edit CHANGELOG.md to add release notes."

  # Open editor for changelog if running interactively and --no-edit is not set
  if [ "$SKIP_EDIT" = false ] && [ -t 0 ]; then
    if [ -n "${EDITOR:-}" ]; then
      "$EDITOR" CHANGELOG.md
    else
      warn "No \$EDITOR set. Please edit CHANGELOG.md manually before continuing."
      read -rp "Press Enter after editing CHANGELOG.md (or Ctrl+C to abort)... "
    fi
  fi
fi

# --- Step 5: Commit and create git tag ---
info "Committing changes..."
git add package.json plugin.json CHANGELOG.md
# Include lock files if they were modified
git diff --quiet package-lock.json 2>/dev/null || git add package-lock.json 2>/dev/null || true
git diff --quiet pnpm-lock.yaml 2>/dev/null || git add pnpm-lock.yaml 2>/dev/null || true
git commit -m "chore: release ${TAG}"

info "Creating tag ${TAG}..."
git tag "${TAG}"

echo ""
info "Release ${TAG} prepared successfully!"
info "Next steps:"
echo "  1. Review the commit:  git show HEAD"
echo "  2. Push with tag:      git push origin main --tags"
echo "  3. The CI will build and create a GitHub release automatically."
