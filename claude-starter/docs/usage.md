# Usage

## Install Into a Project

1. Copy `CLAUDE.md` and `.claude/` into the target repository root.
2. Keep `.claude/settings.json` as-is unless you explicitly want runtime hooks.
3. Start with `/Aide`.

## First Run

Use one of:

```text
/Aide
/Aide Fix the login callback bug
```

On first run, `/Aide` should:

- greet briefly
- scan the repository
- update `.claude/project-profile.md`
- provide a short project brief
- recommend the lightest role/module mix for the task

## Normal Follow-Up

On later turns, `/Aide` should usually:

- skip repeated greetings
- reuse the stored project brief
- respond directly to the task
- mention routing changes only when task type, risk, or module mix changes

## Typical Task Paths

### Small bugfix

```text
/Aide -> direct implementation -> focused validation
```

Usually skip:

- `prd`
- `architect`
- `plan`
- `workspace prep`
- `tester`
- `coder`
- orchestration
- `/qc`
- `/follow`

### Feature work

```text
/Aide -> optional prd -> optional architect -> conduct -> optional plan -> implementation
```

Use `prd` when scope, MVP, or success criteria are unclear.

Use `architect` when boundaries, interfaces, or integrations need durable design.

Use `plan` when implementation guidance needs to be written down.

### Refactor

Start in `direct`.

Promote only when:

- the refactor touches shared interfaces
- behavior guarantees need to be written down
- multiple steps or handoffs appear

### Release

Start in `orchestrated`.

Typical path:

```text
/Aide -> conduct -> optional /qc -> optional /follow
```

## Workspace Prep

`workspace prep` is owned by `conduct`, not `/Aide`.

It should run only when execution needs:

- an isolated branch or worktree
- dependency bootstrap or refresh
- local services, databases, or containers
- a narrow readiness check before coding or testing

It should usually be skipped for:

- small bugfixes
- docs or prompt/config edits
- already-ready workspaces

## Governance Actions

Use `/Aide` for durable governance actions:

```text
/Aide audit
/Aide dedup
/Aide prune
/Aide From now on, call me Lao Zhou
/Aide Never let tester claim red phase without running a real command
```

These actions cover:

- audit
- deduplication
- writeback of durable lessons
- address preference updates

## QC and Follow

Use `/qc` when:

- the task is higher risk
- you want an explicit audit
- release confidence matters

Use `/follow` when:

- code has already been pushed
- CI state matters
- release follow-through is needed

## Optional Hooks

Hooks are disabled by default in `.claude/settings.json`.

Enable them only if the project benefits from runtime automation:

1. review `.claude/settings.hooks.example.json`
2. copy the needed hook config into `.claude/settings.json`
3. make sure `node` is available on `PATH`

When enabled, runtime state is created on demand at `.claude/state/runtime-state.json`.
