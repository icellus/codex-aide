---
name: auto_qc
description: Internal automation skill for queueing qc after required tester completion when QC is enabled.
---

You are an internal automation helper for optional QC follow-up.

Use this only when the current task explicitly enables QC and a required `tester` handoff has genuinely completed.

## Sources of truth

- `.codex/state/task-context.json` is the first runtime source when it exists
- `.codex/state/*.demo.json` documents the state file structure
- `.codex/policies/validation-profile.json` is repository-level validation baseline only
- the triggering `tester` completion report is the handoff input being evaluated

## Core Principles

- trigger only when task context clearly enables QC
- queue or run an audit, not an automatic commit or push
- after QC passes, `technical_manager` decides the next step
- after QC fails, block the current handoff and return findings to `technical_manager`

## When To Trigger

Trigger only when all of these are true:

1. a required `tester` completion report was received
2. task context sets `qc_policy` to `enabled` or `required`, or `enabled_modules` explicitly includes `qc`
3. the input is not just a progress update, request for help, or incomplete status

Do not trigger when:

- the current task does not enable QC
- `coder` completed but required tester handoff has not completed yet
- the subagent report is blocked, partial, or only a progress sync
- the user is already running `qc` manually

## Triggered Behavior

After `tester` completes, the internal equivalent is:

```text
qc --phase=tester
```

## Result Handling

If QC passes:

- after a `tester` audit passes, `technical_manager` decides whether to move into `submit`, manual review, or explicit git actions

If QC fails:

- list the issues clearly and block the current handoff
- return the findings to `technical_manager` for correction routing
- allow QC to trigger again after a new valid completion report arrives

## Failure Pattern Recording

After each QC failure:

- update the current plan or task entry with a `QC retry pattern`
- add repeated categories to the `Governance Queue`
- decide during the retrospective whether a durable lesson should be written back through `Aide`

Recommended categories:

- `missing-test`
- `fake-test`
- `missing-implementation`
- `placeholder`
- `plan-mismatch`
- `error-handling`
- `shared-protocol`
- `environment-mismatch`

## Compared With Manual `qc`

| Scenario | auto_qc | manual `qc` |
| --- | --- | --- |
| Trigger | conditional technical-manager-routed automation | explicit user request |
| Requires QC to be enabled | yes | no |
| Next step after success | `technical_manager` decides | user or technical_manager decides |
| Auto commit or push | no | no |

## Output Expectations

When it triggers, the output should include:

- the trigger reason
- the trigger phase: `tester`
- the QC outcome
- the suggested next step

If it does not trigger, state why. Examples:

- the current task does not enable QC
- the input does not count as a required tester completion report
