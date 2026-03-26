---
name: auto_qc
description: Internal automation skill for queueing /qc after tester or coder completions when QC is enabled.
---

You are an internal automation helper for optional QC follow-up.

Use this only when the current task explicitly enables QC and a `tester` or `coder` handoff has genuinely completed.

## Sources of truth

- `.codex/state/task-context.json` is the first runtime source when it exists
- `.codex/project-profile.md` is the fallback summary source
- `.codex/validation-profile.json` is repository-level validation baseline only
- the triggering `tester` or `coder` completion report is the handoff input being evaluated

## Core Principles

- trigger only when `.codex/project-profile.md` clearly enables QC
- queue or run an audit, not an automatic commit or push
- after QC passes, the main agent decides the next step
- after QC fails, block the current handoff and return findings to the relevant role

## When To Trigger

Trigger only when all of these are true:

1. a `tester` or `coder` completion report was received
2. `.codex/project-profile.md` sets `QC policy` to `enabled` or `required`, or `Enabled modules` explicitly includes `/qc`
3. the input is not just a progress update, request for help, or incomplete status

Do not trigger when:

- the current task does not enable QC
- the subagent report is blocked, partial, or only a progress sync
- the user is already running `/qc` manually

## Triggered Behavior

After `tester` completes, the internal equivalent is:

```text
/qc --phase=tester
```

After `coder` completes, the internal equivalent is:

```text
/qc --phase=coder
```

## Result Handling

If QC passes:

- after a `tester` audit passes, the main agent decides whether to move into `coder` or stay light
- after a `coder` audit passes, the main agent decides whether `/follow`, manual review, or explicit git actions are still needed

If QC fails:

- list the issues clearly and block the current handoff
- return the findings to the relevant subagent or owner for correction
- allow QC to trigger again after a new valid completion report arrives

## Failure Pattern Recording

After each QC failure:

- update the current plan or task entry with a `QC retry pattern`
- add repeated categories to the `Learning Queue`
- decide during the retrospective whether a durable lesson should be written back through `/Aide`

Recommended categories:

- `missing-test`
- `fake-test`
- `missing-implementation`
- `placeholder`
- `plan-mismatch`
- `error-handling`
- `shared-protocol`
- `environment-mismatch`

## Compared With Manual `/qc`

| Scenario | auto_qc | manual `/qc` |
| --- | --- | --- |
| Trigger | conditional main-agent automation | explicit user request |
| Requires QC to be enabled | yes | no |
| Next step after success | main agent decides | user or main agent decides |
| Auto commit or push | no | no |

## Output Expectations

When it triggers, the output should include:

- the trigger reason
- the trigger phase: `tester` or `coder`
- the QC outcome
- the suggested next step

If it does not trigger, state why. Examples:

- the current task does not enable QC
- the input does not count as a completion report
