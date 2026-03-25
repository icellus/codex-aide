# Project Progress

**Mode**: minimal orchestration
**Last Updated**: YYYY-MM-DD HH:MM
**Use This Template When**: the work needs lightweight durable tracking across steps or sessions, but release-specific promotion or deployment checkpoints are not the main concern.

If the work is mainly about promotion, deployment, release readiness, or post-push follow-through, use `.claude/templates/progress.release.md` instead.

---

## Active Work

### [Work Item Name]
- Task Class: `bugfix|feature|refactor|exploration`
- Delivery Mode: `orchestrated`
- Status: `active`
- Started: YYYY-MM-DD
- Last Updated: YYYY-MM-DD HH:MM
- Implementation Plan: `[path/to/plan.md or N/A]`
- Plan Summary: `[path/to/plan-summary.md or N/A]`
- Scope:
  - [intended outcome]
  - [key files, modules, or surfaces]
- Current Checkpoint: `[align|implement|validate|handoff]`
- Active Roles / Modules: `conduct`, main agent
- Validation Plan:
  - `[command or manual check]`
- Next Step: [single next action]
- Risks or Blockers: [none or short note]
- Notes: [optional]

<!-- Example:
### Improve login error handling
- Task Class: `bugfix`
- Delivery Mode: `orchestrated`
- Status: `active`
- Implementation Plan: `plans/login-error-handling.md`
- Plan Summary: `N/A`
- Scope:
  - make API errors user-readable
  - update auth handler and related tests
- Current Checkpoint: `validate`
- Active Roles / Modules: `conduct`, `tester`, `coder`
- Validation Plan:
  - `pnpm test -- login`
- Next Step: rerun focused auth tests after final copy update
-->

---

## Completed

### [Work Item Name]
- Completed: YYYY-MM-DD HH:MM
- Outcome: [short result]
- Validation: [key checks that passed]
- Follow-up: [none or short note]

---

## Parked or Blocked

### [Work Item Name]
- Status: `parked|blocked`
- Since: YYYY-MM-DD HH:MM
- Current Checkpoint: `[align|implement|validate|handoff]`
- Reason: [short explanation]
- Evidence:
  - `[file:line or command snippet]`
- Suggested Resume Point: [where to restart]
- Owner: [person or role]

---

## Session Notes (Optional)

### [YYYY-MM-DD HH:MM]
- Decision: [important scope or sequencing decision]
- Assumption Changed: [optional]
- Writeback Candidate: `[none|/Aide|CLAUDE.md|agent/skill/template path]`

---

## Optional Checkpoint Guide

- `align`: confirm scope, files, owners, and the minimum modules needed
- `implement`: make the change or complete the assigned handoff
- `validate`: run the narrowest useful verification for the active risk
- `handoff`: pause, transfer, or queue the clean next step for the next session
