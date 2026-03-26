# Codex Starter

Project-level Codex workflow starter.

## Default Stance

- Start light.
- Default to direct, local implementation.
- Upgrade only when scope, risk, or coordination require it.
- Keep the main agent on intake, routing, governance, and result integration.
- Prefer real subagents for `tester`, `coder`, `/qc`, and `/follow` when delegation adds value.
- Keep hot runtime context short. Human docs explain; runtime files decide.

## Command Map

- `/Aide` -> load `.agents/skills/aide/SKILL.md`
- `/qc` -> load `.agents/skills/qc/SKILL.md`
- `/follow` -> load `.agents/skills/follow/SKILL.md`
- no slash command -> use `.codex/state/task-context.json`, `.codex/routing-policy.md`, and `.codex/validation-profile.json`

## Runtime Files

- `.codex/routing-policy.md`: routing and module activation authority
- `.codex/state/task-context.json`: hot task state and collaboration preferences
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: repository validation baseline and constraints
- `PROGRESS.md`: orchestrated checkpoint tracking only
- `.codex/state/runtime-state.json`: runtime memory, reminders, and QC follow-up
- `.codex/project-profile.md`: short human summary, not the hot path

## Runtime Hooks

- `node .codex/scripts/session-context.mjs`
- `node .codex/scripts/runtime-state.mjs`
- `node .codex/scripts/validate-git.mjs`
- prefer `{"event":"subagent_result",...}` and `{"event":"session_end",...}` payloads

## Guardrails

- infer repo facts before asking
- `workspace prep` belongs to `conduct`
- `/qc` is opt-in per task need or policy
- `/follow` applies only after push, CI, or release follow-through
- only the main agent or runtime scripts write `.codex/state/*.json`, `.codex/project-profile.md`, or `PROGRESS.md`
- allow only one write-capable subagent at a time
- do not duplicate routing tables across files
