---
name: submit
description: "Use for governed post-validation delivery: commit, push, and optional post-push delivery steps."
---

You handle the governed delivery path after implementation and validation are ready.

When delegation is available, prefer a fresh `submit_worker`.

## Read Order

1. `.codex/aide/state/task-context.json` when it exists
2. `.codex/aide/policies/delivery-policy.json`
3. `.codex/aide/state/submit-preferences.json` when it exists
4. `.codex/aide/policies/validation-profile.json`
5. `.codex/aide/context/project-profile.md` when repo facts or human summary are needed
6. current git status, branch, remotes, upstream, and changed files
7. the user's explicit request

Before commit or push decisions, run `node .codex/aide/scripts/submit/plan-delivery.mjs` to evaluate deterministic delivery gates and submit preferences.
For standardized commit/push execution, prefer `node .codex/aide/scripts/submit/execute-delivery.mjs`.

## Activation

Use `submit` when:

- a task is ready to move from local completion into governed delivery
- QC is disabled and a real `coder` completion or settled-task signal exists
- QC passed and the next step is commit, push, or post-push delivery
- the user explicitly asks to commit, push, or finish the delivery flow
- `submit_policy=manual` suppresses auto-queueing only; explicit commit/push requests still must use `submit`

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

- obey `.codex/aide/policies/delivery-policy.json`
- protected branches such as `main` and `master` must not receive direct commits
- when the policy says `ask_once`, consult `.codex/aide/state/submit-preferences.json`
- if no repo-local commit preference exists yet, ask whether automatic commit should be allowed for this repository and remember the answer by writing `.codex/aide/state/submit-preferences.json`
- use `node .codex/aide/scripts/submit/plan-delivery.mjs` with `action=set-commit-preference` to persist the answer before retrying the gate
- `.codex/aide/state/*.demo.json` documents the state file structure
- if the policy requires a work branch, ask before creating it
- default to one automatic commit per task; if another commit is needed, ask again
- do not auto-amend unless the policy explicitly allows it
- respect `max_auto_commits_per_task`; when the limit is reached, ask again before another automatic commit
- when execution is approved, prefer `node .codex/aide/scripts/submit/execute-delivery.mjs` so commit message generation and gate re-check stay consistent
- do not run raw `git commit` on the main thread; governed delivery must go through `submit`

## Push Rules

- never push before a successful commit when commit is required
- when the push preference is still `ask_once`, consult `.codex/aide/state/submit-preferences.json`
- push preferences are tracked per remote, not by a central remote whitelist
- if no repo-local preference exists for the target remote yet, ask whether automatic push should be allowed for that remote and remember the answer by writing `.codex/aide/state/submit-preferences.json`
- use `node .codex/aide/scripts/submit/plan-delivery.mjs` with `action=set-push-preference` to persist the answer before retrying the gate
- if the target remote branch does not exist yet and policy says `create_remote_branch_when_missing=ask`, ask before the first push that would create it
- if no upstream exists, ask before setting it
- if push is skipped or blocked, stop there and report the remaining post-push stages as `skipped`
- when execution is approved, prefer `node .codex/aide/scripts/submit/execute-delivery.mjs` so push and post-push stage planning share the same gate contract
- do not run raw `git push` on the main thread; governed delivery must go through `submit`

## Post-Push Rules

- `notify`, `ci`, and `release` are optional delivery stages
- if the project does not configure a stage, report `status=skipped` with `reason=not-configured`
- for the starter default, a stage is considered configured only when its policy block is enabled and `command` is non-empty
- prefer report-first behavior for CI or release unless policy explicitly allows stronger automation
- when a stage fails because of environment, permissions, or missing signals, stop and report the blocker

## Stage Command Contract

- `notify`, `ci`, and `release` may each provide a shell `command` in `.codex/aide/policies/delivery-policy.json`
- commands run from the repository root after a successful push
- commands receive these environment variables:
  - `CODEX_PROJECT_DIR`
  - `CODEX_DELIVERY_STAGE`
  - `CODEX_DELIVERY_REMOTE`
  - `CODEX_DELIVERY_BRANCH`
  - `CODEX_DELIVERY_COMMIT_SHA`
- if a stage needs local stage-result files, prefer writing under `.codex/aide/artifacts/delivery/` so later submit inspection does not treat them as delivery worktree drift
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

When the repository already has an open hot task, record a turn-result payload through `node .codex/aide/scripts/context/record-turn-result.mjs` so the Stop hook can sync this delivery turn back into the same task.
Use `task_update.sync=true` to keep the current hot task warm even when submit does not change lifecycle semantics.
Only set `task_update.status` when submit truly changes the hot-task lifecycle.
Do not mark a task `completed` only because push succeeded; keep `waiting_user` or other non-terminal states when real follow-up still remains.
Do not append raw protocol payloads to the user-visible reply.

Then record:

````markdown
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
  "task_update": {
    "sync": true,
    "status": "active|handoff|blocked|waiting_user|completed|cancelled"
  },
  "blockers": []
}
```
````
