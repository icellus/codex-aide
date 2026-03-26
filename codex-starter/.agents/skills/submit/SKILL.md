---
name: submit
description: "Use for governed post-validation delivery: commit, push, and optional post-push delivery steps."
---

You handle the governed delivery path after implementation and validation are ready.

When delegation is available, prefer a fresh `submit_worker`.

## Read Order

1. `.codex/state/task-context.json` if present, else `.codex/project-profile.md`
2. `.codex/delivery-policy.json`
3. `.codex/validation-profile.json`
4. current git status, branch, remotes, upstream, and changed files
5. the user's explicit request

## Activation

Use `/submit` when:

- a task is ready to move from local completion into governed delivery
- QC is disabled and a real `coder` completion or settled-task signal exists
- QC passed and the next step is commit, push, or post-push delivery
- the user explicitly asks to commit, push, or finish the delivery flow

Do not use `/submit` to replace `/qc`.
If QC is enabled and has not passed, stop and report that `/submit` is waiting for QC.

## Delivery Stages

Run stages in this order:

1. `commit`
2. `push`
3. `notify`
4. `ci`
5. `release`

Disabled or unconfigured stages should return `skipped`, not `blocked`.

## Commit Rules

- obey `.codex/delivery-policy.json`
- protected branches such as `main` and `master` must not receive direct commits
- when the policy says `ask_once`, ask whether to act this time or remember the repo-local default
- if the policy requires a work branch, ask before creating it
- default to one automatic commit per task; if another commit is needed, ask again
- do not auto-amend unless the policy explicitly allows it

## Push Rules

- never push before a successful commit when commit is required
- respect allowed remotes and upstream settings from `.codex/delivery-policy.json`
- when the push preference is still `ask_once`, ask whether to push now or remember the repo-local default
- if no upstream exists, ask before setting it
- if push is skipped or blocked, stop there and report the remaining post-push stages as `skipped`

## Post-Push Rules

- `notify`, `ci`, and `release` are optional delivery stages
- if the project does not configure a stage, mark it `skipped:not-configured`
- prefer report-first behavior for CI or release unless policy explicitly allows stronger automation
- when a stage fails because of environment, permissions, or missing signals, stop and report the blocker

## Output Contract

Return:

- overall status: `complete` or `blocked`
- whether QC was required and satisfied
- commit result
- push result
- notify result
- CI result
- release result
- next recommended step

Then append:

````markdown
## Structured Result
```json
{
  "role": "submit",
  "status": "complete|blocked",
  "qc_status": "not-needed|passed|waiting",
  "commit": {
    "status": "done|skipped|blocked",
    "branch": "",
    "commit_sha": ""
  },
  "push": {
    "status": "done|skipped|blocked",
    "remote": "",
    "branch": ""
  },
  "notify": {
    "status": "done|skipped|blocked"
  },
  "ci": {
    "status": "done|skipped|blocked"
  },
  "release": {
    "status": "done|skipped|blocked"
  },
  "blockers": []
}
```
````
