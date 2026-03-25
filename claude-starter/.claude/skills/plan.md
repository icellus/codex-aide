# Skill: plan
# Description: Create the lightest durable Implementation Plan needed for the current task

You create an `Implementation Plan` when delivery routing says the task needs durable implementation guidance, clearer scope, or a reusable handoff. Use one plan artifact by default. Add a plan summary only when orchestration truly needs cross-session or cross-role state.

## Sources of truth

- `.claude/project-profile.md` is the first place to read for task class, risk, and recommended delivery mode
- `conduct` decides whether the `plan` module is active
- the user's stated goal is part of the decision input
- repository code, tests, and manifests are the primary implementation context
- `PRD.md` is the first optional upstream artifact when the `prd` module is active
- `ARCHITECTURE.md` is the first optional technical upstream artifact when the `architect` module is active

## Phase 0: Decide whether a plan should be created

Choose one outcome:

### Outcome A: `skip`

Use when:

- the task is tiny and still safely fits `direct`
- no durable handoff or written scope is needed
- the user did not explicitly ask for a plan artifact

In this case, return a short note that direct execution is sufficient.

### Outcome B: `plan`

Use when:

- the task needs written implementation guidance or handoff
- the task is a normal feature, non-trivial bugfix, or non-trivial refactor
- requirements are clear enough that one implementation-focused artifact is sufficient

### Outcome C: `plan+summary`

Use when:

- orchestration is active
- multiple roles or sessions need the same durable context
- conflict scanning or follow-up checkpoints benefit from a short summary artifact

Do not create a second heavier artifact type just because the task is larger. Keep the main artifact as `Implementation Plan` and add only the optional sections the task really needs.

If the task still lacks a stable WHAT, WHY, or MVP boundary, stop and route back to `prd` instead of inventing requirements inside the plan.

If the task lacks stable HOW at system level, stop and route to `architect` instead of inventing architecture inside the plan.

## Phase 1: Gather context

Always read:

1. `.claude/project-profile.md`
2. the user's goal
3. dependency manifests such as `go.mod`, `package.json`, `pyproject.toml`, or equivalents
4. the most relevant implementation and test files in the target area

Read these only when they clearly matter:

1. `PRD.md`
2. `ARCHITECTURE.md`
3. prior plans that define dependencies or conventions

Extract:

- exact target files or candidate files
- nearby patterns to reuse
- relevant libraries and tooling
- local validation commands
- obvious risks, sequencing needs, or unknowns

## Phase 2: Write the Implementation Plan

Default to one implementation-focused artifact.

Recommended structure:

```markdown
# Implementation Plan: [Title]

**Status**: ready-for-dev
**Task Class**: [bugfix|feature|refactor|release-follow-up|exploration]
**Goal**: [one-sentence outcome]

## Context
- why this work exists
- relevant repo facts only

## Scope
- what is in scope
- what is explicitly out of scope when useful

## Target Files / Modules
- `path/to/file`

## Implementation Steps
1. concrete step
2. concrete step

## Validation
- nearest tests, lint, or build checks to run

## Risks / Notes
- only meaningful risks or caveats
```

Optional sections when complexity justifies them:

- `## Technical Approach`
- `## Dependencies / Sequencing`
- `## Open Questions`

Use `Technical Approach` only when the task needs an explicit design choice, interface change, or architectural tradeoff. Do not default to a separate technical design document for normal work.

## Phase 3: Write artifact paths

### Main plan

- prefer a durable path such as `plans/[slug].md` unless the project already has a naming convention
- do not invent ticket IDs or numbered plan IDs unless the repository already uses them

### Optional plan summary

- create a summary only when orchestration is active and the summary will actually help
- use a durable path such as `plans/[slug]-summary.md` unless the project already has a convention

Summary content should stay short and include only:

- full plan path
- status
- key scope bullets
- planned files
- dependencies or handoff notes
- major risks

## Phase 4: Validate the output

Before finishing:

- ensure the plan matches the real repository context
- ensure planned files are real or intentionally new
- ensure the plan stays implementation-focused rather than generic theory
- ensure optional sections are present only when they add real value
- ensure the summary never adds requirements missing from the main plan

## Output contract

Return:

- selected outcome: `skip`, `plan`, or `plan+summary`
- plan path if created
- summary path if created
- blockers or open questions
- next recommended step
