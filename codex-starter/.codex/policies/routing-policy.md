# Routing Policy

This file is the routing authority.

`Aide` role definition and triage semantics are owned by `.codex/skills/aide/SKILL.md`.
`.codex/state/task-context.json` records current route, lifecycle status, and checkpoints.

Named route labels such as `Aide`, `qc`, and `submit` are optional affordances.
Plain-language intent should map to the same routes.

## Routing Topology

- entry owner: `Aide`
- first-hop targets from `Aide`: `product_manager`, `technical_manager`, `product_assistant`
- product-definition line:
  - `skip`: `Aide -> product_manager -> technical_manager`
  - `product`: `Aide -> product_manager -> architect -> technical_manager`
- technical-delivery line: `Aide -> technical_manager -> coder -> tester -> optional qc -> optional submit`
- non-code delivery line: `Aide -> product_assistant -> Aide`

## Core Rules

- Prefer the lightest workflow that can safely finish the task.
- Keep `lightweight` as the default for small, local, low-risk work.
- Keep discussion, Q&A, option comparison, and recommendation-only analysis in `Aide`.
- `Aide` selects first hop by deliverable type and scope stability.
- `Aide` remains the user-facing integrator even when hot-task follow-up ownership is sticky to another role line.
- `product_manager` is the product-definition owner; normal downstream handoff stays on the product-definition line, while blocked user clarification returns through `Aide`.
- `architect` may only be activated by `product_manager` after a `product` outcome in the product-definition line.
- In the product-definition line:
  - `skip` outcome continues to `technical_manager`.
  - `product` outcome continues to `architect`, then `technical_manager`.
- `technical_manager` owns the technical-delivery line only.
- If `technical_manager` detects unresolved product scope or non-technical ownership mismatch, escalate back to `Aide` for re-triage.
- `technical_manager` must not directly route to `product_manager` or `architect`.
- `product_assistant` receives non-code delivery work from `Aide` and returns results to `Aide`.
- `product_assistant` should not auto-enter the submit path; only explicit user intent enables governed submit for non-code work.
- if `.codex/state/task-context.json` marks `sticky_owner=technical_manager`, same-task source-code follow-up should stay on the technical-delivery line by default even when phrased as Q&A.
- `Aide` may answer same-task explanation, status, summary, and user-decision turns directly when they introduce no new durable execution fact.
- if a same-task follow-up changes task lifecycle truth, execution constraints, validation boundary, implementation input, or long-running progress truth, `Aide` must persist the update or route through `technical_manager` before closeout.
- sticky owner means role-line continuity, not a requirement to keep the same subagent process alive across turns.
- `technical_manager` produces and refreshes the `Implementation Brief`, which is the execution input for `coder` and `tester`.
- If `coder` or `tester` lacks a readable `Implementation Brief`, they must return `blocked` to `technical_manager`.
- If `coder` is active, downstream `tester` handoff is mandatory before settlement or submit.
- `coder` / `tester` / `qc` report only to `technical_manager` in the technical-delivery line.
- `coder` and `tester` completion evidence must come from delegated subagent results; main-thread role emulation does not satisfy the route contract.
- `technical_manager` may prepare or adjust repository-local configuration needed for delivery, but must not write delivery code or task-level tests.
- on first contact, if `.codex/state/repo-context.json` is missing, or `.codex/policies/validation-profile.json` is missing or still `not-set`, `Aide` runs an independent `technical_manager` repository scan and waits before normal routing continues.
- if the user indicates the repository was initialized, reinitialized, replaced, or reset, `Aide` reruns that scan and replaces `.codex/state/repo-context.json` plus `.codex/policies/validation-profile.json`.
- repository scan completes only when `technical_manager` returns `status=complete` with both `repo_context` and `validation_profile`.
- `.codex/policies/validation-profile.json` stays the single repository validation-baseline structure.
- the first repository scan writes `.codex/policies/validation-profile.json` directly and moves `status` from `not-set` to `draft`.
- `tester` completes task-level validation against repository reality, reports unfinished checks with reasons, and sends baseline refresh feedback to `technical_manager` only for reusable repository-level gaps in `.codex/policies/validation-profile.json`.
- `technical_manager` evaluates tester baseline refresh feedback and decides whether a refresh proposal should be returned to `Aide` against the current `.codex/policies/validation-profile.json` structure.
- `Aide` reviews `technical_manager` refresh proposals and writes approved repository-baseline updates to `.codex/policies/validation-profile.json`.
- After required `tester` handoff in coder-involved work, `technical_manager` decides whether `qc` is needed.
- `qc` is optional by risk or explicit audit need, and cannot replace `tester`.
- `submit` is the governed delivery step after required validation gates.
- `submit_policy=manual` suppresses automatic submit queueing only; explicit user commit/push requests still route through `submit`.
- Main-thread closeout cannot substitute for a missing required `tester` handoff once `coder` has participated.
- blocked handoff from a missing `Implementation Brief` must stop tester, qc, and submit continuation until `technical_manager` resolves it.
- if missing brief requires user clarification, route through `technical_manager -> Aide -> user`.
- for long-running technical tasks, `technical_manager` owns `.codex/progress/**` writes and keeps `history` + `current.md` synchronized.
- progress trigger events are fixed: `new-task`, `brief-refresh`, `handoff-switch`, `blocked`, `resume`, `completed`.

