# Release Progress

**Mode**: release long-running tracking
**Last Updated**: YYYY-MM-DD HH:MM
**Release Goal**: [version, milestone, or deployment objective]
**Current Checkpoint**: `[readiness|pre-release-checks|promote|follow-through|close]`

Use this template when release work needs explicit checkpoints, promotion notes, or post-release follow-through.

---

## Release Snapshot

- Scope: [what is being released]
- Target: [environment, channel, or audience]
- Active Roles / Modules: `conduct`, main agent
- Related Plans:
  - `[path or N/A]`
- Validation Baseline:
  - `[command or manual check]`
- Rollback or Recovery Note: [short note or N/A]

---

## Active Checkpoints

### Readiness
- Status: `not-started|active|done`
- Entry Criteria:
  - [scope confirmed]
  - [dependencies or approvals ready]
- Notes: [optional]

### Pre-release Checks
- Status: `not-started|active|done`
- Commands / Evidence:
  - `[command, report, or manual check]`
- `/qc`: `[not-needed|queued|done]`
- Risks or Exceptions: [none or short note]

### Promote
- Status: `not-started|active|done`
- Steps:
  - [promotion or deploy action]
- Evidence:
  - `[link, log, build id, or note]`
- Rollback Plan: [short note]

### Follow-through
- Status: `not-started|active|done`
- Monitoring / Smoke Checks:
  - `[check or command]`
- `/submit`: `[not-needed|queued|done]`
- Exit Criteria: [what must be true to close]

---

## Blockers or Exceptions

### [Item Name]
- Since: YYYY-MM-DD HH:MM
- Checkpoint: `[readiness|pre-release-checks|promote|follow-through]`
- Reason: [short explanation]
- Evidence:
  - `[command snippet, incident id, or file:line]`
- Owner: [person or role]
- Unblock Action: [single best next move]

---

## Completed Releases or Milestones

### [Release Goal]
- Completed: YYYY-MM-DD HH:MM
- Summary: [short result]
- Validation: [key checks that passed]
- Follow-up: [none or short note]

---

## Decisions or Writebacks (Optional)

### [YYYY-MM-DD HH:MM]
- Decision: [important release choice]
- Exception: [optional]
- Writeback Candidate: `[none|/Aide|AGENTS.md|agent/skill/template path]`
