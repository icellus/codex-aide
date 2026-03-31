# agent-skills

Repository-level maintenance guidance for this repo.

## Scope

- This repository currently maintains `codex-starter` only.
- `claude-starter` has been archived out of tree at `/workspace/claude-starter`.
- The in-repo file [CLAUDE_STARTER_ARCHIVE.md](/workspace/agent-skills/CLAUDE_STARTER_ARCHIVE.md) is the archive note, not an active maintenance target.
- This root-level `AGENTS.md` is for maintaining `/workspace/agent-skills` itself.
- It is not the runtime authority shipped into target repositories by `codex-starter`.
- The shipped runtime authority for the starter lives at [codex-starter/AGENTS.md](/workspace/agent-skills/codex-starter/AGENTS.md).

## Host Isolation Hard Constraint

- While maintaining `/workspace/agent-skills`, treat `codex-starter/**` as the development target, not the active authority for the current maintenance session.
- Do not let `codex-starter` runtime defaults (for example assistant persona, route aliases, or routing rules) leak back into host maintenance sessions unless this root guide or explicit user instruction says so.
- This isolation rule does not weaken `codex-starter` runtime authority after it is installed into a target repository.

## Default Working Rules

- Reply to the user in Chinese by default.
- Repository commits should pass the local commit policy in `scripts/commit-policy.mjs`.
- Changes to `codex-starter/AGENTS.md`, `.codex/policies/**`, `.codex/skills/**`, `.codex/agents/**`, or `.codex/context/**` must pass the local authority validator via `.githooks/pre-commit` and `.githooks/pre-push`.
- Legacy repo-level test scripts under `tests/codex-starter/` have been removed; do not assume a fixed runner exists.
- For generic host-maintenance work, validation should use the smallest task-relevant command or script available in the current repo state.
- For `codex-starter` development work, do not treat an isolated minimal check as sufficient when the change can cause cross-file rule drift; follow the governed development-validation rules in this file.
- If no reliable automated validation exists for the current task, record that explicitly instead of inventing coverage.

## Context And Token Discipline

- Prefer minimal complete task briefs for subagents.
- Do not default to `fork_context: true`; only use it when inherited thread context is genuinely required.
- When a subagent owns a clear write set, pass the owned files and state the intended validation boundary explicitly.
- Do not assume one repository-wide validation entrypoint exists after the legacy test-script cleanup.

## Review Timing In Host Maintenance

- This section governs `/workspace/agent-skills` host-maintenance workflow only; it is not a runtime-authority rule for `codex-starter`.
- Default `code review` / `reviewer` work starts after worker threads produce real code changes in the workspace.
- Implementation review must be evidence-based on actual diff, implementation outcome, and validation outcomes (for example tests or command checks).
- If review runs in parallel before real implementation lands, classify it as design review / solution review only, not implementation review.
- Design/solution review cannot replace the post-implementation review pass for real delivered changes.

## Validation

- The legacy `tests/codex-starter/` runner and scripts have been removed from this repository.
- For repo-maintenance work, choose the lightest validation that still produces real evidence from the current repo state.
- Acceptable validation may be syntax checks, command-level sanity checks, or targeted manual evidence when those are the only reliable options.
- If a task intentionally ships without automated validation, state that clearly together with the reason and residual risk.

## Codex-Starter Development Test Governance

- `TESTING.md` is the dedicated policy document for `codex-starter` development validation in this repository.
- The default development-validation entrypoint is `node scripts/validate-codex-starter-dev.mjs`.
- The development-validation rules apply to all contributors and must remain usable without Codex-specific runtime assumptions.
- Keep development validation layered as `contract`, `consistency`, and `meta`; do not let local minimal iteration checks replace full closeout for multi-file rule changes.
- All active development-validation checks must be registered in [standards/codex-starter-test-registry.json](/workspace/agent-skills/standards/codex-starter-test-registry.json).
- Prefer updating existing rule data or fixtures over adding new executors or standalone scripts.
- Do not add new default checks unless a stable new rule or a real escaped regression requires them.
- If no new check is added for a `codex-starter` development change, record the reason in a change summary, PR description, review note, or validation note.
- Validators must keep a maintained failing proof path; pass-only checks are not sufficient.
