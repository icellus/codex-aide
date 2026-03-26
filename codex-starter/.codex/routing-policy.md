# Routing Policy

This file is the routing authority.

`Aide` selects or refreshes the route.
`conduct` applies it to active delivery.
`.codex/state/task-context.json` records the current choice.

`/Aide`, `/qc`, and `/submit` are route aliases only when the client supports custom slash commands.
Otherwise, plain-language intent should map to the same routes.

## Core Rules

- Prefer the lightest workflow that can safely finish the task.
- Keep `lightweight` as the default for small, local, low-risk work.
- Add durable artifacts only when coordination, uncertainty, or risk requires them.
- Keep discussion, Q&A, and option-comparison work inside `Aide` when the user is not asking for a durable artifact or an execution workflow.
- When execution roles are active, prefer real subagents when delegation is available.
- Route directly to `product_assistant` when the primary deliverable is a non-code artifact.
- `environment setup` belongs to `conduct`.
- `/qc` is optional unless the task or policy explicitly enables it.
- `/submit` is the governed delivery step after local completion or QC pass when commit, push, or post-push follow-through matters.

## Default Modes

- `bugfix` -> `lightweight`
- `feature` -> `standard`
- `product` -> `lightweight`
- `refactor` -> `lightweight`
- `release` -> `long-running`
- `exploration` -> `lightweight`

For `exploration`, `analysis`, and discussion-shaped work with no durable artifact:

- default owner: `Aide`
- default state behavior: no durable state write
- escalate only when the task turns into implementation, validation ownership, or artifact delivery

## Upgrade Triggers

- enable `prd` when scope, MVP, or success criteria are unstable
- enable `architect` when interfaces, boundaries, or integration design are unstable
- enable `plan` when implementation guidance needs a durable artifact
- enable `product_assistant` when the primary deliverable is a non-code artifact
- enable `tester` and `coder` when explicit red/green separation or handoff value is real
- enable `long-running` mode and `PROGRESS.md` when work is multi-step, cross-session, blocked, or release-shaped
- enable `/qc` when risk is high, the user asks for an audit, or release confidence needs it
- enable `/submit` when the task should finish with governed commit, push, or optional post-push delivery follow-through

Do not upgrade a lightweight discussion into an execution route only because the topic is technical or complex.
Upgrade only when the expected output changes from advice to a concrete deliverable.

## Environment Setup

- default: `skip`
- choose `current-workspace` for small readiness checks or bootstrap steps
- choose `isolated-workspace` only when conflict risk or policy makes isolation useful

## Durable State

- `.codex/state/task-context.json`: hot task state
- `.codex/delivery-policy.json`: commit, push, notification, CI, release, and fallback policy
- `.codex/state/task-registry.json`: cold task registry for current and unfinished task management
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: validation commands and constraints
- `PROGRESS.md`: long-running checkpoints only
- `.codex/state/runtime-state.json`: reminders, QC follow-up, and runtime memory
- `.codex/project-profile.md`: human summary only

## QC Gate

Queue or remind `/qc` only when:

1. a `tester` or `coder` handoff completed
2. the current task enables QC through `qc_policy` or enabled modules
3. the handoff is not blocked and not just a progress ping

## Submit Gate

Queue or remind `/submit` when:

1. a `coder` handoff completed and QC is disabled
2. QC passed after a `coder` handoff, or the task settled with QC already satisfied
3. the delivery policy enables governed submit for the current task

## Route Output

When routing changes, return only:

- selected task class
- selected delivery mode
- enabled modules if they changed
- the shortest useful reason
