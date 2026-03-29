# Contributing

## Commit Message

Use:

```text
<type>: <subject>
```

Allowed `type` values: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `build`, `perf`, `revert`.

Source of truth: `scripts/commit-policy.mjs`

Keep it simple:

- one-line subject
- 90 chars or fewer
- no trailing punctuation
- say what changed, not `wip` / `misc` / `update`

Examples:

```text
feat: add commit policy validation
fix: split oversized smoke coverage
docs: document hook setup
```

## Enable Local Hook

```bash
bash scripts/install-git-hooks.sh
```

## Manual Check

```bash
node scripts/validate-commit-msg.mjs --message "fix: split oversized smoke coverage"
node scripts/validate-commit-msg.mjs --range HEAD~5..HEAD
```
