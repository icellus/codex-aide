---
name: plan
description: Create the lightest durable 任务实施说明 (Task Implementation Brief) for execution.
---

You produce `任务实施说明` (`Task Implementation Brief`) for delivery execution.

`conduct` decides when this module is active.
When `coder` or `tester` is in the chain, this artifact is mandatory and is their only execution input.

## Sources of truth

- `.codex/project-profile.md` for task class/risk/mode context
- `conduct` route decision and execution-chain requirements
- user goal and constraints
- repository code/tests/manifests as primary implementation context
- optional upstream artifacts: `PRD.md` and `ARCHITECTURE.md`

## Phase 0: Decide whether artifact is needed

Choose one outcome:

### Outcome A: `skip`

Use only when:

- task stays in discussion/product clarification and does not activate `coder`/`tester`
- durable execution guidance would add process without value

### Outcome B: `plan`

Use when:

- execution chain needs one durable `任务实施说明`
- task is non-trivial bugfix/feature/refactor needing stable handoff
- `coder` or `tester` is active (mandatory)

### Outcome C: `plan+summary`

Use when:

- `long-running` mode is active
- multiple sessions/roles need a compact coordination snapshot

Do not create extra heavy artifacts by default.
If WHAT/WHY/MVP is unstable, stop and route to `prd`.
If system-level HOW is unstable, stop and route to `architect`.

## Phase 1: Gather context

Always read:

1. `.codex/project-profile.md`
2. user goal and latest `conduct` handoff
3. dependency manifests (`go.mod`, `package.json`, `pyproject.toml`, or equivalents)
4. most relevant implementation and test files

Read when relevant:

1. `PRD.md`
2. `ARCHITECTURE.md`
3. prior plans with active dependencies

Extract:

- exact target files or candidate files
- reusable local patterns
- key libraries/tooling constraints
- local validation commands
- sequencing needs and known risks

## Phase 2: Write 任务实施说明

Recommended structure:

```markdown
# 任务实施说明 (Task Implementation Brief): [Title]

**Status**: ready-for-coder
**Task Class**: [bugfix|feature|refactor|release-follow-up|exploration]
**Goal**: [one-sentence outcome]
**Execution Owners**: `coder -> tester`

## Context
- why this work exists
- only relevant repo facts

## Scope
- in scope
- out of scope (if needed)

## Target Files / Modules
- `path/to/file`

## Implementation Steps
1. concrete executable step
2. concrete executable step

## Validation Plan
- nearest tests/lint/build checks

## Risks / Notes
- meaningful risks only
```

Optional sections only when needed:

- `## Technical Approach`
- `## Dependencies / Sequencing`
- `## Open Questions`

## Phase 3: Artifact paths

### Main brief

- prefer durable path: `plans/[slug].md` unless repository convention differs
- avoid invented ticket IDs unless project already uses them

### Optional summary

- create only when `long-running` and cross-session coordination truly benefits
- prefer durable path: `plans/[slug]-summary.md`

Summary should include only:

- full brief path
- current status
- key scope bullets
- planned files
- dependencies/handoff notes
- major risks

## Phase 4: Validate output

Before finishing:

- ensure content matches real repository context
- ensure planned files are real or intentionally new
- ensure guidance is execution-focused, not generic theory
- ensure optional sections are present only when useful
- ensure summary does not add requirements absent from main brief
- ensure `coder`/`tester` can execute solely from this artifact plus repo evidence

## Output contract

Return:

- selected outcome: `skip`, `plan`, or `plan+summary`
- brief path if created
- summary path if created
- blockers or open questions
- next recommended step
