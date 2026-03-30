# Task Progress (Current Snapshot)

**Template Target**: `.codex/progress/active/<task-id>/current.md`
**Archive Target**: `.codex/progress/archive/<task-id>/current.md`
**Mode**: long-running (non-release)
**Last Synced**: YYYY-MM-DD HH:MM
**Latest Event**: `new-task|brief-refresh|handoff-switch|blocked|resume|completed`
**Latest History Entry**: `.codex/progress/active/<task-id>/history/<timestamp>-<slug>.md`

Use this template for long-running work where release promotion/deploy checkpoints are not the primary concern.
If release checkpoints are primary, use `.codex/templates/progress/release.md` for the same `current.md` target.

---

## Task Identity

- Task ID: `<task-id>`
- Work Item: [short title]
- Task Class: `bugfix|feature|product|refactor|exploration`
- Delivery Mode: `long-running`
- Status: `active|handoff|blocked|parked|completed`
- Current Checkpoint: `align|brief|implement|validate|handoff|close`
- Owner: `technical_manager`
- Active Roles / Modules: `technical_manager`, [others or main agent]

## Scope and Brief

- Implementation Brief: `[path/to/implementation-brief.md or N/A]`
- Scope:
  - [intended outcome]
  - [key files, modules, or surfaces]
- Key Decisions:
  - [decision summary or N/A]

## Current State

- Summary: [what changed since the previous history entry]
- Next Step: [single next action]
- Next Owner: [role]
- Risks or Blockers: [none or short note]

## Validation

- Last Verification:
  - `[command or manual check + result]`
- Pending Verification:
  - `[next check or N/A]`

## History Sync

- History Directory: `.codex/progress/active/<task-id>/history/`
- Latest History Entry: `[timestamp-slug.md]`
- Sync Rule: on `new-task|brief-refresh|handoff-switch|blocked|resume|completed`, append history and refresh this file in the same update cycle.
