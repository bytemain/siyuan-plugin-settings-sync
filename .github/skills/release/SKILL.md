---
name: release
description: Perform a release for siyuan-plugin-settings-sync. Use this skill whenever the user asks to release, publish, bump version, cut a release, prepare a new version, or do anything related to versioning and releasing this SiYuan plugin. Also use this skill when the user mentions updating the version number, creating a release tag, or shipping a new version.
---

# Release

This skill handles the full release workflow for the siyuan-plugin-settings-sync SiYuan plugin. A release involves bumping versions in two manifest files, verifying the build, updating the changelog, and creating a git tag.

## When to use

Use this skill when the user asks to:
- Release a new version
- Bump the version
- Prepare a release
- Create a version tag
- Ship / publish a new version

The user should provide the **target version number** (e.g., `0.2.0`). If they don't, ask for it. Accept formats like `0.2.0` or `v0.2.0` — always normalize to bare semver (`x.y.z`) for the files and prefix with `v` for the git tag.

## Pre-flight checks

Before starting, verify:

1. The working tree is clean (`git status --porcelain` returns empty). If not, ask the user to commit or stash first.
2. The tag `v<version>` does not already exist (`git tag -l v<version>`). If it does, tell the user and ask for a different version.
3. The version string is valid semver (`x.y.z`, digits only).

## Release steps

Execute these steps in order:

### Step 1 — Update `package.json`

Read `package.json`, set the `"version"` field to the new version, and write it back. Preserve the existing formatting (2-space indent, trailing newline).

### Step 2 — Update `plugin.json`

Read `plugin.json`, set the `"version"` field to the new version, and write it back. Same formatting rules.

### Step 3 — Install dependencies and build

Run:
```bash
pnpm install
pnpm run build
```

Both commands must succeed. If either fails, stop and report the error — do not continue with a broken build.

### Step 4 — Update `CHANGELOG.md`

Insert a new section **after** the `# Changelog` heading and **before** the previous version entry. Use this format:

```markdown
## v<version> (<YYYY-MM-DD>)

* <summary of changes>
```

To populate the changelog content, look at the git log since the last tag to summarize what changed. If there are no commits beyond version bumps, write a brief description based on context from the conversation.

### Step 5 — Commit and tag

```bash
git add package.json plugin.json CHANGELOG.md
# Also stage lock file if it changed
git add pnpm-lock.yaml 2>/dev/null || true

git commit -m "chore: release v<version>"
git tag "v<version>"
```

## After release

Tell the user the release is ready and remind them to push:

```
git push origin main --tags
```

The existing CI workflow (`.github/workflows/release.yml`) will automatically build and create a GitHub Release with the `package.zip` artifact when the tag is pushed.

## Example

**User:** "Release 0.3.0"

**Steps performed:**
1. Verify clean tree, no existing `v0.3.0` tag
2. Set `"version": "0.3.0"` in `package.json`
3. Set `"version": "0.3.0"` in `plugin.json`
4. Run `pnpm install && pnpm run build`
5. Add `## v0.3.0 (2025-01-15)` section to `CHANGELOG.md`
6. `git commit -m "chore: release v0.3.0"` and `git tag v0.3.0`
7. Tell user to `git push origin main --tags`
