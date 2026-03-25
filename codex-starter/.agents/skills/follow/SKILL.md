---
name: follow
description: Use for /follow post-push CI and release follow-through, defaulting to report-first behavior.
---

You handle CI or release follow-through only when it is relevant to the project and current task.

When delegation is available, prefer a fresh `follow_worker` subagent.

## Sources of truth

- `.codex/project-profile.md` is the first place to read for task class, risk, and enabled modules
- current branch, PR context, and CI or workflow files are runtime evidence
- the user's explicit request determines whether you only report or also attempt fixes

## Phase 0: Decide applicability and mode

### Applicability

Use `/follow` only when one of these is true:

- code has already been pushed and CI or deployment state matters
- the user explicitly asks to inspect failing checks
- the current task is release follow-through

If none apply, return a short message that follow-through is not needed yet.

If the repo does not show CI or workflow signals, return `NOT APPLICABLE` instead of forcing a GitHub-centric flow.

### Mode selection

Default to `report-only`.

Use `auto-fix` only when:

- the user explicitly asks for it, or
- the project profile explicitly allows automatic fix attempts for this kind of work

## Phase 1: Discovery

Check:

1. git repository and current branch
2. whether the repo has workflow definitions
3. whether `gh` or the relevant CI tooling is available
4. whether there is an active PR or recent run for the current branch

Collect:

- failing checks or runs
- workflow names
- error snippets
- affected files or subsystems when visible from logs

## Phase 2: Report-first behavior

In `report-only` mode:

- summarize the current CI or release state
- categorize failures into lint, test, build, deploy, or environment
- identify the likely next owner or module:
  - direct fix
  - `coder`
  - `/qc`
  - manual infra or workflow change

Return a concise report with:

- what is failing
- what is likely causing it
- what the next best action is

## Phase 3: Optional fix mode

In `auto-fix` mode:

- prefer low-risk fixes first
- validate locally before pushing
- use targeted staging, not blanket staging
- stop after a small number of attempts if the same failure repeats

Good candidates for auto-fix:

- lint failures
- obvious build or config typos
- straightforward test regressions where the cause is local and clear

Bad candidates for auto-fix:

- infrastructure permission issues
- flaky external systems
- missing environment services
- unclear deployment failures

## Phase 4: Safety and escalation

Always stop and escalate when:

- the same failure repeats with no progress
- the problem is environment or permission related
- a fix would require force push or risky history edits
- the repo state is dirty in a way that makes automated follow-through unsafe

When blocked, return:

- failure category
- concrete evidence
- attempted actions
- recommended manual next step

## Validation policy

Choose the nearest useful validation based on the repository, not a hardcoded stack.

Examples:

- lint fix -> run the relevant lint command
- failing unit test -> run the nearest test command
- config fix -> run the repo's validation or build command if one exists

If the correct validation command cannot be inferred, say so explicitly.

## Git policy

- report-only mode never commits or pushes
- auto-fix mode may commit and push only when explicitly allowed by user intent or project policy
- do not force push by default

## Output contract

Return:

- applicability: `active`, `not-needed`, or `not-applicable`
- mode used: `report-only` or `auto-fix`
- current CI or workflow status
- fixes applied or blockers found
- next recommended step

Then append a structured footer:

```markdown
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
```
