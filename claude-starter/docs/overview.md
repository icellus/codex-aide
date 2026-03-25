# Overview

## What This Starter Optimizes For

`claude-starter` is for repositories where most work should stay light and direct, but stronger planning, auditing, and release controls must still be available when the task justifies them.

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
| `CLAUDE.md` | global operating stance |
| `.claude/routing-policy.md` | routing and module-activation authority |
| `.claude/project-profile.md` | current repo facts and current task state |
| `.claude/validation-profile.json` | structured validation commands and constraints |

## Roles and Modules

| Item | Responsibility | Default |
| --- | --- | --- |
| `/Aide` | intake, current state, governance | enabled |
| `conduct` | delivery routing and `workspace prep` | disabled |
| `prd` | WHAT, WHY, MVP clarification | disabled |
| `architect` | HOW at system level | disabled |
| `plan` | implementation handoff | disabled |
| `tester` | test design and validation-first work | disabled |
| `coder` | implementation and focused validation | disabled |
| `/qc` | audit gate | disabled |
| `/follow` | post-push follow-through | disabled |
| hooks | optional runtime automation | disabled |

## Delivery Shape

- `direct`: small, local, clear work
- `plan-driven`: work that benefits from one implementation plan
- `orchestrated`: multi-step, cross-session, release, or higher-risk work

`workspace prep` belongs to `conduct`, not `/Aide`.
Exact task defaults and upgrade triggers live in `.claude/routing-policy.md`.

## Durable Artifacts

- `.claude/project-profile.md`: current repo facts and current task state
- `.claude/validation-profile.json`: structured validation command facts
- `PRD.md` or scoped PRD file: optional product scope
- `ARCHITECTURE.md` or scoped architecture file: optional system design
- `Implementation Plan`: optional implementation guidance
- `PROGRESS.md`: orchestration-only progress state
- `.claude/state/runtime-state.json`: hook-owned runtime memory

## Runtime Automation

Hooks are off by default.

When enabled, they can provide:

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
