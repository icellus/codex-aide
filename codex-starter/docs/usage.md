# Usage

## Install

1. Copy `AGENTS.md`, `.agents/skills/`, and `.codex/` into the target repository root.
2. Ensure `node` is available on `PATH` if you want runtime helpers or smoke tests.
3. Start with `/Aide`.

## First Run

Use one of:

```text
/Aide
/Aide Fix the login callback bug
```

If a fresh thread starts without a slash command, the first user turn should still be treated as `/Aide` intake by default.

On first run, `/Aide` should:

- greet briefly
- scan the repo
- update `.codex/state/task-context.json`
- update `.codex/state/repo-context.json`
- update `.codex/project-profile.md`
- update `.codex/validation-profile.json` with repository validation baseline signals
- recommend the lightest route for the task

On later turns, `/Aide` should usually:

- skip greetings
- report the current active task and unfinished historical tasks first
- reuse stored state
- mention routing changes only when they actually change
- start the low-cost evolution sweep without blocking the initial route

On the very first cold-start turn after the user speaks, `/Aide` should also remind the user of `/Aide`, `/qc`, and `/submit` in one short line.

The checked-in `.codex/state/*.json`, `.codex/project-profile.md`, and `.codex/validation-profile.json` are starter defaults.
Keep them generic in the starter repo; let `/Aide` rewrite them after copying the starter into a real project.

## Commands

| Command | Use it when |
| --- | --- |
| `/Aide` | starting work, refreshing state, routing, governance |
| `/qc` | the task is higher risk or you want an explicit audit |
| `/submit` | implementation or validation is done and the task should move into governed commit, push, or optional post-push delivery |

## What `/Aide` Actually Owns

- `/Aide` is not only the intake command. It is the place where the repo gets better at working as a team.
- Other roles solve "how to do this feature well". `/Aide` solves "why did the team produce this kind of mistake or workflow break in the first place".
- Investigation and default routing: if code lands in the wrong place, output quality is weak, or a handoff breaks, `/Aide` should investigate the systemic cause before deciding who acts next.
- Quality audit: `/Aide` checks Agent and Skill files for systemic contract problems that reduce team effectiveness.
- Dedup: `/Aide` finds repeated rules across Agent and Skill files and proposes one authority plus smaller references elsewhere.
- Ratings: `/Aide` should rate governance findings from `L1` through `L4` before deciding whether to route, queue, or write back.
- Structured knowledge capture belongs to `architect`, not `conduct`. Every architect session should end with decisions made, wrong assumptions, and writeback candidates.
- Lightweight flows should still trigger `/Aide`'s low-cost evolution sweep at startup, even when `architect` is skipped.

## Typical Paths

| Task | Typical path | Usually skipped |
| --- | --- | --- |
| small bugfix | `/Aide -> coder -> sanity checks -> /submit` | `prd`, `architect`, `plan` |
| higher-risk bugfix | `/Aide -> tester -> coder -> tester or /qc -> /submit` | modules that do not add value |
| feature | `/Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> tester or optional /qc -> /submit` | heavier modules that do not add value |
| refactor | `start lightweight, promote only if contracts, risk, or handoffs grow` | long-running tracking for local low-risk refactors |
| release | `/Aide -> conduct -> optional /qc -> /submit` | `long-running` mode for multi-step release work |

## Environment Setup

`environment setup` belongs to `conduct`, not `/Aide`.

Run it only when execution needs:

- an isolated branch or worktree
- dependency bootstrap or refresh
- local services, databases, or containers
- a narrow readiness check before coding or testing

Skip it for small bugfixes, docs-only work, prompt/config edits, and already-ready workspaces.

## Governance

Use `/Aide` for durable governance actions:

```text
/Aide audit
/Aide dedup
/Aide prune
/Aide From now on, call me Lao Zhou
/Aide Never let tester claim red phase without running a real command
```

Change runtime routing rules in `.codex/routing-policy.md`, not in `.codex/project-profile.md`.
Change automatic evolution thresholds and low-risk auto-writeback rules in `.codex/evolution-policy.json`.

The three core governance capabilities are:

- investigation and default routing: treat the bad artifact as a symptom and route the root cause
- quality audit: find system issues in Agent and Skill contracts that lower team effectiveness
- dedup: collapse repeated rules back to one authority

Use the `L1` to `L4` scale to keep the response proportional:

- `L1`: local symptom or one-off clarity issue
- `L2`: role drift in one role contract
- `L3`: workflow break across routing, handoff, or automation
- `L4`: authority defect, duplication, or conflict in shared rules

## Runtime Helpers

Runtime helpers live in `.codex/scripts/`.
Use them when the project benefits from reminders, queued QC follow-up, or git safety checks.

Useful entrypoints:

1. `node .codex/scripts/task-overview.mjs`
2. `node .codex/scripts/aide-evolution.mjs`
3. `node .codex/scripts/aide-governance.mjs`
4. `node .codex/scripts/session-context.mjs`
5. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
6. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

Runtime state is created on demand at `.codex/state/runtime-state.json`.
The task registry lives at `.codex/state/task-registry.json` and keeps the current task plus unfinished task history, with completed tasks available on demand.
The evolution registry lives at `.codex/state/evolution-registry.json` and keeps low-cost startup sweep results plus settled-task review history.
The evolution policy lives at `.codex/evolution-policy.json` and decides which repeated signal categories may auto-apply low-risk writebacks.
`/Aide` reports current and unfinished tasks by default; completed tasks are lookup-only unless the user asks.
/Aide governance review can also be triggered automatically from repeated QC failures, blocked handoffs, unfinished-task reconciliation, settled-task review, or architect retrospectives.
Architect retrospectives are expected on every architect session, not only after failures.
QC reminders are queued only when the current task explicitly enables `/qc`.
`PROGRESS.md` is for active checkpoints only; runtime reminders and learning state stay in `.codex/state/runtime-state.json`.
Prefer `task_settled` over `session_end` when reporting real task completion; `session_end` is best-effort cleanup only.

For non-trivial feature or behavior changes, `tester` should own the task-level validation handoff.
Use the inline tester report or `.codex/templates/validation-handoff.md` to state:

- validation targets
- selected checks
- coverage rationale
- remaining gaps

## Smoke Test

Run:

```bash
node tests/runtime-hooks.smoke.mjs
```
