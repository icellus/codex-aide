# agent-skills

Repository-level maintenance guidance for this repo.

## Scope

- This repository currently maintains `codex-aide` only.
- `claude-starter` now lives as a standalone repository at <https://github.com/icellus/claude-starter>.
- This root-level `AGENTS.md` is for maintaining this repository itself.
- It is not the runtime authority shipped into target repositories by `codex-aide`.
- The shipped runtime authority for the starter lives at [codex-aide/AGENTS.md](codex-aide/AGENTS.md).

## Host Isolation Hard Constraint

- While maintaining this repository, treat `codex-aide/**` as the development target, not the active authority for the current maintenance session.
- Do not let `codex-aide` runtime defaults (for example assistant persona, route aliases, or routing rules) leak back into host maintenance sessions unless this root guide or explicit user instruction says so.
- This isolation rule does not weaken `codex-aide` runtime authority after it is installed into a target repository.

## Default Working Rules

- Reply to the user in Chinese by default.
- Repository commits should pass the local commit policy in `scripts/commit-policy.mjs`.
- Changes to `codex-aide/AGENTS.md`, `.codex/policies/**`, `.codex/skills/**`, `.codex/agents/**`, or `.codex/context/**` must pass the local authority validator via `.githooks/pre-commit` and `.githooks/pre-push`.
- Legacy repo-level test scripts under `tests/codex-aide/` have been removed; do not assume a fixed runner exists.
- For generic host-maintenance work, validation should use the smallest task-relevant command or script available in the current repo state.
- For `codex-aide` development work, do not treat an isolated minimal check as sufficient when the change can cause cross-file rule drift; follow the governed development-validation rules in this file.
- If no reliable automated validation exists for the current task, record that explicitly instead of inventing coverage.

## Context And Token Discipline

- Prefer minimal complete task briefs for subagents.
- When a subtask is clear, bounded, and independent, prefer `fork_context: false` to keep execution focused and reliable.
- When a subagent owns a clear write set, pass the owned files and state the intended validation boundary explicitly.
- Do not assume one repository-wide validation entrypoint exists after the legacy test-script cleanup.

## Authority Drift Prevention

- For `codex-aide` runtime-boundary changes, define the boundary first in the owner set: `codex-aide/AGENTS.md`, `codex-aide/.codex/policies/routing-policy.md`, and the owned runtime artifact.
- Prefer positive authority statements such as `runtime authority lives in X` over repeated negative warnings in downstream skills or agents.
- Repeat a boundary in downstream skills or agents only when it changes executable read order or write ownership.
- Keep demo/example files semantically distinct from live files through naming and owner-file documentation; introduce fallback semantics only when a shipped script really implements them.

## Review Timing In Host Maintenance

- This section governs host-maintenance workflow for this repository only; it is not a runtime-authority rule for `codex-aide`.
- Default `code review` / `reviewer` work starts after worker threads produce real code changes in the workspace.
- Implementation review must be evidence-based on actual diff, implementation outcome, and validation outcomes (for example tests or command checks).
- If review runs in parallel before real implementation lands, classify it as design review / solution review only, not implementation review.
- Design/solution review cannot replace the post-implementation review pass for real delivered changes.

## Systemic Fix Strategy

- Do not optimize for the smallest local patch when the escaped issue is systemic. Fix the governing contract first, then update the dependent implementation.
- Do not preserve a flawed abstraction only because it reduces immediate diff size. Prefer the structurally correct model when the old shape is the source of recurring drift.
- When multiple defects share the same root cause, solve them as one repair cluster instead of shipping a series of isolated symptom patches.
- Prefer a shared contract plus aligned consumers over repeated local heuristics. This applies especially to runtime root resolution, task-state transitions, delivery gates, and governance routing.
- When an old field or rule still carries design value but is not yet consumed by execution, do not silently delete it. Mark its status explicitly so design intent is preserved without pretending it is live behavior.
- When a report or review introduces new repair groupings, keep the mapping back to the original issue identifiers so later follow-up does not lose the original anchor.

## Validation

- The legacy `tests/codex-aide/` runner and scripts have been removed from this repository.
- For repo-maintenance work, choose the lightest validation that still produces real evidence from the current repo state.
- Acceptable validation may be syntax checks, command-level sanity checks, or targeted manual evidence when those are the only reliable options.
- If a task intentionally ships without automated validation, state that clearly together with the reason and residual risk.

## Codex-Starter Development Test Governance

- `TESTING.md` is the dedicated policy document for `codex-aide` development validation in this repository.
- The default development-validation entrypoint is `node scripts/validate-codex-aide-dev.mjs`.
- The development-validation rules apply to all contributors and must remain usable without Codex-specific runtime assumptions.
- Keep development validation layered as `contract`, `consistency`, and `meta`; do not let local minimal iteration checks replace full closeout for multi-file rule changes.
- All active development-validation checks must be registered in [standards/codex-aide-test-registry.json](standards/codex-aide-test-registry.json).
- Prefer updating existing rule data or fixtures over adding new executors or standalone scripts.
- Do not add new default checks unless a stable new rule or a real escaped regression requires them.
- If no new check is added for a `codex-aide` development change, record the reason in a change summary, PR description, review note, or validation note.
- Validators must keep a maintained failing proof path; pass-only checks are not sufficient.
