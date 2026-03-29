# codex-starter tests

Repository-level development tests for `codex-starter`.

Layout:

- `contract/`: authority and text contract checks
- `behavior/`: reply, delegation, and adversarial behavior checks
- `mutation/`: anti-regression mutation checks
- `smoke/`: runtime and log-analysis smoke checks
- `helpers/`: shared path helpers

Unified entrypoint:

```bash
node tests/codex-starter/run.mjs
node tests/codex-starter/run.mjs --file codex-starter/AGENTS.md
node tests/codex-starter/run.mjs --suite fast
node tests/codex-starter/run.mjs --suite smoke
node tests/codex-starter/run.mjs --suite mutation
node tests/codex-starter/run.mjs --suite full
```

Notes:

- leaf tests are executable on their own
- suite execution is centralized here to avoid nested runs and duplicate coverage
- `manifest.mjs` is the single source of truth for suite composition and changed-files mapping
- `run.mjs` without arguments auto-selects the minimal mapped suites from the current git worktree
- `run.mjs --file ...` is the preferred bounded validation path for subagents with a clear write set
- these tests are for maintaining the starter repository itself, not for installation into target projects
