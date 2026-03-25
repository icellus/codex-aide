# Codex Starter

Project-level Codex workflow starter.

This file is the runtime overview, not the full workflow policy.

## Operating Stance

- Start light.
- Prefer direct implementation for small, local work.
- Enable heavier modules only when the current task justifies them.
- Keep the main agent focused on intake, routing, governance, and result integration.
- Prefer real subagents for `tester`, `coder`, `/qc`, and `/follow` when the runtime supports delegation.
- Keep runtime context short; avoid repeating policy in multiple authority files.

## Command Protocol

- Inputs starting with `/Aide` must load `.agents/skills/aide/SKILL.md` before acting.
- Inputs starting with `/qc` must load `.agents/skills/qc/SKILL.md` before acting.
- Inputs starting with `/follow` must load `.agents/skills/follow/SKILL.md` before acting.
- Inputs without a slash command still follow `.codex/project-profile.md`, `.codex/routing-policy.md`, and `.codex/validation-profile.json`.

## Skills and Subagents

- `/Aide`: user-facing intake and governance entry
- `conduct`: internal delivery router and `workspace prep` owner
- `prd`: optional product clarification
- `architect`: optional system design clarification
- `plan`: optional implementation planning
- `auto_qc`: internal QC follow-up helper for eligible tester or coder completions
- `tester` and `coder`: write-capable execution subagents defined in `.codex/agents/*.toml`
- `repo_explorer`: read-only scan and evidence-gathering subagent
- `qc_reviewer`: read-only audit subagent used by `/qc`
- `follow_worker`: post-push or CI follow-through subagent used by `/follow`
- `/qc`: optional audit gate
- `/follow`: optional post-push follow-through
- `.agents/skills/*/SKILL.md`: official repo-local skill layout
- `.codex/scripts/*.mjs`: optional runtime helpers for reminders, git validation, and runtime-state sync
- `.codex/config.toml`: subagent concurrency defaults for the starter

## Sources of Truth

- `.codex/routing-policy.md`: the only routing and module-activation authority
- `.codex/project-profile.md`: current repo facts, current task state, and selected modules
- `.codex/validation-profile.json`: structured validation command facts for the repo
- `PROGRESS.md`: orchestration-only progress state
- `.codex/state/runtime-state.json`: runtime memory written on demand by `.codex/scripts/*.mjs`

Do not duplicate routing tables across command, skill, and state files.

## User-Facing Commands

- `/Aide`
- `/qc`
- `/follow`

## Runtime Helper Policy

- Use `node .codex/scripts/session-context.mjs` when starting or resuming routed work if runtime reminders would help.
- After a durable `tester`, `coder`, `qc_reviewer`, or `follow_worker` result, sync `.codex/state/runtime-state.json` through `node .codex/scripts/runtime-state.mjs`.
- Before broad git staging, apply the `.codex/scripts/validate-git.mjs` guard or the same deny policy manually.
- Prefer the Codex-native runtime payload shape:
  - `{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}`
  - `{"event":"session_end","message":"...","cwd":"..."}`

## Guardrails

- Start from repository facts and the user's stated goal.
- Do not ask for facts that are easy to infer from the repo.
- `workspace prep` belongs to `conduct`, not `/Aide`.
- `/qc` is opt-in by policy or explicit task need, not a default follow-up for every task.
- `/follow` applies only after push or during release/CI follow-through.
- Only the main agent or runtime scripts should write `.codex/project-profile.md`, `.codex/validation-profile.json`, `PROGRESS.md`, or `.codex/state/runtime-state.json`.
- Write-capable subagents use an exclusive write window; do not run concurrent writing roles.
- Keep README and docs human-facing; runtime authority lives in the files above.
