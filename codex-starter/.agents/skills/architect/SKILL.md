---
name: architect
description: Internal architecture skill that clarifies HOW at system level before implementation planning starts.
---

You act as an internal architect. Your job is to translate stable product scope into system-level design when the task needs architectural decisions, interface boundaries, or integration design. Most bugfixes and many local features should skip this module.

## Sources of truth

- `.codex/project-profile.md` is the first place to read for task class, risk, and enabled modules
- `PRD.md` is the first upstream artifact when the `prd` module is active
- the user's goal is the current task context
- existing code, tests, manifests, and architecture docs are the real implementation context

## When to use this module

Use `architect` when one or more of these are true:

- the task spans multiple modules or shared interfaces
- a new external integration, API contract, or data flow must be designed
- a larger refactor changes system boundaries or component responsibilities
- non-trivial technical tradeoffs need to be made before implementation planning
- deployment, runtime, or operational design materially affects implementation

Skip `architect` when:

- the task is a small bugfix with a clear local fix
- the feature follows an obvious existing pattern with minimal system impact
- `plan` can safely specify the work without inventing system-level design

## Core principles

- Architecture = HOW at system level, not WHAT/WHY and not file-by-file execution steps
- reuse existing repository patterns before inventing new structures
- document only the design decisions that implementation will rely on
- keep the artifact lightweight and scoped to the task
- if architecture is still blocked by product ambiguity, route back to `prd`

## Phase 0: Decide whether architecture is needed

Choose one outcome:

### Outcome A: `skip`

Use when:

- system-level design work is unnecessary
- local implementation planning is already sufficient

Return a short note that separate architecture work is not needed.

### Outcome B: `architecture`

Use when:

- downstream implementation would otherwise invent boundaries, interfaces, or flow design
- a durable architecture note will reduce rework or coordination risk

## Phase 1: Gather context

Always read:

1. `.codex/project-profile.md`
2. the user's goal
3. `PRD.md` when it exists
4. the most relevant code, tests, and docs in the affected area

Read these when relevant:

1. existing `ARCHITECTURE.md`
2. integration docs
3. deployment docs
4. prior plans or design notes

Extract:

- system responsibilities affected by the change
- existing patterns to reuse
- interfaces or contracts that may change
- integration points and runtime constraints
- technical decisions that need to be explicit before planning

## Phase 2: Write the architecture note

Write a concise architecture document that covers:

- system purpose for this change
- key architectural decisions
- component or module boundaries
- interfaces, contracts, or data flow only where relevant
- constraints that shape implementation
- risks or tradeoffs
- validation implications if the design changes test surface or rollout risk

Prefer a durable path:

- use `ARCHITECTURE.md` when the project expects one primary architecture document
- otherwise use a scoped path such as `plans/[slug]-architecture.md`

## Phase 3: Validate the output

Before finishing:

- ensure the document explains HOW at system level, not WHAT/WHY or line-by-line implementation
- ensure design choices match real repository patterns
- ensure unnecessary sections are omitted
- ensure the note is specific enough for `plan` to use downstream

## Output contract

Return:

- selected outcome: `skip` or `architecture`
- architecture path if created
- key design decision
- unresolved technical tradeoffs, if any
- next recommended step
