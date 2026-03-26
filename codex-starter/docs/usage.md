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

On first run, `/Aide` should:

- greet briefly
- scan the repo
- update `.codex/state/task-context.json`
- update `.codex/state/repo-context.json`
- update `.codex/project-profile.md`
- update `.codex/validation-profile.json` with repository validation baseline signals
- recommend the lightest route for the task

On later turns, `/Aide` should usually skip greetings, reuse stored state, and mention routing changes only when they actually change.

The checked-in `.codex/state/*.json`, `.codex/project-profile.md`, and `.codex/validation-profile.json` are starter defaults.
Keep them generic in the starter repo; let `/Aide` rewrite them after copying the starter into a real project.

## Commands

| Command | Use it when |
| --- | --- |
| `/Aide` | starting work, refreshing state, routing, governance |
| `/qc` | the task is higher risk or you want an explicit audit |
| `/follow` | code is already pushed and CI or release follow-through matters |

## Typical Paths

| Task | Typical path | Usually skipped |
| --- | --- | --- |
| small bugfix | `/Aide -> coder -> sanity checks` | `prd`, `architect`, `plan`, `/follow` |
| higher-risk bugfix | `/Aide -> tester -> coder -> tester or /qc` | modules that do not add value |
| feature | `/Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> tester or optional /qc` | heavier modules that do not add value |
| refactor | `start lightweight, promote only if contracts, risk, or handoffs grow` | long-running tracking for local low-risk refactors |
| release | `/Aide -> conduct -> optional /qc -> optional /follow` | `long-running` mode for multi-step release work |

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

## Runtime Helpers

Runtime helpers live in `.codex/scripts/`.
Use them when the project benefits from reminders, queued QC follow-up, or git safety checks.

Useful entrypoints:

1. `node .codex/scripts/session-context.mjs`
2. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
3. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

Runtime state is created on demand at `.codex/state/runtime-state.json`.
QC reminders are queued only when the current task explicitly enables `/qc`.
`PROGRESS.md` is for active checkpoints only; runtime reminders and learning state stay in `.codex/state/runtime-state.json`.

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
