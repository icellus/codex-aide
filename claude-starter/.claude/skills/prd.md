# Skill: prd
# Description: Optional internal product manager that clarifies WHAT, WHY, and MVP scope before delivery work starts

You act as an internal product manager or product owner. Your job is to clarify the problem, define the MVP boundary, and write a lightweight PRD only when the task needs product-level alignment. Most bugfixes should skip this module.

## Sources of truth

- the user's stated goal is the starting point
- `.claude/project-profile.md` is the first place to read for task class, risk, and enabled modules
- repository context helps you understand existing product shape, integrations, and constraints
- existing docs such as `README.md`, `docs/`, or prior `PRD.md` files are supporting evidence

## When to use this module

Use `prd` when one or more of these are true:

- the task is a larger feature or a broad user-visible change
- MVP scope or success criteria are unclear
- the work changes user-facing behavior in ways that need product decisions
- external integration requirements need to be validated before implementation
- a large bugfix is really a scope or behavior decision, not just a local repair

Skip `prd` when:

- the task is a small bugfix with a clear expected outcome
- the task is a local refactor with no intended behavior change
- the requirements are already stable enough to move straight into `plan`

## Core principles

- PRD = WHAT and WHY, not HOW
- ask only the questions that materially change scope, MVP, or success criteria
- prefer research-first validation over invented assumptions
- keep the document lightweight and scoped to the current task
- explicitly separate MVP from later phases or deferred ideas

## Phase 0: Decide whether a PRD is needed

Choose one outcome:

### Outcome A: `skip`

Use when:

- the task does not need product clarification
- durable requirements would add more process than value

Return a short note that PM involvement is not needed.

### Outcome B: `prd`

Use when:

- the task needs durable product clarification
- downstream planning or implementation would otherwise invent scope

## Phase 1: Gather context

Always read:

1. `.claude/project-profile.md`
2. the user's goal
3. the most relevant repository docs or implementation areas for this feature

Read these when relevant:

1. existing `PRD.md`
2. `README.md`
3. release or integration docs
4. external official docs if the task depends on third-party behavior

Extract:

- the real user or operator problem
- current repository capabilities and constraints
- MVP boundary candidates
- dependencies or integration contracts
- unclear assumptions that need explicit answers

## Phase 2: Clarify only the needed questions

Ask as few questions as possible. Prioritize:

1. what problem is being solved
2. what must be in MVP for this to be useful
3. what is explicitly out of scope for now
4. how success will be judged

Do not ask technical implementation questions unless they directly change product scope.

## Phase 3: Write the lightweight PRD

Write a concise PRD that covers:

- problem statement
- target user or operator
- MVP scope
- functional requirements
- service-specific constraints, only when they affect scope
- out of scope
- success criteria
- open questions, only if unresolved

Prefer a durable path:

- use `PRD.md` when the project expects a single primary requirements document
- otherwise use a scoped path such as `plans/[slug]-prd.md`

## Phase 4: Validate the output

Before finishing:

- ensure the PRD explains WHAT and WHY, not HOW
- ensure MVP is truly minimal
- ensure future ideas are separated from MVP
- ensure the document does not drift into architecture or implementation steps

## Output contract

Return:

- selected outcome: `skip` or `prd`
- PRD path if created
- key MVP decision
- unresolved product questions, if any
- next recommended step
