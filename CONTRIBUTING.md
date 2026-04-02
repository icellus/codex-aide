# Contributing

[简体中文](CONTRIBUTING.zh-CN.md)

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
- say what changed, not `wip`, `misc`, or `update`

Examples:

```text
feat: add commit policy validation
fix: split oversized smoke coverage
docs: document hook setup
```

## Enable Local Hooks

```bash
bash scripts/install-git-hooks.sh
```

## Manual Checks

```bash
node scripts/validate-commit-msg.mjs --message "fix: split oversized smoke coverage"
node scripts/validate-commit-msg.mjs --range HEAD~5..HEAD
node scripts/validate-codex-aide-dev.mjs contract
node scripts/validate-codex-aide-dev.mjs full
```

The development validator runs in an isolated temporary mirror and must not create host runtime artifact directories such as repo-root `.codex/`.

Development validation policy and test-asset rules live in [TESTING.md](TESTING.md).
These commands are the same whether you work manually, through Codex, through another AI assistant, or through CI automation.
