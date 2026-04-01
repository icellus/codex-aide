# Task Progress (Current Snapshot)

**Template Target**: `.codex/progress/active/<task-slug>/current.md`
**Archive Target**: `.codex/progress/archive/<task-slug>/current.md`
**Mode**: long-running (non-release)
**Last Synced**: YYYY-MM-DD HH:MM
**Latest Event**: `new-task|brief-refresh|handoff-switch|blocked|waiting-user|resume|paused|completed|cancelled`
**Latest History Entry**: `.codex/progress/active/<task-slug>/history/<timestamp>-<slug>.md`

Use this template for long-running work where release promotion/deploy checkpoints are not the primary concern.
If release checkpoints are primary, use `.codex/templates/progress/release.md` for the same `current.md` target.
The path segment uses a slugified task identifier; keep the literal Task ID in the fields below.

---

## Task Identity

- Task ID: `<task-id>`
- Work Item: [short title]
- Task Class: `bugfix|feature|product|refactor|exploration`
- Delivery Mode: `long-running`
- Status: `active|handoff|blocked|waiting_user|paused|completed|cancelled`
- Current Checkpoint: `align|brief|implement|validate|handoff|close`
- Owner: `technical_manager`
- Active Roles / Modules: `technical_manager`, [others or main agent]

## Scope and Brief

- Implementation Brief: `[plans/<task-slug>-implementation-brief.md or N/A]`
- Scope:
  - [intended outcome]
  - [key files, modules, or surfaces]
- Key Decisions:
  - [decision summary or N/A]

## Current State

- Summary: [what changed since the previous history entry]
- Next Step: [single next action]
- Next Owner: [role]
- Risks, Blockers, or Waiting User Note: [none or short note]

## Validation

- Last Verification:
  - `[command or manual check + result]`
- Pending Verification:
  - `[next check or N/A]`

## History Sync

- History Directory: `.codex/progress/active/<task-slug>/history/`
- Latest History Entry: `[timestamp-slug.md]`
- Sync Rule: on material long-running state changes such as `new-task|brief-refresh|handoff-switch|blocked|waiting-user|resume|paused|completed|cancelled`, append history and refresh this file in the same update cycle.
