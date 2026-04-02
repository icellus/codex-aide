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
node scripts/validate-codex-starter-dev.mjs contract
node scripts/validate-codex-starter-dev.mjs full
```

The development validator runs in an isolated temporary mirror and must not create host runtime artifact directories such as repo-root `.codex/`.

Development validation policy and test-asset rules live in [TESTING.md](/workspace/agent-skills/TESTING.md).
These commands are the same whether you work manually, through Codex, through another AI assistant, or through CI automation.
