# Contributing

## Commit Message

Use:

```text
<type>(<scope>): <subject>
```

`scope` is optional.

Allowed `type` values: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `build`, `perf`, `revert`.

Keep it simple:

- one-line subject
- 72 chars or fewer
- no trailing punctuation
- say what changed, not `wip` / `misc` / `update`

Examples:

```text
feat: add commit policy validation
fix(tests): split oversized smoke coverage
docs(readme): document hook setup
```

## Enable Local Hook

```bash
bash scripts/install-git-hooks.sh
```

## Manual Check

```bash
node scripts/validate-commit-msg.mjs --message "fix(tests): split oversized smoke coverage"
node scripts/validate-commit-msg.mjs --range HEAD~5..HEAD
```
