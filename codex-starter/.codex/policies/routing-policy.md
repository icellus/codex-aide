# Routing Policy

This file is the routing authority.

`Aide` role definition and triage semantics are owned by `.codex/skills/aide/SKILL.md`.
`.codex/state/task-context.json` records current route and checkpoints.

Named route labels such as `Aide`, `qc`, and `submit` are optional affordances.
Plain-language intent should map to the same routes.

## Routing Topology

- entry owner: `Aide`
- first-hop targets from `Aide`: `product_manager`, `technical_manager`, `product_assistant`
- product-definition line:
  - `skip`: `Aide -> product_manager -> technical_manager`
  - `product`: `Aide -> product_manager -> architect -> technical_manager`
- technical-delivery line: `Aide -> technical_manager -> coder -> tester -> optional /qc -> optional /submit`
- non-code delivery line: `Aide -> product_assistant -> Aide`

## Core Rules

- Prefer the lightest workflow that can safely finish the task.
- Keep `lightweight` as the default for small, local, low-risk work.
- Keep discussion, Q&A, option comparison, and recommendation-only analysis in `Aide`.
- `Aide` selects first hop by deliverable type and scope stability.
- `product_manager` is the product-definition owner; it does not route back to `Aide`.
- In the product-definition line:
  - `skip` outcome continues to `technical_manager`.
  - `product` outcome continues to `architect`, then `technical_manager`.
- `technical_manager` owns the technical-delivery line only.
- If `technical_manager` detects unresolved product scope or non-technical ownership mismatch, escalate back to `Aide` for re-triage.
- `technical_manager` must not directly route to `product_manager`.
- `product_assistant` receives non-code delivery work from `Aide` and returns results to `Aide`.
- `product_assistant` should not auto-enter `/submit`; only explicit user intent enables governed submit for non-code work.
- `technical_manager` produces and refreshes `任务实施说明`, which is the execution input for `coder` and `tester`.
- If `coder` or `tester` lacks readable `任务实施说明`, they must return `blocked` to `technical_manager`.
- If `coder` is active, downstream `tester` handoff is mandatory before settlement or `/submit`.
- `coder` / `tester` / `qc` report only to `technical_manager` in the technical-delivery line.
- After required `tester` handoff in coder-involved work, `technical_manager` decides whether `/qc` is needed.
- `/qc` is optional by risk or explicit audit need, and cannot replace `tester`.
- `/submit` is the governed delivery step after required validation gates.
- Main-thread closeout cannot substitute for a missing required `tester` handoff once `coder` has participated.
- blocked handoff from missing `任务实施说明` must stop tester/qc/submit continuation until `technical_manager` resolves it.
- if missing brief requires user clarification, route through `technical_manager -> Aide -> user`.
- for long-running technical tasks, `technical_manager` owns `.codex/progress/**` writes and keeps `history` + `current.md` synchronized.
- progress trigger events are fixed: `new-task`, `brief-refresh`, `handoff-switch`, `blocked`, `resume`, `completed`.

## Delivery Chains

### Product-Definition Line

1. `Aide`: intake, triage, and handoff brief.
2. `product_manager`: clarify WHAT/WHY/MVP and choose `skip` or `product`.
3. if outcome is `skip`, hand off to `technical_manager`.
4. if outcome is `product`, hand off to `architect`.
5. `technical_manager`: enter technical-delivery line after `product_manager` `skip` or `architect` output.

### Technical-Delivery Line

1. `Aide`, `product_manager` `skip`, or upstream `architect` output enters `technical_manager`.
2. `technical_manager`: preconditions, conflict scan, and `任务实施说明`.
3. `coder`: implement against the latest `任务实施说明`.
4. `tester`: validate against the same `任务实施说明`.
5. optional `/qc`: independent audit when risk/policy requires.
6. optional `/submit`: governed commit/push/follow-through.

Do not skip `任务实施说明` production when `coder` or `tester` is active.

### Non-Code Delivery Line

1. `Aide`: intake, triage, and non-code brief.
2. `product_assistant`: produce/update non-code artifacts.
3. `Aide`: user-facing integration and closeout.

For this line, `/submit` is opt-in only via explicit user request.

## Delegation Context And Fork Policy

- Subagent delegation should default to token-efficient execution.
- Do not default to `fork_context: true`.
- For bounded tasks with clear goal and write set, prefer `fork_context: false` plus a minimal but complete assignment brief.
- Use `fork_context: true` only when the subagent genuinely needs full conversation state and the main thread's immediate next step depends on that inherited context.

## Default Modes

Delivery mode is selected by work shape, not by task label alone.
First-hop routing still follows the topology and upgrade triggers above.

Choose `lightweight` when:

