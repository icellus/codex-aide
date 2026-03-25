# Skill: conduct
# Description: Optional internal delivery router that upgrades workflow only when the current task truly needs it and owns optional workspace prep

You decide whether the task should stay direct, become plan-driven, or become orchestrated. Default to the lightest viable path and only add durable workflow when the task, risk, or handoff pattern clearly justifies it.

## Sources of truth

- `.claude/project-profile.md` is the first place to read for task class, risk, and recommended delivery mode
- the user's stated goal is part of the routing decision
- repository signals help confirm size, shared surface area, and validation depth
- a `PRD.md` matters only when the `prd` module is active
- an `ARCHITECTURE.md` matters only when the `architect` module is active
- `PROGRESS.md` matters only when orchestration is active
- an `Implementation Plan` matters only when the `plan` module is active

## Core routing model

Route every task on two axes:

- Task class: `bugfix`, `feature`, `refactor`, `release`, `exploration`
- Delivery mode: `direct`, `plan-driven`, `orchestrated`

Optional durable state has three tiers:

- `none`: no `PROGRESS.md`
- `minimal`: lightweight cross-session or multi-step tracking
- `release`: release-specific checkpoints, promotion notes, and follow-through tracking

Use this default routing table before applying task-specific overrides:

| Task class | Default mode | Add `prd` when... | Add `architect` when... | Add `plan` when... | Add orchestration when... |
|------------|--------------|-------------------|-------------------------|--------------------|---------------------------|
| `bugfix` | `direct` | the fix is really a behavior or scope decision, not just a local repair | the fix changes shared interfaces, integrations, or cross-module flow | the failure boundary is unclear, the fix crosses multiple modules, or a written handoff helps | the work is cross-session, blocked, higher-risk, or requires explicit coordination |
| `feature` | `plan-driven` | MVP, user-visible scope, or success criteria need clarification | the feature needs system design, new interfaces, or integration flow decisions | keep this as the normal baseline; create one implementation plan by default | the feature spans multiple sessions, branches, owners, or release checkpoints |
| `refactor` | `direct` | the refactor changes user-visible behavior or requires product tradeoffs | the refactor changes component boundaries, contracts, or system responsibilities | the refactor needs a written contract, acceptance boundary, or broader handoff | the refactor is staged, cross-session, or touches shared interfaces with coordination risk |
| `release` | `orchestrated` | release scope cuts or ship/no-ship product decisions need clarification | the release includes non-trivial technical rollout or system design changes | the release includes non-trivial code changes that need an implementation plan | this is already the baseline; keep the flow checkpoint-based instead of phase-heavy |
| `exploration` | `direct` | the exploration is intended to become scoped product work | the exploration is evaluating architecture, integration shape, or system boundaries | the exploration is turning into committed implementation work | only when the exploration has turned into tracked delivery or release coordination |

## Step 1: Resolve task class and delivery mode

Read:

1. `.claude/project-profile.md`
2. the user's current goal
3. relevant repo signals for scope, risk, and validation

Then choose the lightest valid mode:

- `direct`
  - use when the work is local, clear, and unlikely to need durable coordination
  - do not require an implementation plan, `PROGRESS.md`, or extra roles
- `plan-driven`
  - use when the task benefits from a written `Implementation Plan`
  - this is the default for most real feature work and some non-trivial bugfix or refactor tasks
- `orchestrated`
  - use when the work is multi-step, multi-session, blocked, release-oriented, or needs explicit checkpoints across roles
  - orchestration exists to preserve state and sequencing, not to recreate a heavyweight SDLC

If existing artifacts are heavier than the current task needs, do not force the user through them unless active work already depends on that state.

If the task still lacks a stable WHAT, WHY, or MVP boundary, route to `prd` before creating architecture or implementation plans.

If the task has stable scope but unclear HOW at system level, route to `architect` before creating an implementation plan.

## Step 2: Activate only the needed modules

Select modules from delivery mode first, then add the smallest justified upgrades:

- `direct`
  - main agent works directly
  - run the narrowest useful validation
  - leave `prd`, `architect`, `plan`, `workspace prep`, `tester`, `coder`, `/qc`, `/follow`, and `PROGRESS.md` off unless the task grows
- `plan-driven`
  - add `prd` first when scope or MVP is still unstable
  - add `architect` when HOW at system level is still unstable
  - use the `plan` skill to create one `Implementation Plan`
  - add `workspace prep` only when execution actually needs isolated workspace or readiness checks
  - add `tester` and `coder` only when explicit red/green separation or handoff value is real
  - keep `PROGRESS.md` off unless the task also needs orchestration
- `orchestrated`
  - enable `conduct`
  - choose a `PROGRESS.md` tier
  - add `prd`, `architect`, `plan`, `workspace prep`, `tester`, `coder`, `/qc`, and `/follow` only when the active checkpoint actually benefits from them

Module trigger rules:

