# Testing

[简体中文](TESTING.zh-CN.md)

This document defines the development-time validation model for `codex-aide` inside this repository.

It does not define:

- installation smoke checks
- installed-runtime user workflows inside target repositories
- runtime authority itself

Files such as `standards/*.json`, `fixtures/codex-aide-dev/**`, and `scripts/validate-*.mjs` belong to development governance only.
They validate runtime authority and implementation alignment; they are not runtime authority.

## Principles

- These rules apply to every contributor, whether the change is made manually, through Codex, through another AI assistant, or with no AI tooling at all.
- Treat `codex-aide` as a maintained product, not as a disposable task artifact.
- Optimize for durable signal, not for making the current change pass at any cost.
- Prefer a small number of stable executors plus explicit rule data over a growing pile of one-off scripts.
- Keep test assets easy to review, easy to delete, and easy to justify.
- Keep development validation CLI-first and tool-agnostic so the same checks can run from shell, hooks, CI, or editor integrations.

## Validation Model

Development validation is organized along two axes: `layer` and `assertion_kind`.

### Layer

- `contract`
  - Executable contract checks only.
  - This layer may contain `shape` and `behavior` assertions.
  - Do not disguise runtime behavior semantics as `contract` when the check is only text repetition.

- `consistency`
  - Cross-file alignment checks only.
  - This layer exists for authority boundaries, ownership, handoff, special-flow rules, path conventions, and integration wiring.
  - It is not the owner of runtime behavior semantics, state machines, or event models.

- `meta`
  - Validation of the testing system itself.
  - This layer covers registry health, proof fixtures, budgets, suite integrity, and failing-proof expectations.

### Assertion Kind

- `shape`
  - Structure, parseability, single-file invariants, and target validators.

- `behavior`
  - Fixture-driven execution checks with outcome assertions.
  - Execution entrypoints should establish one canonical absolute `projectDir` up front.
  - Machine-consumed runtime paths should remain absolute once they are written into runtime state.
  - Host-maintenance validation entrypoints must run inside an isolated temporary mirror of the repository, not against the live host worktree.
  - Development validation must not create host runtime artifacts such as repo-root `.codex/`, `.codex/state/*.json`, `.codex/logs/**`, or `.codex/progress/**`.

- `consistency`
  - Cross-file alignment for ownership, boundaries, handoff rules, path conventions, special-flow routing, and integration wiring.

- `meta`
  - Health of the testing system itself.

`contract` is a layer, not an assertion kind.
Every check in the `contract` layer must be explicitly classified as either `shape` or `behavior`.

## Default Entry Points

Use the unified development validator:

```bash
node scripts/validate-codex-aide-dev.mjs contract
node scripts/validate-codex-aide-dev.mjs consistency
node scripts/validate-codex-aide-dev.mjs meta
node scripts/validate-codex-aide-dev.mjs full
```

The default validator runs against an isolated temporary mirror of the repository and must leave the host worktree free of runtime artifact directories such as repo-root `.codex/`.

Default meanings:

- `contract`: executable contract checks across `shape + behavior`
- `consistency`: cross-file alignment checks
- `meta`: validation of the testing system itself
- `full`: `contract + consistency + meta`

Git hooks use:

- `pre-commit` -> `contract`, scoped to staged files in the validation-maintenance boundary
- `pre-push` -> `full`, scoped to validation-maintenance files in the refs being pushed
- repository CI -> `full`, so pull requests and pushes expose the same governed development-validation closeout in GitHub Actions

Hook-scoped execution rules:

- if no validation-maintenance files are present in the current staged set or pushed refs, the hook may skip running the validator
- changed-file scoping may filter expensive `contract` `behavior` checks, but must not skip `shape`, `consistency`, or `meta` layers that still belong to the selected mode
- when `scripts/validate-codex-aide-dev.mjs` or `standards/codex-aide-test-registry.json` changes, do not filter `contract` behavior checks by changed files

`standards/codex-aide-test-registry.json` is the dispatch table for the default suite.
If the registry cannot be read, development validation must fail instead of pretending the suite is still known.

## Source Of Truth

Development validation is defined by:

