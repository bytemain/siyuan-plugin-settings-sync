# Releasing

This document describes how to publish a new version of the plugin.

## Overview

Releases are semi-automated: a human merges a release PR and pushes a git
tag, then the [release workflow](.github/workflows/release.yml) builds the
plugin and publishes a GitHub Release with `package.zip` attached. The
SiYuan marketplace picks up new versions from GitHub Releases.

## Prerequisites

- Write access to this repository (to merge PRs and push tags).
- The version number follows [semver](https://semver.org/): patch for
  fixes, minor for backwards-compatible features, major for breaking
  changes.

## Steps

### 1. Prepare a release PR

Create a branch `chore/release-vX.Y.Z` off the latest `main` and change
exactly these files:

- `plugin.json` — bump `version` to `X.Y.Z`
- `package.json` — bump `version` to the same value
- `CHANGELOG.md` — add a `## vX.Y.Z (YYYY-MM-DD)` section at the top,
  following the existing entry style (one bullet per change, referencing
  the issue/PR number like `(#34)`)

Keep the release PR free of feature or fix commits — those land on `main`
via their own PRs first. Open the PR with the title
`chore: release vX.Y.Z` and merge it once CI is green.

### 2. Tag the release

On the merged `main`:

```bash
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag name **must** be `vX.Y.Z` and match the `version` in
`plugin.json` exactly — the release workflow only runs on `v*.*.*` tags,
and the marketplace compares the tag against `plugin.json`.

### 3. Verify

The [release workflow](.github/workflows/release.yml) triggers on the tag
push (or on publishing a release from the GitHub UI) and:

1. Runs `build.sh` (`pnpm install` + production webpack build)
2. Creates/updates the GitHub Release for the tag, attaching
   `package.zip` and auto-generated release notes

Check the Actions tab that the workflow succeeded, then confirm the
release page shows the new version with `package.zip` attached. Within a
few minutes the new version should become available in SiYuan's
marketplace.

## If something goes wrong

- **Workflow failed on the tag**: fix the cause on `main` (normal PR),
  delete the tag locally and remotely (`git tag -d vX.Y.Z &&
  git push origin :refs/tags/vX.Y.Z`), re-tag on the fixed commit and
  push again.
- **Wrong version published**: delete the GitHub Release and the tag,
  then redo from step 1 with a new version number. Do not reuse a version
  number that the marketplace may already have indexed.

## CI

Every PR and every push to `main` runs lint, tests and a production build
via [ci.yml](.github/workflows/ci.yml). Do not merge anything red.
