# Overview

## What This Starter Optimizes For

`codex-starter` is for repositories where most work should stay light and direct, but stronger planning, auditing, and release controls must still be available when the task justifies them.

## Design Principles

- start light
- keep the user-facing surface small
- derive validation from the repository
- keep runtime authority singular
- separate intake/governance from delivery routing
- keep durable state only when coordination needs it

## Runtime Authority

| File | Responsibility |
| --- | --- |
| `AGENTS.md` | global operating stance |
| `.agents/skills/*/SKILL.md` | repo-local skills and slash-command protocols |
| `.codex/agents/*.toml` | custom subagent definitions |
| `.codex/config.toml` | subagent concurrency defaults |
| `.codex/routing-policy.md` | routing and module-activation authority |
| `.codex/project-profile.md` | current repo facts and current task state |
| `.codex/validation-profile.json` | structured validation commands and constraints |
| `.codex/scripts/*.mjs` | optional runtime helpers for reminders, git validation, and runtime-state sync |

## Roles and Modules

| Item | Responsibility | Default |
| --- | --- | --- |
| `/Aide` | intake, current state, governance | enabled |
| `conduct` | delivery routing and `workspace prep` | disabled |
| `prd` | WHAT, WHY, MVP clarification | disabled |
| `architect` | HOW at system level | disabled |
| `plan` | implementation handoff | disabled |
| `auto_qc` | internal QC follow-up when enabled tasks finish a tester or coder handoff | disabled |
| `tester` | test design and validation-first work | disabled |
| `coder` | implementation and focused validation | disabled |
| `/qc` | audit gate | disabled |
| `/follow` | post-push follow-through | disabled |
| runtime helpers | optional Node-assisted automation | disabled by default |

## Delivery Shape

- `direct`: small, local, clear work
- `plan-driven`: work that benefits from one implementation plan
- `orchestrated`: multi-step, cross-session, release, or higher-risk work

`workspace prep` belongs to `conduct`, not `/Aide`.
Exact task defaults and upgrade triggers live in `.codex/routing-policy.md`.

## Durable Artifacts

- `.codex/project-profile.md`: current repo facts and current task state
- `.codex/validation-profile.json`: structured validation command facts
- `PRD.md` or scoped PRD file: optional product scope
- `ARCHITECTURE.md` or scoped architecture file: optional system design
- `Implementation Plan`: optional implementation guidance
- `PROGRESS.md`: orchestration-only progress state
- `.codex/state/runtime-state.json`: runtime memory created on demand by `.codex/scripts/*.mjs`

## Runtime Automation

Runtime helpers are optional.

When used, they can provide:

- session reminders
- git validation
- runtime state tracking
- optional auto QC follow-up

Auto QC reminders should appear only when the current task explicitly enables `/qc`.

## Best Fit

This starter fits best when:

- the repository is small or medium-sized
- most work is bugfixes, focused features, or local refactors
- the team wants optional controls without forcing a heavy default workflow
- the team wants the main session to stay clean while execution is delegated to role-specific subagents