- [AGENTS.md](AGENTS.md)
- [TESTING.md](TESTING.md)
- [scripts/validate-codex-aide-dev.mjs](scripts/validate-codex-aide-dev.mjs)
- [scripts/validate-codex-aide-authority.mjs](scripts/validate-codex-aide-authority.mjs)
- [standards/codex-aide-authority-map.json](standards/codex-aide-authority-map.json)
- [standards/codex-aide-consistency-map.json](standards/codex-aide-consistency-map.json)
- [standards/codex-aide-test-registry.json](standards/codex-aide-test-registry.json)
- [fixtures/codex-aide-dev](fixtures/codex-aide-dev)

Within this model:

- `authority-map.json` and `consistency-map.json` are development-time rule data.
- They describe how validation works; they do not define runtime authority.

## Daily Decision Rules

When changing testing, use this order:

1. Decide whether no new check is needed.
2. If coverage must change, prefer updating an existing check.
3. Add a new check only when the rule or escaped failure mode is genuinely new.
4. Delete or merge checks in the same change when they are duplicate, obsolete, or no longer well-owned.

### When To Add No New Check

Do not add a new check when any of the following is true:

- the change does not alter a governed rule, invariant, or failure mode
- the change is documentation-only and does not affect development validation behavior
- the implementation only refactors an executor and existing checks still cover the same `rule_id`
- an existing check was updated and no new rule or failure mode was introduced

When choosing not to add a check, record the reason in a change note, review note, PR description, or validation note.

### When To Update An Existing Check

Update an existing check instead of adding one when:

- the same `rule_id` still applies
- the existing check is still the correct owner for that behavior or constraint
- the change only refreshes wording, fixtures, owners, target files, or accepted output shape

### When To Add A New Check

Add a new check only when all of the following are true:

- the protected rule or escaped failure mode is genuinely new
- current active coverage cannot express it honestly
- the new check has a clear long-term owner
- the check remains useful after the current change is complete

Before adding a new check, answer from repository evidence:

- which `rule_id` or escaped failure mode it protects
- why existing coverage is insufficient
- why updating an existing check is not enough
- whether it is permanent or `temporary`
- if `temporary`, when it must be removed

### When To Delete Or Merge Checks

Delete or merge a check when any of the following is true:

- the underlying rule was removed or intentionally replaced
- the check only covered an obsolete implementation path
- another active check already covers the same `rule_id` and failure mode
- a `temporary` check reached its removal condition
- the check only validates repeated prose but was incorrectly treated as runtime behavior coverage

## Test Asset Rules

- Keep one default validation entrypoint.
- Prefer adding coverage through rule data or small fixtures before adding a new executor.
- Do not add a new executor when an existing one can express the rule honestly.
- Do not use large snapshots or full-file golden copies as routine coverage.
- Do not use thick mocks for internal rule semantics.
- Prefer minimal real fixtures that exercise validators directly.
- Let test assets grow mainly in rule data and small fixtures, not in script count.

## Registry Rules

Every active development-validation check must be registered in [standards/codex-aide-test-registry.json](standards/codex-aide-test-registry.json).

Minimum fields:

- `id`
- `layer`
- `assertion_kind`
- `rule_id`
- `failure_mode`
- `source_paths`
- `owner`
- `status`
- `executor`

Additional rules:

- `temporary` checks must declare `remove_when`
- checks with maintained failing proofs must declare `proof_fixture_root`
- fixture count and size must remain inside registry budgets
- `layer` and `assertion_kind` must stay aligned:
  - `contract -> shape|behavior`
  - `consistency -> consistency`
  - `meta -> meta`

## Consistency Scope

`standards/codex-aide-consistency-map.json` may only express these cross-file consistency classes:

- `ownership`
- `handoff`
- `path-convention`
- `authority-boundary`
- `special-flow`
- `integration-wiring`

Do not use consistency rules for:

- runtime state-machine legality
- runtime event enumerations
- archive-loop behavior itself
- any semantics that should be proven through script execution or fixture-driven behavior checks

## Failing Proof Requirement

Development validators are not trusted on pass cases alone.

- Maintain at least one intentional failing proof path for authority, consistency, and behavior checks.
- Keep failing-proof fixtures minimal, purpose-built, and readable.
- If a validator passes on the live tree but has no maintained failing proof path, treat it as incomplete.

## Review And Delivery

For every `codex-aide` development change, report:

- which layers were run
- which assertion kinds ran inside each layer
- what rule, boundary, or drift those checks cover
- whether checks were updated, deleted, migrated, or intentionally not added
- any remaining validation gap and its owner

Do not describe text-presence checks as behavior coverage.
Do not describe a partial local iteration check as full development validation.
