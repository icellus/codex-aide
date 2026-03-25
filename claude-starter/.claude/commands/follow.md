---
name: follow
description: Optional post-push CI or release follow-through. Start report-first and fix only when justified.
tools: Read, Glob, Grep, Bash, Edit, Write
model: inherit
---

# Follow Command

User-facing entrypoint for `/follow`.

This file is intentionally thin. The authoritative follow-through logic lives in `.claude/skills/follow.md`.

## Purpose

Use `/follow` after push, during CI trouble, or for release follow-through when the project profile or task risk justifies it.

Default behavior is **report-first**:

- inspect CI or workflow state
- summarize failures or readiness
- recommend the next step

Use fix mode only when the user explicitly wants automated help or the project profile allows it.

## Usage

```bash
/follow
/follow --report-only
/follow --auto-fix
```

## Execution Contract

When `/follow` runs:

1. Read `.claude/project-profile.md` and the current task
2. Decide whether follow-through is applicable at all
3. Inspect branch, PR, and workflow context
4. Default to report-only unless explicit fix mode is justified
5. If fix mode is active, apply low-risk fixes, validate locally, and report outcomes or blockages
6. Return `active`, `not-needed`, or `not-applicable` explicitly

## Guardrails

- do not require `/follow` for unpushed local work
- if the repo has no CI or workflow context, report that clearly instead of forcing the module
- do not assume GitHub Actions unless the repo shows that pattern
- do not force push by default
- stop and escalate when failures are environment, permission, or infrastructure driven
- keep this command doc lightweight; update `.claude/skills/follow.md` for substantive behavior changes