- add `prd` when product scope, MVP, or success criteria need durable clarification
- add `architect` when system boundaries, interfaces, or technical tradeoffs need durable design clarification
- add `plan` when requirements, acceptance boundaries, or handoffs need durable writing
- add `workspace prep` when implementation needs an isolated branch or worktree, dependency bootstrap, local services, or a narrow readiness check before coding or testing can start
- add `tester` when an explicit red or validation-first checkpoint will reduce risk
- add `coder` when a dedicated implementation handoff is useful
- add `/qc` for higher-risk work, user-requested audit, or pre-release confidence checks
- add `/follow` only after push or promotion when CI, deployment, or post-release observation matters

## Step 2b: Decide whether workspace prep is needed

`workspace prep` is an internal execution-preparation capability owned by `conduct`.

It is not a user-facing role, and it is not part of `/Aide` intake or governance work.

Default policy:

- skip `workspace prep` unless execution is about to start and there is a concrete reason to prepare the workspace
- reuse the current workspace when it is already suitable
- create a new branch or worktree only when isolation is genuinely useful
- run only the narrowest readiness checks needed for the current task

Typical reasons to run `workspace prep`:

- this is the first real implementation checkpoint in the current workspace and readiness is unknown
- local dependencies must be installed or refreshed before coding or testing
- local services, databases, or containers must be started for the task
- repo signals changed enough to invalidate previous readiness assumptions
- parallel work or risk isolation justifies a separate branch or worktree

Typical reasons to skip `workspace prep`:

- small bugfixes, docs-only work, prompt or config edits, and other narrow changes
- the current workspace is already ready and the relevant repo signals have not changed
- the task does not need local runtime services or extra bootstrap
- the task is still in intake, governance, planning, or release coordination rather than active implementation

When `workspace prep` runs, choose the lightest scope:

- `current-workspace`: reuse the current checkout, run minimal bootstrap, and confirm the narrow readiness signal
- `isolated-workspace`: create a dedicated branch or worktree only when parallelism, safety, or repository policy makes it worthwhile

Record `workspace prep` status in `PROGRESS.md` only when orchestration is active. Otherwise keep it lightweight and local to the current delivery run.

## Step 3: Create or load durable state only when orchestrated

When orchestration is active:

1. read `PROGRESS.md` if it already exists
2. if it does not exist, choose the template:
   - use `.claude/templates/progress.release.md` for `release` work or any task whose main checkpoints are promotion, deployment, or post-push follow-through
   - use `.claude/templates/progress.md` for all other orchestrated work
3. keep the active entry lightweight and practical

Every active entry should capture only the state needed to resume safely:

- task class
- delivery mode
- current checkpoint
- active roles or modules
- linked implementation plan path when one exists
- validation plan
- next step
- meaningful risks, blockers, or pending decisions

Do not invent ticket IDs, branch names, or environment names unless the project already uses them.

## Step 4: Run a conflict scan before handoffs

Before launching `tester`, `coder`, `/qc`, or additional orchestrated work, scan active durable state for collisions.

Check for:

- overlapping planned file paths
- overlapping shared modules or interfaces
- an existing branch, worktree, or task artifact for the same work item when this project uses those concepts

If conflicts exist, stop and report them before continuing.

## Step 5: Use checkpoints instead of heavyweight fixed phases

Prefer short checkpoint flows over old multi-document stage gates.

Suggested checkpoint sets:

- `direct`: `scan -> implement -> validate -> done`
- `plan-driven`: `plan -> implement -> validate -> done`
- `orchestrated` with `minimal` progress: `align -> implement -> validate -> handoff`
- `orchestrated` with `release` progress: `readiness -> pre-release-checks -> promote -> follow-through -> close`

Execution rules:

- move only to the next unresolved checkpoint
- do not create `PRD.md`, `ARCHITECTURE.md`, or extra handoff files just to satisfy an old process habit
- update `.claude/project-profile.md` if role or module policy changes durably
- update `PROGRESS.md` immediately after each orchestrated checkpoint completes or blocks

## Step 6: Handle blockages with a concrete handoff

If work cannot continue, write a blocked handoff instead of a vague status note.

Use this structure:

```markdown
## Blocked Handoff
**Checkpoint**: [align|implement|validate|promote|follow-through]
**Attempted Fixes**:
1. [What was tried]
2. [What was tried]

**Failure Evidence**:
- `file:line`
- command output snippet

**Suggested Manual Fix**:
- [Concrete next action]

**Resume Point**:
- Re-run from [checkpoint] after [condition]
```

## Step 7: Retrospective only when durable coordination adds value

When orchestrated work pauses, hands off, or reveals a reusable lesson:

- add a short decision note or retrospective to `PROGRESS.md`
- preserve evidence, not speculation
- route durable rules back through `/Aide` only when the lesson is stable enough to keep

Avoid retrospectives for direct work unless the user explicitly wants a write-up.

## Output contract

Return:

- selected task class
- selected delivery mode
- progress tier: `none`, `minimal`, or `release`
- activated roles and modules
- whether `prd` should run first
- whether `architect` should run before `plan`
- workspace prep decision: `skip`, `current-workspace`, or `isolated-workspace`
- current checkpoint, if any
- next action taken
- minimal validation plan
- conflicts or blockers, if any
