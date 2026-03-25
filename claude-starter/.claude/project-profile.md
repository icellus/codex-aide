# Project Profile

This file is maintained by `/Aide`. Keep it short and practical.

## Project Brief

- Repo scan status: not-scanned
- Project type: Unknown
- Scale: Unknown
- Primary languages:
- Frameworks:
- Repo shape:
- CI or deployment signals:
- Release path:
- Notes:

## Validation Profile

- Primary signals:
- Fast feedback command:
- Focused verification command:
- Broader verification command:
- Lint or typecheck command:
- Build or package command:
- Integration or e2e command:
- Notes:

## Collaboration Preferences

- Preferred address: boss
- Greeting style: brief
- First startup greeting completed: no

## Current Task Context

- Current task:
- Task class: `unknown`
- Risk level: `unknown`
- Recommended delivery mode: `direct`
- Applied task policy row: `unknown`
- Active overrides: none

## Task Activation Matrix

Use this section as the default task-to-module routing map for the project. `/Aide` should apply the lightest matching row first, then add only the smallest justified overrides.

`workspace prep` is not part of `/Aide` intake. Let `conduct` decide it later only when active implementation needs isolated workspace or readiness checks.

### `bugfix`

- Baseline delivery mode: `direct`
- Baseline roles: `Aide`, main agent
- Baseline modules: startup scan or cached repo context, direct implementation, focused validation
- Add `prd` when the bugfix is really a behavior, scope, or product tradeoff decision
- Add `architect` when the bugfix changes shared interfaces, integration flow, or cross-module structure
- Add `plan` when the fix crosses multiple modules, the failure mode is unclear, or the acceptance boundary needs to be written down
- Add `tester` and `coder` when explicit red/green separation or handoff value is high
- Add `/qc` for higher-risk fixes, user-requested verification, or pre-release bug fixes
- Add internal orchestration and `PROGRESS.md` only for multi-phase, cross-session, or blocked work
- Add `/follow` only after push when CI or deployment follow-through matters

### `feature`

- Baseline delivery mode: `plan-driven`
- Baseline roles: `Aide`, main agent
- Baseline modules: startup scan or cached repo context, `plan`, focused validation
- Add `prd` when MVP, user-visible scope, external integration expectations, or success criteria are unclear
- Add `architect` when interfaces, cross-module boundaries, integration shape, or technical tradeoffs need durable design
- Prefer one `Implementation Plan` by default; add a plan summary only when task size or coordination needs justify it
- Add `tester` and `coder` when the feature benefits from explicit red/green handoff
- Add `/qc` when the feature is higher-risk, user-facing, or close to release
- Add internal orchestration and `PROGRESS.md` when the feature spans multiple sessions, branches, or active plans
- Add `/follow` only when code is pushed and post-push CI or deployment monitoring matters

### `refactor`

- Baseline delivery mode: `direct`
- Baseline roles: `Aide`, main agent
- Baseline modules: startup scan or cached repo context, direct implementation, focused validation
- Add `prd` only when the refactor changes user-visible behavior or requires product scope decisions
- Add `architect` when the refactor changes system boundaries, shared contracts, or component responsibilities
- Promote to `plan` when the refactor is broad, touches shared interfaces, or needs an explicit "no behavior change" contract
- Add `tester` and `coder` when test-first refactoring or role separation reduces risk
- Add `/qc` for higher-risk structural changes or before release
- Add internal orchestration and `PROGRESS.md` when the refactor is multi-phase, cross-session, or needs staged rollout
- Add `/follow` only when the refactor has already been pushed and CI or rollout follow-through is needed

### `release`

- Baseline delivery mode: `orchestrated`
- Baseline roles: `Aide`, main agent
- Baseline modules: startup scan or cached repo context, release checks, `/qc`
- Add `prd` only when the release includes scope cuts, user-visible changes, or ship/no-ship product decisions
- Add `architect` only when release work includes non-trivial technical rollout or system design changes
- Add internal orchestration and `PROGRESS.md` by default when release work spans multiple steps or checkpoints
- Add `/follow` when CI, deployment, or post-release verification must be tracked
- Add `plan`, `tester`, and `coder` only when release work includes non-trivial code changes rather than verification or coordination only

### `exploration`

- Baseline delivery mode: `direct`
- Baseline roles: `Aide`, main agent
- Baseline modules: startup scan or cached repo context, focused inspection, lightweight notes
- Add `prd` when the exploration is meant to turn into scoped product requirements
- Add `architect` when the exploration is mainly about architecture choices, integration shape, or system boundaries
- Add requirements or design planning only when the exploration is meant to turn into durable requirements or design output
- Add `plan` only when exploration has turned into committed implementation work
- Avoid `/qc`, internal orchestration, and `/follow` unless the exploration clearly transitions into delivery or release work

## Role Roster

- `Aide`: enabled; owns startup scan, project brief, preference memory, governance writeback, audit, dedup, and prune
- `prd`: disabled by default; enable when requirements clarification, MVP slicing, or user-visible scope decisions matter
- `architect`: disabled by default; enable when system-level design, interfaces, or technical tradeoffs need durable clarification
- `conduct`: disabled by default; enable when delivery routing, workspace prep, internal coordination, or heavier checkpoints are needed
- `tester`: disabled by default; enable when explicit red-phase separation adds value
- `coder`: disabled by default; enable when a dedicated implementation handoff adds value
- `qc`: disabled by default; enable for higher-risk work or pre-release verification
- `follow`: disabled by default; enable when post-push CI or deployment follow-through is needed

## Module Policy

- Startup scan and brief: enabled
- Aide governance (`writeback`, `audit`, `dedup`, `prune`): enabled
- Product requirements (`prd`): disabled by default; when enabled, clarify WHAT, WHY, and MVP in a lightweight PRD without implementation detail
- Architecture design (`architect`): disabled by default; when enabled, clarify HOW at system level in a lightweight architecture note
- Direct implementation: enabled
- Workspace prep (`conduct` only): disabled by default; when enabled, prefer the current workspace, run only the narrowest readiness checks, and create a new branch or worktree only when isolation is actually needed
- Implementation planning (`plan`): disabled by default; when enabled, create one `Implementation Plan` and add a plan summary only when orchestration needs it
- Orchestration (`PROGRESS.md` plus internal coordination): disabled by default
- Quality gate (`/qc`): disabled by default; when enabled, prefer targeted audit and do not auto-commit or auto-push
- Release follow-through (`/follow`): disabled by default; when enabled, prefer report-first and opt into auto-fix explicitly
- Runtime hooks: disabled by default
- Use the `Task Activation Matrix` above as the default routing policy before applying task-specific overrides

## Open Questions

- None

## Last Aide Summary

- Not reviewed yet.
