# Claude Starter

Project-level Claude Code configuration starter.

This file is the runtime overview, not the full workflow policy.

## Operating Stance

- Start light.
- Prefer direct implementation for small, local work.
- Enable heavier modules only when the current task justifies them.
- Keep runtime context short; avoid repeating policy in multiple authority files.

## Roles and Modules

- `/Aide`: user-facing intake and governance entry
- `conduct`: internal delivery router and `workspace prep` owner
- `prd`: optional product clarification
- `architect`: optional system design clarification
- `plan`: optional implementation planning
- `tester` and `coder`: optional execution roles
- `/qc`: optional audit gate
- `/follow`: optional post-push follow-through
- hooks: optional runtime automation

## Sources of Truth

- `.claude/routing-policy.md`: the only routing and module-activation authority
- `.claude/project-profile.md`: current repo facts, current task state, and selected modules
- `.claude/validation-profile.json`: structured validation command facts for the repo
- `PROGRESS.md`: orchestration-only progress state
- `.claude/state/runtime-state.json`: hook-owned runtime memory when hooks are enabled

Do not duplicate routing tables across command, skill, and state files.

## User-Facing Commands

- `/Aide`
- `/qc`
- `/follow`

## Guardrails

- Start from repository facts and the user's stated goal.
- Do not ask for facts that are easy to infer from the repo.
- `workspace prep` belongs to `conduct`, not `/Aide`.
- `/qc` is opt-in by policy or explicit task need, not a default follow-up for every task.
- `/follow` applies only after push or during release/CI follow-through.
- Keep README and docs human-facing; runtime authority lives in the files above.

