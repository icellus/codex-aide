# claude-starter

Light-start starter for project-local Claude/Codex workflows.

It keeps the default path direct, keeps the command surface small, and only enables heavier planning, QC, or release controls when the current task actually needs them.

## At A Glance

- default commands: `/Aide`, `/qc`, `/follow`
- default mode for small work: `direct`
- runtime hooks: off by default
- routing authority: `.claude/routing-policy.md`
- current task state: `.claude/project-profile.md`
- structured validation commands: `.claude/validation-profile.json`

## Quick Start

1. Copy `CLAUDE.md` and `.claude/` into the target repository.
2. Start with `/Aide` or `/Aide [your goal]`.
3. Let `/Aide` scan the repo, update current state, and recommend the lightest route.
4. Stay direct unless the task clearly needs planning, orchestration, QC, or follow-through.

## Runtime Authority

- `CLAUDE.md`: global stance
- `.claude/routing-policy.md`: routing and module-activation authority
- `.claude/project-profile.md`: current repo facts and current task state
- `.claude/validation-profile.json`: structured validation command facts

Hooks create `.claude/state/runtime-state.json` on demand.
Auto QC reminders are queued only when the current task explicitly enables `/qc`.

## Docs

- Overview: [`docs/overview.md`](./docs/overview.md)
- Usage: [`docs/usage.md`](./docs/usage.md)
- 中文 README: [`README.zh-CN.md`](./README.zh-CN.md)
- 中文概述: [`docs/overview.zh-CN.md`](./docs/overview.zh-CN.md)
- 中文使用说明: [`docs/usage.zh-CN.md`](./docs/usage.zh-CN.md)
