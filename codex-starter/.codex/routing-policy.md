# Routing Policy

This file is the routing authority.

`/Aide` selects or refreshes the route.
`conduct` applies it to active delivery.
`.codex/state/task-context.json` records the current choice.

## Core Rules

- Prefer the lightest workflow that can safely finish the task.
- Keep `direct` as the default for small, local, low-risk work.
- Add durable artifacts only when coordination, uncertainty, or risk requires them.
- When execution roles are active, prefer real subagents when delegation is available.
- `workspace prep` belongs to `conduct`.
- `/qc` is optional unless the task or policy explicitly enables it.
- `/follow` matters only after push, promotion, or release follow-through.

## Default Modes

- `bugfix` -> `direct`
- `feature` -> `plan-driven`
- `refactor` -> `direct`
- `release` -> `orchestrated`
- `exploration` -> `direct`

## Upgrade Triggers

- enable `prd` when scope, MVP, or success criteria are unstable
- enable `architect` when interfaces, boundaries, or integration design are unstable
- enable `plan` when implementation guidance needs a durable artifact
- enable `tester` and `coder` when explicit red/green separation or handoff value is real
- enable orchestration and `PROGRESS.md` when work is multi-step, cross-session, blocked, or release-shaped
- enable `/qc` when risk is high, the user asks for an audit, or release confidence needs it
- enable `/follow` when pushed code, CI, deployment, or release follow-through matters

## Workspace Prep

- default: `skip`
- choose `current-workspace` for small readiness checks or bootstrap steps
- choose `isolated-workspace` only when conflict risk or policy makes isolation useful

## Durable State

- `.codex/state/task-context.json`: hot task state
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: validation commands and constraints
- `PROGRESS.md`: orchestrated checkpoints only
- `.codex/state/runtime-state.json`: reminders, QC follow-up, and runtime memory
- `.codex/project-profile.md`: human summary only

## QC Gate

Queue or remind `/qc` only when:

1. a `tester` or `coder` handoff completed
2. the current task enables QC through `qc_policy` or enabled modules
3. the handoff is not blocked and not just a progress ping

## Route Output

When routing changes, return only:

- selected task class
- selected delivery mode
- enabled modules if they changed
- the shortest useful reason