## Task Lifecycle

- `.codex/state/task-context.json` is the single hot-task lifecycle record.
- raw transcript `task_started/task_complete` events are turn-scoped host events, not the hot-task lifecycle truth.
- `.codex/logs/task-lifecycle/*.jsonl` records normalized per-turn lifecycle sync decisions; it complements but does not replace `.codex/state/task-context.json`.
- `sticky_owner` records which role line should handle same-task follow-up by default.
- Terminal task statuses are `completed` and `cancelled` only.
- `idle` means no tracked routed task is currently open.
- `active` means the current owner is working the task without an unresolved external dependency.
- `handoff` means the next action belongs to another enabled role in the current chain.
- `blocked` means repository, environment, or execution constraints prevent progress without internal resolution.
- `waiting_user` means the next move depends on explicit user clarification or decision.
- `paused` means the task was explicitly paused and should remain resumable outside the hot slot.
- Do not infer completion from silence, missing follow-up, or session end.
- if the hot task could not be correctly recovered from `.codex/state/task-context.json` and `.codex/progress/**` without the current turn, do not treat that turn as explanation-only.
- when a routed turn returns a Structured Result with `task_update.sync=true`, the Stop hook should sync that turn into the hot task state before any interruption fallback.
- If a session stops while task status is `active`, `handoff`, or `blocked`, runtime hooks should record an interruption timestamp instead of changing task status.
- Starting a new hot task while another non-terminal task is still open should retire the previous hot task into `recent_tasks` by default as `paused`.
- Use explicit retirement only when the previous hot task should instead be recorded as `completed` or `cancelled`.
- `.codex/state/task-context.json` may keep a small bounded `recent_tasks` parking list for explicitly retired hot tasks; this is not a full historical registry.
- `node .codex/scripts/context/task-reconcile.mjs` is the startup helper for interrupted hot-task review. It may suggest resume or settle, but must not auto-complete tasks.
- Use `completed` only after the active route satisfies its required delivery and validation gates, or the requested non-code output is truly delivered.
- Do not infer `completed` from a successful push alone when the hot task still has `waiting_user`, `waiting_on!=none`, or a real remaining `next_step`.
- Use `cancelled` only for explicit abandonment, supersession, or user cancellation.

## Delivery Chains

### Product-Definition Line

1. `Aide`: intake, triage, and handoff brief.
2. `product_manager`: clarify WHAT/WHY/MVP and choose `skip` or `product`.
3. if outcome is `skip`, hand off to `technical_manager`.
4. if outcome is `product`, hand off to `architect`.
5. `technical_manager`: enter technical-delivery line after `product_manager` `skip` or `architect` output.

### Repository Initialization Scan

1. `Aide`: on first contact if `.codex/state/repo-context.json` is missing, or `.codex/policies/validation-profile.json` is missing or still `not-set`, or if the user indicates repository initialization/reset semantics, launch the independent repository scan and wait.
2. `technical_manager`: run the low-context repository scan and return `status` plus `repo_context` and `validation_profile`.
3. `Aide`: treat the scan as complete only when `status=complete` and both artifacts exist, then immediately write `.codex/state/repo-context.json` through `node .codex/scripts/context/repo-context.mjs` and `.codex/policies/validation-profile.json`.

### Technical-Delivery Line

1. `Aide`, `product_manager` `skip`, or upstream `architect` output enters `technical_manager`.
2. `technical_manager`: preconditions, conflict scan, and the `Implementation Brief`.
3. if repository initialization artifacts are missing, run the independent repository scan before coder/tester work begins.
4. `coder`: implement against the latest `Implementation Brief`.
5. `tester`: validate against the same `Implementation Brief`.
6. if tester reports baseline refresh feedback, `technical_manager` decides whether to return a refresh proposal to `Aide`.
7. optional `qc`: independent audit when risk/policy requires.
8. optional `submit`: governed commit/push/follow-through.

Do not skip `Implementation Brief` production when `coder` or `tester` is active.

### Non-Code Delivery Line

