# Merge Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Maintainers merging feature branches
- Developers preparing branches for merge
- Operators understanding merge procedures

## Why This Exists

This guide documents the merge process from feature branches to main, including verification steps.

---

## Standard Merge Process

### 1. Prepare the Branch

```bash
# Ensure branch is up to date
git checkout feature-branch
git pull origin feature-branch
git merge origin/master  # Or rebase
```

### 2. Verify Tests Pass

```bash
pnpm install
pnpm -r build
pnpm -r test
```

### 3. Create Pull Request

Use web UI or CLI:
```bash
gh pr create --title "Feature: Description" --body-file docs/70-dev/pull-request.md
```

### 4. Review and Merge

After approval:
```bash
gh pr merge <pr-number> --merge
```

---

## Verification After Merge

```bash
git checkout master
git pull origin master
pnpm install
pnpm -r build
pnpm -r test
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| PR template | `docs/70-dev/pull-request.md` |
| Test runner | `pnpm -r test` |
