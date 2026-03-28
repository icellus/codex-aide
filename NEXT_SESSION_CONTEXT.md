# Next Session Context

Updated: 2026-03-29 UTC

## Current Goal

This repository has been hardened around `codex-starter`, especially the `Aide` role.
The near-term direction is not adding more abstract framework layers. The direction is:

- run real tasks in real repos
- collect real hook/session logs
- analyze where `Aide` still drifts
- tighten authority, routing, and tests based on those real traces

The user explicitly said the next phase will continue in that direction.

## What Was Finished

### 1. Repo-local runtime logging

Already completed and pushed earlier:

- repo-local `.codex/config.toml` only enables `codex_hooks`
- repo-local `.codex/hooks.json` and hook logger were added
- install flow preserves existing state/logs
- missing baseline state files are seeded only when absent

Previous commit:

- `b2623bc`
- `fix: enable repo-local codex hooks logging`

### 2. Aide repositioning

The major reframing is now:

- `Aide` is the user's team secretary and the team's people manager
- `Aide` is not the default implementer
- `Aide` should not expose internal workflow terms to users unless the user explicitly asks about system design
- `Aide` should delegate concrete implementation work early
- `Aide` should not deep-read code just to feel informed when another role will read it again

### 3. Staffing and routing rules

The authority now explicitly says:

- start with the smallest active team
- do not wake the whole team just because the repo is new or context is thin
- drop extra roles again when the task narrows
- `repo_explorer` is the default short-lived read-only helper for ownership/boundary discovery
- `conduct` owns environment setup decisions and preparation

### 4. New boundary added from real-log review

After reviewing a real `docker-infra` session, the authority was tightened further:

- read-heavy analysis should default to `Aide -> repo_explorer -> Aide`
- `Aide` should stay user-facing and synthesis-oriented
- `Aide` should not be the one doing heavy repository spelunking plus runtime validation by default
- when a new task chain starts and read-heavy or multi-step delegation has real value, prefer real subagents to keep the main thread context clean

### 5. Test coverage expanded heavily

There are now multiple layers of `Aide` tests:

- contract tests
- mutation guard tests
- black-box behavior tests
- integrated smoke coverage

Important test files now include:

- [aide-dialogue.contract.mjs](/workspace/agent-skills/codex-starter/tests/aide-dialogue.contract.mjs)
- [aide-staffing.contract.mjs](/workspace/agent-skills/codex-starter/tests/aide-staffing.contract.mjs)
- [aide-authority-alignment.contract.mjs](/workspace/agent-skills/codex-starter/tests/aide-authority-alignment.contract.mjs)
- [aide-baseline.contract.mjs](/workspace/agent-skills/codex-starter/tests/aide-baseline.contract.mjs)
- [aide-conflict.contract.mjs](/workspace/agent-skills/codex-starter/tests/aide-conflict.contract.mjs)
- [aide-routing-matrix.contract.mjs](/workspace/agent-skills/codex-starter/tests/aide-routing-matrix.contract.mjs)
- [aide-baseline.mutation.mjs](/workspace/agent-skills/codex-starter/tests/aide-baseline.mutation.mjs)
- [aide-conflict.mutation.mjs](/workspace/agent-skills/codex-starter/tests/aide-conflict.mutation.mjs)
- [aide-routing-matrix.mutation.mjs](/workspace/agent-skills/codex-starter/tests/aide-routing-matrix.mutation.mjs)
- [aide-reply-behavior.mjs](/workspace/agent-skills/codex-starter/tests/aide-reply-behavior.mjs)
- [aide-delegation-behavior.mjs](/workspace/agent-skills/codex-starter/tests/aide-delegation-behavior.mjs)
- [aide-adversarial-behavior.mjs](/workspace/agent-skills/codex-starter/tests/aide-adversarial-behavior.mjs)
- [runtime-hooks.smoke.mjs](/workspace/agent-skills/codex-starter/tests/runtime-hooks.smoke.mjs)

## Real-Log Findings That Matter

Logs were imported temporarily from `/workspace/docker-infra/.codex/logs`, analyzed, then the temporary copies were deleted.

Main findings from that real run:

- runtime hook chain itself was healthy
- `startup-context -> task-overview -> aide-evolution -> session-context` all ran successfully
- `Aide` did not leak internal workflow terms in the final answer
- `Aide` did not claim implementation ownership in the final answer
- reply quality was acceptable, but still slightly too much like a technical memo
- the bigger issue was behavioral: `Aide` did too much deep reading and runtime verification itself

That is what drove the new rule:

- read-heavy analysis should go through `repo_explorer`

Also confirmed:

- environment/setup issues should not be assigned to `tester` or `coder`
- they belong to `conduct`

## User Preferences Learned In This Workflow

These are important and should be preserved in future work:

- Default to Chinese.
- Keep the literal address `Boss`.
- The user strongly prefers `Aide` to feel like a real secretary / coordinator / people manager.
- The user does not want `Aide` to sound like a workflow engine or generic AI.
- The user does not want internal terms such as `intake`, `route`, `delivery mode`, and similar words exposed to the user-facing reply.
- The user does not want `Aide` to become a catch-all super-controller.
- Governance, audit, and evolution should still stay with `Aide`.
- Heavy repository analysis should not be pushed to `tester`.
- Heavy repository analysis should also not default to `coder`.
- Environment setup and readiness judgment should be treated as `conduct` responsibility.
- When a new task chain starts, prefer real subagents if that keeps the main thread clean and saves context/token budget.
- The user is comfortable using multiple subagents for independent testing.
- The user wants temporary files cleaned before final submission.
- The user wants a strong preference for real-world evidence over theoretical prompt polishing.

## Current Direction

The expected next loop is:

1. run real tasks in another repo
2. collect real `.codex/logs`
3. import and analyze them
4. identify where `Aide` still overreaches or sounds wrong
5. tighten authority/tests again

This is the main product direction now.

## Good Next Steps

When work resumes, likely useful next tasks are:

1. add a lightweight log-analysis script so real imported hook/session logs can be summarized automatically
2. add explicit automation that flags:
   - read-heavy `Aide` turns
   - excessive tool count on an `Aide` turn
   - `PreToolUse` / `PostToolUse` mismatch
   - replies that look too memo-like or too workflow-heavy
3. keep tuning `Aide`'s reply style toward:
   - conclusion first
   - next responsible party
   - next step
   - short human reason
4. if environment work starts recurring, consider whether `conduct` needs stronger execution guidance or a dedicated environment worker in the future

## Validation Baseline

Before this context file was written, the main integrated check passed:

```bash
node codex-starter/tests/runtime-hooks.smoke.mjs
```

If future edits touch `Aide`, `conduct`, routing, or test behavior, rerun the same smoke test first.

## Working Notes

- Temporary imported log copies were intentionally removed before close-out.
- This context file is intended to make the next session resumable without reconstructing the whole history.
- If another real-log sample is brought in next time, analyze that first before adding more framework changes.
