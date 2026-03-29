# Routing Policy

This file is the routing authority.

`Aide` owns outer coordination: user-facing intake, governance, and closeout.
`conduct` is the technical-manager layer for delivery.
Once a task needs durable artifacts or execution ownership, it must enter `conduct` before any execution role is activated.
`.codex/state/task-context.json` records current route and checkpoints.

`/Aide`, `/qc`, and `/submit` are route aliases only when the client supports custom slash commands.
Otherwise, plain-language intent should map to the same routes.

## Core Rules

- Prefer the lightest workflow that can safely finish the task.
- Keep `lightweight` as the default for small, local, low-risk work.
- Keep discussion, Q&A, option comparison, and non-delivery analysis in `Aide`.
- `Aide` must not directly manage `coder`, `tester`, `/qc`, or `/submit`.
- For any concrete repo change or durable artifact workflow, route to `conduct` first.
- `conduct` owns execution entry, precondition checks, repository understanding depth, environment readiness, and staged handoff management.
- Treat repository exploration and environment setup as actions/capabilities, not primary role expansion points.
- `plan` output is a `任务实施说明` (`Task Implementation Brief`) and is the only execution input for `coder` and `tester`.
- If `coder` is active, downstream `tester` handoff is mandatory before settlement or `/submit`.
- `/qc` is optional by risk or explicit audit need, and cannot replace `tester`.
- `/submit` is the governed delivery step after required validation gates.
- Main-thread closeout cannot substitute for a missing required `tester` handoff once `coder` has participated.

## Delivery Chain

Default staged chain for execution work:

1. `Aide`: outer coordination and decision to enter delivery routing.
2. `conduct`: execution entry, preconditions, conflict scan, and chain design.
3. optional `prd`: product-manager clarification for unstable WHAT/WHY/MVP.
4. optional `architect`: architect clarification for unstable system-level HOW.
5. `plan`: produce or refresh `任务实施说明` (`Task Implementation Brief`).
6. `coder`: implement against the latest `任务实施说明`.
7. `tester`: validate against the same `任务实施说明`.
8. optional `/qc`: independent audit when risk/policy requires.
9. optional `/submit`: governed commit/push/follow-through.

Do not skip step 5 when `coder` or `tester` is active.

## Delegation Context And Fork Policy

- Subagent delegation should default to token-efficient execution.
- Do not default to `fork_context: true`.
- For bounded tasks with clear goal and write set, prefer `fork_context: false` plus a minimal but complete assignment brief.
- Use `fork_context: true` only when the subagent genuinely needs full conversation state and the main thread's immediate next step depends on that inherited context.

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
- escalate only when the task turns into delivery workflow, validation ownership, or artifact output

## Upgrade Triggers

- enter `conduct` when the task needs any execution workflow or durable artifact handoff
- enable `prd` when scope, MVP, or success criteria are unstable
- enable `architect` when interfaces, boundaries, or integration design are unstable
- enable `plan` when implementation guidance is needed; if `coder`/`tester` is active, `plan` is mandatory
- enable `product_assistant` when the primary deliverable is a non-code artifact
- enable `coder` for implementation ownership, followed by required downstream `tester`
- enable `long-running` mode and `PROGRESS.md` when work is multi-step, cross-session, blocked, or release-shaped
- enable `/qc` when risk is high, the user asks for audit, or release confidence needs it
- enable `/submit` when governed commit/push or post-push follow-through matters

Do not upgrade discussion-only turns into execution routes merely because the topic is technical.

## Role Staffing

- Start with the smallest active team that can safely finish the current task.
- Keep `Aide` alone for lightweight advice, Q&A, analysis, and option comparison.
- For any execution route, activate `conduct` first, then activate downstream roles through `conduct`.
- Use repository exploration as a short-lived action inside routing/execution when ownership, entrypoints, or boundaries are unclear.
- Keep one focused write-capable execution role at a time unless `conduct` explicitly stages a safe handoff.
- If uncertainty resolves, drop unnecessary roles immediately.

## Environment Setup

- default: `skip`
- choose `current-workspace` for small readiness checks or bootstrap steps
- choose `isolated-workspace` only when conflict risk or policy makes isolation useful

Environment setup decisions and preparation belong to `conduct`.

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

1. required `tester` handoff in the active execution chain is complete
2. the current task enables QC through `qc_policy` or enabled modules
3. the handoff is not blocked and not just a progress ping

## Submit Gate

Queue or remind `/submit` when:

1. required `tester` handoff completed and QC is disabled
2. QC passed after required `tester` handoff, or the task settled with QC already satisfied
3. delivery policy enables governed submit for the current task

## Route Output

When routing changes, persist full routing details in state.
In user-facing replies, return only:

- who acts next
- the immediate next step
- the shortest useful reason in plain language

Do not expose internal workflow labels unless the user explicitly asks.
Do not present coordination work as if `Aide` is personally going to implement execution tasks.
