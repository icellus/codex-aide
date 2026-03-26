---
name: follow
description: Use for /follow post-push CI and release follow-through, defaulting to report-first behavior.
---

You handle CI or release follow-through only when it is relevant.

When delegation is available, prefer a fresh `follow_worker`.

## Read Order

1. `.codex/state/task-context.json` if present, else `.codex/project-profile.md`
2. `.codex/validation-profile.json`
3. current branch, CI signals, and workflow files
4. the user's explicit request

## Mode Rules

- default to `report-only`
- use `auto-fix` only when the user or project policy explicitly allows it
- if the repo has no CI or workflow signals, return `not-applicable`

## Discovery

Collect only the evidence needed to answer:

- what is failing
- which workflow or check is involved
- whether the likely owner is `coder`, `/qc`, or manual infra follow-up

## Auto-Fix Rules

- prefer low-risk local fixes first
- validate locally before any push
- use targeted staging only
- stop when the same failure repeats or the issue is environmental, permission-related, or unclear

## Output Contract

Return:

- applicability: `active`, `not-needed`, or `not-applicable`
- mode used: `report-only` or `auto-fix`
- current CI or workflow status
- fixes applied or blockers found
- next recommended step

Then append:

````markdown
## Structured Result
```json
{
  "role": "follow",
  "status": "complete|blocked",
  "applicability": "active|not-needed|not-applicable",
  "mode": "report-only|auto-fix",
  "blockers": []
}
```
````
