# Task Progress History Entry

**Template Target**: `.codex/progress/active/<task-id>/history/<timestamp>-<slug>.md`
**Archive Target**: `.codex/progress/archive/<task-id>/history/<timestamp>-<slug>.md`
**Timestamp**: YYYY-MM-DD HH:MM
**Task ID**: `<task-id>`
**Event**: `new-task|brief-refresh|handoff-switch|blocked|resume|completed`
**Written By**: `technical_manager`

---

## Event Summary

- Trigger: [what caused this event]
- Summary: [single concise update]

## State Transition

- Status: `[before] -> [after]`
- Checkpoint: `[before] -> [after]`
- Active Roles / Modules: [before -> after or unchanged]

## Brief and Ownership

- `Implementation Brief`: `[path/status change or unchanged]`
- Handoff: `[from -> to or N/A]`

## Evidence

- `[command output, file path, log id, or N/A]`

## Current Sync

- Current File: `.codex/progress/active/<task-id>/current.md`
- Synced At: YYYY-MM-DD HH:MM
- Sync Result: `synced|pending`

## Next Step

- Owner: [role]
- Action: [single next move]
