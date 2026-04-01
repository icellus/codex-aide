---
name: submit
description: "Use for governed post-validation delivery: commit, push, and optional post-push delivery steps."
---

You handle the governed delivery path after implementation and validation are ready.

When delegation is available, prefer a fresh `submit_worker`.

## Read Order

1. `.codex/state/task-context.json` when it exists
2. `.codex/policies/delivery-policy.json`
3. `.codex/state/submit-preferences.json` when it exists
4. `.codex/policies/validation-profile.json`
5. `.codex/context/project-profile.md` when repo facts or human summary are needed
6. current git status, branch, remotes, upstream, and changed files
7. the user's explicit request

Before commit or push decisions, run `node .codex/scripts/submit/plan-delivery.mjs` to evaluate deterministic delivery gates and submit preferences.
For standardized commit/push execution, prefer `node .codex/scripts/submit/execute-delivery.mjs`.

## Activation

Use `submit` when:

- a task is ready to move from local completion into governed delivery
- QC is disabled and a real `coder` completion or settled-task signal exists
- QC passed and the next step is commit, push, or post-push delivery
- the user explicitly asks to commit, push, or finish the delivery flow

Do not use `submit` to replace `qc`.
If QC is enabled and has not passed, stop and report that `submit` is waiting for QC.

## Delivery Stages

Run stages in this order:

1. `commit`
2. `push`
3. `notify`
4. `ci`
5. `release`

Disabled or unconfigured stages should return `skipped`, not `blocked`.

## Commit Rules

- obey `.codex/policies/delivery-policy.json`
- protected branches such as `main` and `master` must not receive direct commits
- when the policy says `ask_once`, consult `.codex/state/submit-preferences.json`
- if no repo-local commit preference exists yet, ask whether automatic commit should be allowed for this repository and remember the answer by writing `.codex/state/submit-preferences.json`
- use `node .codex/scripts/submit/plan-delivery.mjs` with `action=set-commit-preference` to persist the answer before retrying the gate
- `.codex/state/*.demo.json` documents the state file structure
- if the policy requires a work branch, ask before creating it
- default to one automatic commit per task; if another commit is needed, ask again
- do not auto-amend unless the policy explicitly allows it
- respect `max_auto_commits_per_task`; when the limit is reached, ask again before another automatic commit
- when execution is approved, prefer `node .codex/scripts/submit/execute-delivery.mjs` so commit message generation and gate re-check stay consistent

## Push Rules

- never push before a successful commit when commit is required
- when the push preference is still `ask_once`, consult `.codex/state/submit-preferences.json`
- push preferences are tracked per remote, not by a central remote whitelist
- if no repo-local preference exists for the target remote yet, ask whether automatic push should be allowed for that remote and remember the answer by writing `.codex/state/submit-preferences.json`
- use `node .codex/scripts/submit/plan-delivery.mjs` with `action=set-push-preference` to persist the answer before retrying the gate
- if the target remote branch does not exist yet and policy says `create_remote_branch_when_missing=ask`, ask before the first push that would create it
- if no upstream exists, ask before setting it
- if push is skipped or blocked, stop there and report the remaining post-push stages as `skipped`
- when execution is approved, prefer `node .codex/scripts/submit/execute-delivery.mjs` so push and post-push stage planning share the same gate contract

## Post-Push Rules

- `notify`, `ci`, and `release` are optional delivery stages
- if the project does not configure a stage, mark it `skipped:not-configured`
- for the starter default, a stage is considered configured only when its policy block is enabled and `command` is non-empty
- prefer report-first behavior for CI or release unless policy explicitly allows stronger automation
- when a stage fails because of environment, permissions, or missing signals, stop and report the blocker

## Stage Command Contract

- `notify`, `ci`, and `release` may each provide a shell `command` in `.codex/policies/delivery-policy.json`
- commands run from the repository root after a successful push
- commands receive these environment variables:
  - `CODEX_PROJECT_DIR`
  - `CODEX_DELIVERY_STAGE`
  - `CODEX_DELIVERY_REMOTE`
  - `CODEX_DELIVERY_BRANCH`
  - `CODEX_DELIVERY_COMMIT_SHA`
- if a stage needs local stage-result files, prefer writing under `.codex/artifacts/delivery/` so later submit inspection does not treat them as delivery worktree drift
- keep stage commands idempotent and project-local; avoid hiding complex release policy inside the starter
- if a stage command exits non-zero, mark that stage `blocked` and skip the remaining post-push stages

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
