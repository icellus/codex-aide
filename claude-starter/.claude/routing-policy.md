# Routing Policy

This file is the single routing and module-activation authority for the starter.

`/Aide` uses it during intake.
`conduct` uses it during delivery routing.
`project-profile.md` records the current choice; it does not redefine policy.

## Core Rules

- Prefer the lightest workflow that can safely finish the task.
- Keep `direct` as the default for small, local, low-risk work.
- Enable durable artifacts only when coordination or risk requires them.
- `workspace prep` belongs to `conduct`.
- `/qc` is optional unless the current task explicitly enables it.
- `/follow` is only relevant after push, promotion, or release follow-through.

## Delivery Modes

| Task class | Default mode | Typical baseline |
| --- | --- | --- |
| `bugfix` | `direct` | direct implementation plus focused validation |
| `feature` | `plan-driven` | one implementation plan unless the feature is truly tiny |
| `refactor` | `direct` | upgrade only if contracts, scope, or coordination risk grows |
| `release` | `orchestrated` | checkpoints, QC, and optional follow-through |
| `exploration` | `direct` | inspection, notes, and scope clarification only |

## Upgrade Triggers

Enable modules only when one of these is true:

- `prd`: MVP, scope, or success criteria are unstable
- `architect`: system boundaries, interfaces, or integration design are unstable
- `plan`: implementation guidance or acceptance boundaries need a durable artifact
- `tester` and `coder`: explicit red/green separation or handoff value is real
- orchestration and `PROGRESS.md`: work is multi-step, cross-session, blocked, or release-shaped
- `/qc`: task risk is high, the user asks for an audit, or release confidence requires it
- `/follow`: code is already pushed and CI, deployment, or release follow-through matters

## Workspace Prep

Run `workspace prep` only when active implementation needs it.

Typical reasons to run it:

- isolated branch or worktree is genuinely useful
- dependencies or local services must be prepared before coding or testing
- readiness of the current workspace is unknown

Typical reasons to skip it:

- small bugfixes
- docs, prompt, or config-only edits
- already-ready workspaces
- intake, governance, planning, or release coordination without active implementation

## Durable State

- `project-profile.md`: always available, but only for current facts and current task state
- `.claude/validation-profile.json`: structured validation commands and constraints
- `PROGRESS.md`: only when orchestration is active
- `.claude/state/runtime-state.json`: only when hooks are enabled

## QC Gate

Auto QC may be suggested only when all are true:

1. a `tester` or `coder` handoff completed
2. the current task enables `/qc` through `QC policy` or enabled modules
3. the handoff is not blocked and is not just a progress ping

If QC is disabled for the current task, do not queue or remind `/qc`.

## Output Expectations

When routing changes, `/Aide` or `conduct` should state:

- selected task class
- selected delivery mode
- enabled modules
- the shortest useful reason for the choice

