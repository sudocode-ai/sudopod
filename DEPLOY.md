# Deployment Guide

## Prerequisites

```bash
npm whoami  # Verify logged in
git status  # Ensure clean working directory
```

## Deploy Steps

```bash
# 1. Bump version (patch | minor | major)
npm version patch

# 2. Push to git
git push && git push --tags

# 3. Publish to npm (build runs automatically via prepublishOnly hook)
npm publish

# 4. Verify
npm view sudopod
```

## Version Bumps

- `npm version patch` - 0.0.1 → 0.0.2 (bug fixes)
- `npm version minor` - 0.0.1 → 0.1.0 (new features)
- `npm version major` - 0.0.1 → 1.0.0 (breaking changes)

## Optional Commands

```bash
npm pack --dry-run    # Preview package contents
npm run build         # Manual build (auto-runs on publish)
npm publish --tag beta # Publish with tag
```
