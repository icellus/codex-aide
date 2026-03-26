# codex-starter

Project-local Codex workflow starter.

It keeps the default path lightweight, keeps the command surface small, and only enables heavier planning, QC, or release controls when the current task actually needs them.

## At A Glance

- default commands: `/Aide`, `/qc`, `/submit`
- default mode for small work: `lightweight`
- preferred execution model: subagent-first for `tester`, `coder`, `/qc`, and `/submit`
- official repo skill layout: `.agents/skills/*/SKILL.md`
- official custom subagent layout: `.codex/agents/*.toml`
- routing authority: `.codex/routing-policy.md`
- evolution policy: `.codex/evolution-policy.json`
- delivery policy: `.codex/delivery-policy.json`
- hot task state: `.codex/state/task-context.json`
- cold task registry: `.codex/state/task-registry.json`
- cold evolution registry: `.codex/state/evolution-registry.json`
- cached repo facts: `.codex/state/repo-context.json`
- human summary: `.codex/project-profile.md`
- repository validation baseline: `.codex/validation-profile.json`
- runtime helpers: `.codex/scripts/*.mjs`
- runtime dependency: `node` on `PATH`

## Quick Start

1. Copy `AGENTS.md`, `.agents/skills/`, `.codex/`, and optionally `docs/` and `tests/` into the target repository.
2. Ensure `node` is available if you want runtime helpers and smoke tests.
3. Start with `/Aide` or `/Aide [your goal]`.
4. Let `/Aide` scan the repo, update current state, and recommend the lightest route.
5. Stay lightweight unless the task clearly needs planning, long-running tracking, QC, or governed delivery.

If a fresh thread starts without a slash command, the first user turn should still be treated as `/Aide` intake by default.

The starter ships with template defaults in `.codex/project-profile.md` and `.codex/validation-profile.json`.
`/Aide` should replace them and the JSON state files in `.codex/state/` with repo-specific state on the first real run.

## What `/Aide` Owns

- `/Aide` is the team-improvement entry, not just the first task router.
- Other roles solve "how to deliver the current feature well"; `/Aide` solves "how to keep the team from repeating the same mistake".
- Investigation and default routing: when code lands in the wrong place, output quality drops, or a workflow breaks, `/Aide` treats the artifact as a symptom and routes the root cause to the smallest correct authority.
- Quality audit: `/Aide` audits Agent and Skill contracts for systemic issues that lower team effectiveness. The goal is not cosmetic prompt cleanup.
- Dedup: `/Aide` finds repeated rules across Agent and Skill files and proposes one authority plus smaller references elsewhere.
- Governance ratings: `/Aide` rates issues from `L1` to `L4` before deciding whether to route, queue, or write back.
- Automatic triggers: repeated QC failures, blocked handoffs, unfinished-task reconciliation, and every architect session-end retrospective can queue `/Aide` review work.
- Lightweight flows should still get a low-cost evolution sweep at `/Aide` startup, even when `architect` never ran.
- Fresh threads should greet briefly and hint at `/Aide`, `/qc`, and `/submit` on the first cold-start turn after the user speaks.
- `architect`, not `conduct`, owns the session-end structured retrospective because architecture decisions, wrong assumptions, and writeback candidates are governance inputs.

## Runtime Authority

- `AGENTS.md`: global stance and slash-command protocol
- `.agents/skills/*/SKILL.md`: repo-local skill modules and command protocols
- `.codex/agents/*.toml`: custom subagent definitions
- `.codex/config.toml`: subagent concurrency defaults
- `.codex/routing-policy.md`: routing and module-activation authority
- `.codex/evolution-policy.json`: automatic evolution thresholds and low-risk auto-writeback policy
- `.codex/delivery-policy.json`: governed submit defaults for commit, push, and optional post-push delivery steps
- `.codex/state/task-context.json`: hot task state and preferences
- `.codex/state/task-registry.json`: cold task registry for current, unfinished, and completed tasks
- `.codex/state/evolution-registry.json`: cold evolution candidates plus settled-task review history
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: repository validation baseline and constraints
- `.codex/project-profile.md`: short human summary
- `.codex/templates/validation-handoff.md`: optional tester handoff template for task-level validation
- `.codex/scripts/*.mjs`: runtime helpers for reminders, git validation, and runtime-state sync

Runtime state is written to `.codex/state/runtime-state.json` on demand.
`node .codex/scripts/task-overview.mjs` summarizes the current active task plus unfinished historical tasks for `/Aide`.
`node .codex/scripts/aide-evolution.mjs` performs the low-cost evolution sweep for `/Aide` and should run in the background when helper automation is available.
`node .codex/scripts/aide-governance.mjs` summarizes pending governance triggers, quality audit findings, and dedup candidates for `/Aide`.
When `long-running` mode is active, `PROGRESS.md` is for checkpoint tracking only.
Auto QC reminders are queued only when the current task explicitly enables `/qc`, including lightweight or standard work that does not have a tracked story path yet.
Prefer `task_settled` over `session_end` when a hook wants to report real task completion; `session_end` is best-effort cleanup only.

## Docs

- 中文指南: [`docs/zh-CN.md`](./docs/zh-CN.md)
- 中文概览: [`docs/overview.zh-CN.md`](./docs/overview.zh-CN.md)
- 中文使用说明: [`docs/usage.zh-CN.md`](./docs/usage.zh-CN.md)
- 中文详细说明: [`docs/detailed-guide.zh-CN.md`](./docs/detailed-guide.zh-CN.md)
- Overview: [`docs/overview.md`](./docs/overview.md)
- Usage: [`docs/usage.md`](./docs/usage.md)
- Smoke test: `node tests/runtime-hooks.smoke.mjs`
