# codex-starter

Project-local Codex workflow starter.

It keeps the default path direct, keeps the command surface small, and only enables heavier planning, QC, or release controls when the current task actually needs them.

## At A Glance

- default commands: `/Aide`, `/qc`, `/follow`
- default mode for small work: `direct`
- preferred execution model: subagent-first for `tester`, `coder`, `/qc`, and `/follow`
- official repo skill layout: `.agents/skills/*/SKILL.md`
- official custom subagent layout: `.codex/agents/*.toml`
- routing authority: `.codex/routing-policy.md`
- hot task state: `.codex/state/task-context.json`
- cached repo facts: `.codex/state/repo-context.json`
- human summary: `.codex/project-profile.md`
- structured validation commands: `.codex/validation-profile.json`
- runtime helpers: `.codex/scripts/*.mjs`
- runtime dependency: `node` on `PATH`

## Quick Start

1. Copy `AGENTS.md`, `.agents/skills/`, `.codex/`, and optionally `docs/` and `tests/` into the target repository.
2. Ensure `node` is available if you want runtime helpers and smoke tests.
3. Start with `/Aide` or `/Aide [your goal]`.
4. Let `/Aide` scan the repo, update current state, and recommend the lightest route.
5. Stay direct unless the task clearly needs planning, orchestration, QC, or follow-through.

The starter ships with template defaults in `.codex/project-profile.md` and `.codex/validation-profile.json`.
`/Aide` should replace them and the JSON state files in `.codex/state/` with repo-specific state on the first real run.

## Runtime Authority

- `AGENTS.md`: global stance and slash-command protocol
- `.agents/skills/*/SKILL.md`: repo-local skill modules and command protocols
- `.codex/agents/*.toml`: custom subagent definitions
- `.codex/config.toml`: subagent concurrency defaults
- `.codex/routing-policy.md`: routing and module-activation authority
- `.codex/state/task-context.json`: hot task state and preferences
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: structured validation command facts
- `.codex/project-profile.md`: short human summary
- `.codex/scripts/*.mjs`: runtime helpers for reminders, git validation, and runtime-state sync

Runtime state is written to `.codex/state/runtime-state.json` on demand.
When orchestration is active, `PROGRESS.md` is for checkpoint tracking only.
Auto QC reminders are queued only when the current task explicitly enables `/qc`, including direct or plan-driven work that does not have a tracked story path yet.

## Docs

- 中文指南: [`docs/zh-CN.md`](./docs/zh-CN.md)
- 中文概览: [`docs/overview.zh-CN.md`](./docs/overview.zh-CN.md)
- 中文使用说明: [`docs/usage.zh-CN.md`](./docs/usage.zh-CN.md)
- 中文详细说明: [`docs/detailed-guide.zh-CN.md`](./docs/detailed-guide.zh-CN.md)
- Overview: [`docs/overview.md`](./docs/overview.md)
- Usage: [`docs/usage.md`](./docs/usage.md)
- Smoke test: `node tests/runtime-hooks.smoke.mjs`
