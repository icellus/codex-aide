# codex-starter tests

Repository-level development tests for `codex-starter`.

Layout:

- `contract/`: runner and suite-selection contract checks
- `smoke/`: runtime and log-analysis smoke checks, split by domain to keep files small
- `helpers/`: shared path helpers

Unified entrypoint:

```bash
node tests/codex-starter/run.mjs
node tests/codex-starter/run.mjs --file codex-starter/install.sh
node tests/codex-starter/run.mjs --suite contract
node tests/codex-starter/run.mjs --suite smoke
node tests/codex-starter/run.mjs --suite full
```

Notes:

- leaf tests are executable on their own
- suite execution is centralized here to avoid nested runs and duplicate coverage
- `manifest.mjs` is the single source of truth for suite composition and changed-files mapping
- `run.mjs` without arguments auto-selects the minimal mapped suites from the current git worktree
- `run.mjs --file ...` is the preferred bounded validation path for subagents with a clear write set
- these tests are for maintaining the starter repository itself, not for installation into target projects
- prompt-text heuristics and hand-maintained fixture suites were removed on purpose; only executable coverage remains here
- docs or maintenance-guide changes may map to no suite when no reliable executable assertion exists
- test inventory is intentionally frozen small; adding a new `*.mjs` file requires updating the contract budget gate on purpose
- keep feature tests core-only; if a file approaches its budget, split or delete lower-value coverage before adding more
- runtime smoke is intentionally split into focused files; do not merge it back into a catch-all smoke entry
