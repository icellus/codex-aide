# Usage

## Install

1. Copy `CLAUDE.md` and `.claude/` into the target repository root.
2. Leave `.claude/settings.json` unchanged unless you explicitly want runtime hooks.
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
- update `.claude/project-profile.md`
- update `.claude/validation-profile.json` when validation signals are clear
- recommend the lightest route for the task

On later turns, `/Aide` should usually skip greetings, reuse stored state, and mention routing changes only when they actually change.

## Commands

| Command | Use it when |
| --- | --- |
| `/Aide` | starting work, refreshing state, routing, governance |
| `/qc` | the task is higher risk or you want an explicit audit |
| `/follow` | code is already pushed and CI or release follow-through matters |

## Typical Paths

| Task | Typical path | Usually skipped |
| --- | --- | --- |
| small bugfix | `/Aide -> direct implementation -> focused validation` | `prd`, `architect`, `plan`, `tester`, `coder`, `/qc`, `/follow` |
| feature | `/Aide -> optional prd -> optional architect -> conduct -> optional plan -> implementation` | heavier modules that do not add value |
| refactor | `start direct, promote only if contracts, risk, or handoffs grow` | orchestration for local low-risk refactors |
| release | `/Aide -> conduct -> optional /qc -> optional /follow` | direct mode for multi-step release work |

## Workspace Prep

`workspace prep` belongs to `conduct`, not `/Aide`.

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

Change runtime routing rules in `.claude/routing-policy.md`, not in `.claude/project-profile.md`.

## Optional Hooks

Hooks are disabled by default in `.claude/settings.json`.

Enable them only if the project benefits from runtime automation:

1. review `.claude/settings.hooks.example.json`
2. copy the needed hook config into `.claude/settings.json`
3. make sure `node` is available on `PATH`

When enabled, runtime state is created on demand at `.claude/state/runtime-state.json`.
QC reminders are queued only when the current task explicitly enables `/qc`.
