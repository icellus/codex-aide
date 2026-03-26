# Overview

## What This Starter Optimizes For

`codex-starter` is for repositories where most work should stay lightweight, but stronger planning, auditing, and release controls must still be available when the task justifies them.

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
| `.codex/evolution-policy.json` | automatic evolution thresholds and allowed low-risk writebacks |
| `.codex/delivery-policy.json` | commit, push, notification, CI, release, and fallback policy |
| `.codex/state/task-context.json` | hot task state and collaboration preferences |
| `.codex/state/task-registry.json` | cold task registry for current, unfinished, and completed tasks |
| `.codex/state/evolution-registry.json` | cold evolution candidates and settled-task review history |
| `.codex/state/repo-context.json` | cached repo facts |
| `.codex/validation-profile.json` | repository validation baseline and constraints |
| `.codex/project-profile.md` | short human summary |
| `.codex/scripts/*.mjs` | optional runtime helpers for reminders, git validation, and runtime-state sync |

## Roles and Modules

| Item | Responsibility | Default |
| --- | --- | --- |
| `/Aide` | intake, current state, systemic governance, and team-quality writeback | enabled |
| `conduct` | delivery routing and `environment setup` | disabled |
| `prd` | WHAT, WHY, MVP clarification | disabled |
| `architect` | HOW at system level | disabled |
| `plan` | implementation handoff | disabled |
| `auto_qc` | internal QC follow-up when enabled tasks finish a tester or coder handoff | disabled |
| `tester` | task-level validation ownership and test design | disabled |
| `coder` | implementation and sanity checks | disabled |
| `/qc` | audit gate | disabled |
| `/submit` | governed commit, push, and optional post-push delivery flow | disabled |
| runtime helpers | optional Node-assisted automation | disabled by default |

## What `/Aide` Optimizes

- Other roles focus on making the current task correct. `/Aide` focuses on making the team more reliable across tasks.
- Investigation and default routing: `/Aide` diagnoses why misplaced code, weak output quality, or broken handoffs keep happening, then routes the root cause instead of only patching the symptom.
- Quality audit: `/Aide` audits Agent and Skill contracts for system-level issues that reduce team efficiency.
- Dedup: `/Aide` finds duplicated rules across Agent and Skill files and pushes the repo back toward one clear authority per rule.
- Governance ratings: `/Aide` grades issues from `L1` through `L4` so routing and writeback pressure stay proportional.
- Knowledge capture: `architect`, not `conduct`, closes every design session with a structured retrospective. `/Aide` uses those decisions, wrong assumptions, and writeback candidates as governance input.
- Low-cost evolution sweep: `/Aide` should still consider durable lessons at startup even when the flow stayed lightweight and skipped `architect`.

## Delivery Shape

- `lightweight`: small, local, clear work
- `standard`: work that benefits from one implementation plan
- `long-running`: multi-step, cross-session, release, or higher-risk work

`environment setup` belongs to `conduct`, not `/Aide`.
Exact task defaults and upgrade triggers live in `.codex/routing-policy.md`.

## Durable Artifacts

- `.codex/project-profile.md`: short human summary
- `.codex/evolution-policy.json`: automatic evolution thresholds and low-risk writeback rules
- `.codex/state/task-context.json`: hot task state and preferences
- `.codex/state/task-registry.json`: cold task registry and on-demand task history
- `.codex/state/evolution-registry.json`: cold evolution queue and settled-task review log
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: repository validation baseline
- `.codex/templates/validation-handoff.md`: optional tester-owned validation handoff template
- `PRD.md` or scoped PRD file: optional product scope
- `ARCHITECTURE.md` or scoped architecture file: optional system design
- `Implementation Plan`: optional implementation guidance
- `PROGRESS.md`: long-running progress state
- `.codex/state/runtime-state.json`: runtime memory created on demand by `.codex/scripts/*.mjs`

`PROGRESS.md` should track checkpoints and next actions, not runtime-managed retrospectives or learning queues.

## Runtime Automation

Runtime helpers are optional.

When used, they can provide:

- session reminders
- git validation
- runtime state tracking
- low-cost `/Aide` evolution sweep
- optional auto QC follow-up
- automatic `/Aide` governance review from repeated QC failures, blocked handoffs, unfinished-task reconciliation, settled-task review, and architect retrospectives

Auto QC reminders should appear only when the current task explicitly enables `/qc`.
Prefer task-settled hooks over session-end hooks for real task completion; session-end remains best-effort cleanup.

## Best Fit

This starter fits best when:

- the repository is small or medium-sized
- most work is bugfixes, focused features, or local refactors
- the team wants optional controls without forcing a heavy default workflow
- the team wants the main session to stay clean while execution is delegated to role-specific subagents
