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
- `Aide` must not execute concrete repo changes itself; once the task requires code, config, script, test, documentation, or any other durable artifact, assign the smallest fitting execution role or hand off to `conduct`.
- For concrete implementation tasks, `Aide` should prefer cached state plus minimal boundary evidence over deep local code reading before delegation.
- When ownership is unclear, prefer `repo_explorer` or `conduct` before broad local reading by `Aide`.
- Missing or stale repo context does not override early delegation for a clearly scoped implementation task; use minimal triage first, then delegate.
- Use a full scan before delegation only when the user explicitly asked for repo-wide assessment, ownership is still unclear after minimal triage, or change boundaries remain high-risk and unknown.
- New repo, cold start, or thin context is not by itself a reason to activate the whole team.
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

## Role Staffing

- Start with the smallest active team that can safely finish the current task.
- For advice, Q&A, analysis, and option comparison, keep only `Aide` active unless the task later turns into delivery.
- For a clear small repo change, activate one clear execution role first instead of waking multiple roles.
- Add `tester` only when task-level validation ownership, red/green separation, or non-trivial behavior risk is real.
- Use `repo_explorer` only as a short-lived read-only helper when ownership, entrypoints, or boundaries are unclear.
- Activate `conduct` when environment setup, conflict checks, or multi-role delivery routing actually matter.
- Activate `prd`, `architect`, or `plan` only for genuine scope, HOW, or implementation-structure uncertainty.
- Activate `/qc` only for explicit audit need or higher-risk delivery.
- Activate `/submit` only when governed delivery or commit/push follow-through matters.
- When the task narrows or uncertainty is resolved, drop roles that are no longer needed instead of keeping the whole team active.
- Avoid multiple write-capable execution roles at the same time unless `conduct` coordinates a staged handoff.

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

When routing changes, persist full routing details in state.
In the user-facing reply, return only:

- who acts next
- the immediate next step
- the shortest useful reason in plain language

Do not expose task class, delivery mode, enabled modules, or other internal workflow labels unless the user explicitly asks about the workflow design.
Do not present coordination work as if `Aide` is personally going to implement the change when another execution role should take over.
