# Testing

This document defines development-time validation for `codex-starter` inside `/workspace/agent-skills`.

It does not define:

- installation smoke validation
- installed-runtime user workflow validation inside target repositories

## Principles

- These rules apply to all contributors, whether changes are made manually, with Codex, with another AI assistant, or with no AI tooling at all.
- Treat `codex-starter` as a maintained product, not as a throwaway task artifact.
- Optimize for long-term signal density, not for making the current change pass at any cost.
- Prefer a small number of stable executors plus explicit rule data over many bespoke scripts.
- Keep test assets easy to review, easy to delete, and easy to prove useful.
- Keep validation CLI-first and tool-agnostic so the same checks can run from a shell, Git hooks, CI, or any editor/integration.

## Default Entry Points

Use the unified development validator:

```bash
node scripts/validate-codex-starter-dev.mjs contract
node scripts/validate-codex-starter-dev.mjs consistency
node scripts/validate-codex-starter-dev.mjs meta
node scripts/validate-codex-starter-dev.mjs full
```

Default meanings:

- `contract`: single-file or single-owner invariants
- `consistency`: cross-file rule alignment for the same behavior
- `meta`: validation of test assets, registry quality, and failing proof paths
- `full`: `contract + consistency + meta`

Git hooks use:

- `pre-commit` -> `contract`
- `pre-push` -> `full`

## Source Of Truth

Development validation is defined by these files:

- [AGENTS.md](/workspace/agent-skills/AGENTS.md)
- [TESTING.md](/workspace/agent-skills/TESTING.md)
- [scripts/validate-codex-starter-dev.mjs](/workspace/agent-skills/scripts/validate-codex-starter-dev.mjs)
- [scripts/validate-codex-starter-authority.mjs](/workspace/agent-skills/scripts/validate-codex-starter-authority.mjs)
- [standards/codex-starter-authority-map.json](/workspace/agent-skills/standards/codex-starter-authority-map.json)
- [standards/codex-starter-consistency-map.json](/workspace/agent-skills/standards/codex-starter-consistency-map.json)
- [standards/codex-starter-test-registry.json](/workspace/agent-skills/standards/codex-starter-test-registry.json)
- [fixtures/codex-starter-dev](/workspace/agent-skills/fixtures/codex-starter-dev)

## Daily Decision Rules

Use this fixed order when changing `codex-starter`:

1. First decide whether no new check is needed.
2. If coverage must change, prefer updating an existing check.
3. Add a new check only when the rule or failure mode is genuinely new.
4. Delete or merge checks immediately when they are duplicate, obsolete, or ruleless.

### When To Add No New Check

Do not add a new check when any of the following is true:

- the change does not alter a governed rule, invariant, or failure mode
- the change is documentation-only and does not affect development-validation behavior
- the implementation only refactors an executor and existing checks still cover the same `rule_id`
- an existing active check was updated and no new rule or new failure mode was introduced

When choosing no new check, record the reason in the change summary, PR description, review note, or validation note.

### When To Update An Existing Check

Update an existing check instead of adding one when all of the following are true:

- the same `rule_id` still applies
- the existing check is still the correct owner for that behavior
- the change only refreshes wording, file ownership, fixture text, accepted output shape, or rule expression under the same rule

### When To Add A New Check

Add a new check only when all of the following are true:

- the protected rule or failure mode is genuinely new
- current active coverage cannot represent it without becoming misleading
- the added check has a clear long-term owner
- the added check remains useful after the current change is finished

Before adding a new check, answer from repository evidence:

- which `rule_id` or escaped failure mode it protects
- why existing coverage is insufficient
- why updating an existing check is not enough
- whether it is permanent or `temporary`
- if `temporary`, when it must be removed

### When To Delete Or Merge Checks

Delete or merge a check in the same change when any of the following is true:

- the underlying rule was removed or intentionally replaced
- the check only covered an obsolete implementation path
- another active check already covers the same `rule_id` and failure mode
- a `temporary` check reached its removal condition

## Test Asset Rules

- Keep one default validation entrypoint.
- Add new coverage to rule data or tiny fixtures first.
- Do not add a new executor when an existing one can express the rule.
- Do not add large snapshots or full-file golden copies as routine coverage.
- Do not use thick mocks for internal rule semantics.
- Prefer minimal real text fixtures that exercise validators directly.
- Validation assets should grow mainly in rule data and tiny fixtures, not in script count.

## Registry Rules

Every active development-validation check must be registered in [standards/codex-starter-test-registry.json](/workspace/agent-skills/standards/codex-starter-test-registry.json).

Minimum fields:

- `id`
- `type`
- `rule_id`
- `failure_mode`
- `source_paths`
- `owner`
- `status`
- `executor`

Additional rules:

- `temporary` checks must define `remove_when`
- checks with maintained failing proofs must define `proof_fixture_root`
- fixture count and fixture size must stay inside the registry budgets

## Failing Proof Requirement

Development validators are not trusted on passing examples alone.

- Maintain at least one intentional failing proof path for validators that enforce authority or consistency behavior.
- Keep failing proof fixtures minimal and purpose-built.
- If a validator passes on the live tree but has no maintained failing proof path, treat it as incomplete.

## Review And Delivery

For every `codex-starter` development change, report:

- which validation layers were run
- what rule, invariant, or drift they cover
- whether a check was updated, added, deleted, merged, or intentionally not added
- any remaining validation gap and owner

Do not describe a partial local iteration check as full development validation.
This reporting requirement is tool-agnostic; use the delivery surface that exists for the change, such as a local change note, PR description, review summary, or assistant handoff.
