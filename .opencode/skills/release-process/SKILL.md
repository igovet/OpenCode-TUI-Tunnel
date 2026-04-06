---
name: release-process
description: How OpenCode-TUI-Tunnel release automation works in CI and npm
---

## Use This Skill

Put this at the top of your prompt:

`@release-process`

Then describe the release/documentation/update task.

## Source of Truth

Use `.github/workflows/release.yml` as canonical behavior.

Do **not** rely on `.github/documents/NPM_PUBLISHING_GUIDE.md` for current gating logic; it is stale.

## Current Release Model: Always Release on `main`

The release workflow runs on:

- every push to `main`
- manual `workflow_dispatch`

The `determine-release` job currently sets:

- `should_release = true`
- `reason = always-release` (or `manual-dispatch` for manual runs)

That means there is no package-version-change gate right now.

## CI Runtime Requirement

Release CI uses **Node 24** for build and publish jobs (`actions/setup-node` with `node-version: '24'`).

## Versioning Contract

Release version is read from `package.json`:

```json
{
  "version": "x.y.z"
}
```

GitHub release tag/name are generated as `v${version}`.

Workflow behavior before creating release:

- tries to delete any existing GitHub release for that tag
- tries to delete existing tag ref
- creates a fresh release for current commit SHA

## npm Publish Behavior

Before publishing, workflow checks whether `${name}@${version}` already exists on npm.

- If version already exists: publish step is skipped.
- If version does not exist: `npm publish --access public` runs.

Practical implication: repeated `main` pushes with unchanged version keep creating GitHub releases, but npm publish becomes no-op once version exists.

## Maintainer Checklist

When you want a new npm package release:

1. Bump `package.json` version.
2. Merge/push to `main`.
3. Verify workflow succeeds in Actions.
4. Confirm npm package version appears.

Quick local preflight before push:

```bash
npm ci
npm run build
npm run lint
```

## Documentation Caveat (Important)

`.github/documents/NPM_PUBLISHING_GUIDE.md` currently describes older behavior (version-change gating, Node 20, optional publish toggle semantics) that does not match `release.yml`.

If release docs are being updated, treat `release.yml` as ground truth and align docs to it.
