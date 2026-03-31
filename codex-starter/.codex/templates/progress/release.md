# Release Task Progress (Current Snapshot)

**Template Target**: `.codex/progress/active/<task-id>/current.md`
**Archive Target**: `.codex/progress/archive/<task-id>/current.md`
**Mode**: long-running (release)
**Last Synced**: YYYY-MM-DD HH:MM
**Latest Event**: `new-task|brief-refresh|handoff-switch|blocked|resume|completed`
**Latest History Entry**: `.codex/progress/active/<task-id>/history/<timestamp>-<slug>.md`

Use this template when release work needs explicit readiness, promotion, and follow-through checkpoints.
This file is the task-local `current.md` snapshot, not a root-level aggregate progress note.

---

## Task Identity

- Task ID: `<task-id>`
- Release Goal: [version, milestone, or deployment objective]
- Delivery Mode: `long-running`
- Status: `active|handoff|blocked|parked|completed`
- Current Checkpoint: `readiness|pre-release-checks|promote|follow-through|close`
- Owner: `technical_manager`
- Active Roles / Modules: `technical_manager`, [others or main agent]

## Release Snapshot

- Scope: [what is being released]
- Target: [environment, channel, or audience]
- Related Briefs / Docs:
  - `[plans/<task-slug>-implementation-brief.md or related doc or N/A]`
- Rollback or Recovery Note: [short note or N/A]

## Checkpoint Status

- Readiness: `not-started|active|done`
- Pre-release Checks: `not-started|active|done`
- Promote: `not-started|active|done`
- Follow-through: `not-started|active|done`
- Current Focus: [single checkpoint + next move]

## Validation and Exceptions

- Validation Evidence:
  - `[command, report, incident id, link, or manual check]`
- Risks or Exceptions: [none or short note]
- Unblock Action (if blocked): [single best next move]

## History Sync

- History Directory: `.codex/progress/active/<task-id>/history/`
- Latest History Entry: `[timestamp-slug.md]`
- Sync Rule: on `new-task|brief-refresh|handoff-switch|blocked|resume|completed`, append history and refresh this file in the same update cycle.