1. `Aide`: intake, triage, and non-code brief.
2. `product_assistant`: produce/update non-code artifacts.
3. `Aide`: user-facing integration and closeout.

For this line, `submit` is opt-in only via explicit user request.

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
- default coordination behavior: do not update durable coordination files
- escalate only when the task turns into delivery workflow, validation ownership, or artifact output

## Upgrade Triggers

- enable `product_manager` when scope, MVP, or success criteria are unstable
- if `product_manager` outcome is `skip`, continue to `technical_manager`
- if `product_manager` outcome is `product`, require `architect` as the next step, then `technical_manager`
- enter `technical_manager` when the task needs code/config/runtime changes, implementation ownership, task-level validation ownership, durable technical handoff, or governed delivery
- if `technical_manager` cannot proceed because ownership is not technical or product scope is still unstable, escalate to `Aide` for re-triage
- if interfaces, boundaries, or integration design are unstable inside the technical-delivery line, `technical_manager` must escalate to `Aide` for re-triage instead of routing directly to `architect`
- require `technical_manager` to produce or refresh the `Implementation Brief` before any `coder`/`tester` work
- enable `product_assistant` when the primary deliverable is a non-code artifact
- enable `coder` for implementation ownership, followed by required downstream `tester`
- enable `long-running` mode and `.codex/progress/active/<task-slug>/current.md` when work is multi-step, cross-session, blocked, or release-shaped
- during long-running mode, on state changes that materially update task progress, append one history entry and refresh `current.md` in the same update cycle
- at minimum, treat `new-task`, `brief-refresh`, `handoff-switch`, `blocked`, `waiting-user`, `resume`, `paused`, `completed`, and `cancelled` as long-running sync events
- when `completed` or `cancelled` is emitted, archive the task record to `.codex/progress/archive/<task-slug>/...` after the final sync
- enable `qc` when risk is high, the user asks for audit, or release confidence needs it
- enable `submit` when governed commit/push or post-push follow-through matters

Do not upgrade discussion-only turns into execution routes merely because the topic is technical.

## Role Staffing

- Start with the smallest active team that can safely finish the current task.
- Keep `Aide` alone for lightweight advice, Q&A, analysis, and option comparison.
- For product-definition routing, activate `product_manager` first.
- For technical-delivery routing, activate `technical_manager` first, then activate downstream technical roles through `technical_manager`.
- For non-code routing, activate `product_assistant` directly from `Aide`.
- When ownership, entrypoints, or boundaries are unclear, let `technical_manager` perform a short-lived read-only repository scan inside routing/execution.
- Keep one focused write-capable execution role at a time unless `technical_manager` explicitly stages a safe handoff.
- If uncertainty resolves, drop unnecessary roles immediately.

## Environment Setup

- default: `skip`
- choose `current-workspace` for small readiness checks or bootstrap steps
- choose `isolated-workspace` only when conflict risk or policy makes isolation useful

Environment setup decisions and preparation belong to `technical_manager`.

## Durable Coordination Files

- `.codex/state/task-context.json`: hot task state, including route evidence (`activated_roles`, `completed_roles`, `subagent_roles`) plus current chain artifacts (`prd_path`, `architecture_path`, `implementation_brief_path`)
- `.codex/logs/task-lifecycle/*.jsonl`: normalized per-turn task lifecycle sync log
- `.codex/state/governance-context.json`: active governance items maintained by `Aide`
- `.codex/state/submit-preferences.json`: repo-local submit preferences
- `.codex/state/*.demo.json`: versioned structure examples for runtime state files
- `.codex/policies/delivery-policy.json`: commit, push, notification, CI, release, and fallback policy
- `.codex/state/repo-context.json`: repository initialization snapshot and cached repo facts
- `.codex/policies/validation-profile.json`: validation commands and constraints
- `.codex/progress/active/<task-slug>/current.md`: primary long-running snapshot per active task
- `.codex/progress/active/<task-slug>/history/<timestamp>-<slug>.md`: append-only long-running progress events
- `.codex/progress/archive/<task-slug>/...`: archived progress records for completed/closed tasks
- `node .codex/scripts/context/task-progress-sync.mjs`: read-only helper that reports drift between hot task state and long-running `current.md`
- long-running path segments use a slugified task identifier; the literal `task_id` remains part of task state and file content
- `PROGRESS.md`: legacy optional note only, never the primary runtime progress source
- `.codex/context/project-profile.md`: human-readable repository summary and durable notes for people

## QC Gate

Queue or remind `qc` only when:

1. required `tester` handoff in the active execution chain is complete
2. the current task enables QC through `qc_policy` or enabled modules
3. `technical_manager` keeps QC active for the current task chain
4. the handoff is not blocked and not just a progress ping

## Submit Gate

Queue or remind `submit` when:

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