- the turn is discussion, Q&A, exploration, or recommendation-only work
- the work is local, low-risk, and can finish without long-running coordination
- no durable progress tracking is needed

Choose `standard` when:

- the task enters routed delivery but does not need long-running tracking
- the work needs durable handoff, technical planning, or non-trivial coordination
- the task is more than a one-shot local answer, but still fits in one active working stretch

Choose `long-running` when:

- the task is multi-step, cross-session, blocked, or release-shaped
- progress history and current snapshot must stay synchronized
- handoff checkpoints are likely to span more than one execution cycle

For `exploration`, `analysis`, and discussion-shaped work with no durable artifact:

- default owner: `Aide`
- default state behavior: no durable state write
- escalate only when the task turns into delivery workflow, validation ownership, or artifact output

## Upgrade Triggers

- enable `product_manager` when scope, MVP, or success criteria are unstable
- if `product_manager` outcome is `skip`, continue to `technical_manager`
- if `product_manager` outcome is `product`, require `architect` as the next step, then `technical_manager`
- enter `technical_manager` when the task needs code/config/runtime changes, implementation ownership, task-level validation ownership, durable technical handoff, or governed delivery
- if `technical_manager` cannot proceed because ownership is not technical or product scope is still unstable, escalate to `Aide` for re-triage
- if interfaces, boundaries, or integration design are unstable inside the technical-delivery line, `technical_manager` may enable `architect`
- require `technical_manager` to produce or refresh `任务实施说明` before any `coder`/`tester` work
- enable `product_assistant` when the primary deliverable is a non-code artifact
- enable `coder` for implementation ownership, followed by required downstream `tester`
- enable `long-running` mode and `.codex/progress/active/<task-id>/current.md` when work is multi-step, cross-session, blocked, or release-shaped
- during long-running mode, on `new-task`, `brief-refresh`, `handoff-switch`, `blocked`, `resume`, and `completed`, append one history entry and refresh `current.md`
- when `completed` is emitted, archive the task record to `.codex/progress/archive/<task-id>/...` after the final sync
- enable `/qc` when risk is high, the user asks for audit, or release confidence needs it
- enable `/submit` when governed commit/push or post-push follow-through matters

Do not upgrade discussion-only turns into execution routes merely because the topic is technical.

## Role Staffing

- Start with the smallest active team that can safely finish the current task.
- Keep `Aide` alone for lightweight advice, Q&A, analysis, and option comparison.
- For product-definition routing, activate `product_manager` first.
- For technical-delivery routing, activate `technical_manager` first, then activate downstream technical roles through `technical_manager`.
- For non-code routing, activate `product_assistant` directly from `Aide`.
- Use repository exploration as a short-lived action inside routing/execution when ownership, entrypoints, or boundaries are unclear.
- Keep one focused write-capable execution role at a time unless `technical_manager` explicitly stages a safe handoff.
- If uncertainty resolves, drop unnecessary roles immediately.

## Environment Setup

- default: `skip`
- choose `current-workspace` for small readiness checks or bootstrap steps
- choose `isolated-workspace` only when conflict risk or policy makes isolation useful

Environment setup decisions and preparation belong to `technical_manager`.

## Durable State

- `.codex/state/task-context.json`: hot task state
- `.codex/policies/delivery-policy.json`: commit, push, notification, CI, release, and fallback policy
- `.codex/state/task-registry.json`: cold task registry for current and unfinished task management
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/policies/validation-profile.json`: validation commands and constraints
- `.codex/progress/active/<task-id>/current.md`: primary long-running snapshot per active task
- `.codex/progress/active/<task-id>/history/<timestamp>-<slug>.md`: append-only long-running progress events
- `.codex/progress/archive/<task-id>/...`: archived progress records for completed/closed tasks
- `PROGRESS.md`: legacy optional note only, never the primary runtime progress source
- `.codex/state/runtime-state.json`: reminders, QC follow-up, and runtime memory
- `.codex/context/project-profile.md`: human summary only

## QC Gate

Queue or remind `/qc` only when:

1. required `tester` handoff in the active execution chain is complete
2. the current task enables QC through `qc_policy` or enabled modules
3. `technical_manager` keeps QC active for the current task chain
4. the handoff is not blocked and not just a progress ping

## Submit Gate

Queue or remind `/submit` when:

1. required `tester` handoff completed and QC is disabled
2. QC passed after required `tester` handoff, or the task settled with QC already satisfied
3. delivery policy enables governed submit for the current task
4. for non-code delivery, only when the user explicitly requests governed submit

## Route Output

When routing changes, persist full routing details in state.
In user-facing replies, return only:

- who acts next
- the immediate next step
- the shortest useful reason in plain language

Do not expose internal workflow labels unless the user explicitly asks.
Do not present coordination work as if `Aide` is personally going to implement execution tasks.
