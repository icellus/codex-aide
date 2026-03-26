# Usage

This document explains usage patterns.
Runtime authority lives in `AGENTS.md`, `.agents/skills/*/SKILL.md`, and `.codex/routing-policy.md`.

## Install

1. Copy `AGENTS.md`, `.agents/skills/`, `.codex/`, and `.product/` into the target repository root.
2. Ensure `node` is available on `PATH` if you want runtime helpers or smoke tests.
3. Start with `/Aide`.

You can also install from the target repository root with:

```bash
bash /path/to/codex-starter/install.sh
```

The installer recursively overwrites the starter files and ignores the copied starter files as a whole in `.gitignore`:
`AGENTS.md`, `.agents/`, `.codex/`, and `.product/`.

## First Run

Use one of:

```text
/Aide
/Aide Fix the login callback bug
```

If a fresh thread starts without a slash command, treat the first user turn as `/Aide` intake by default.

On first run, `/Aide` should:

- greet briefly
- scan the repo
- update `.codex/state/task-context.json`
- update `.codex/state/repo-context.json`
- update `.codex/project-profile.md`
- update `.codex/validation-profile.json` with repository validation baseline signals
- recommend the lightest route for the task

There is currently no dedicated repo-scan script.
`/Aide` performs repo scans through targeted repository inspection and optional read-only exploration.

Later turns should usually:

- skip repeat greetings
- report the current active task and unfinished historical tasks first
- reuse stored state
- mention routing changes only when they really changed
- start the low-cost evolution sweep without blocking the route

If the current turn is only Q&A, analysis, discussion, or option comparison and the user is not asking for a durable artifact:

- `/Aide` answers directly
- execution roles stay disabled by default
- durable state is not written by default
- only the minimum context needed for a good answer should be read

The checked-in `.codex/*.json`, `.codex/project-profile.md`, and `.product/*.json` files are starter defaults. Real projects should evolve them during normal use.

## Commands

| Command | Use it when |
| --- | --- |
| `/Aide` | intake, routing, governance, refresh state |
| `/qc` | you want an explicit audit on coding-line work |
| `/submit` | coding-line work is ready for governed delivery |

## Typical Routes

| Task | Typical route |
| --- | --- |
| small bugfix | `/Aide -> coder -> sanity checks -> /submit` |
| higher-risk bugfix | `/Aide -> tester -> coder -> tester or /qc -> /submit` |
| feature | `/Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> optional /qc -> /submit` |
| discussion / Q&A | `/Aide` direct |
| product | `/Aide -> product_assistant` |
| release | `/Aide -> conduct -> optional /qc -> /submit` |

## Product Tasks

Use the product line when the primary deliverable is a non-code artifact.

Examples:

- documentation
- API descriptions
- structured content files
- package artifacts
- non-code project deliverables

For product tasks:

- `/Aide` routes to `product_assistant`
- `tester`, `/qc`, and `/submit` are normally not involved
- `product_assistant` may use technical materials when needed
- `.product/*` writeback should stay lightweight
- `/Aide` should review the real chat record before accepting long-term memory or evolution updates

If completion is still ambiguous, `/Aide` should ask the user for light feedback instead of forcing a rigid checklist.

## Coding Tasks

Use the coding line when the primary deliverable is:

- implementation
- a behavior change
- task-level validation
- governed delivery

For non-trivial behavior changes, `tester` owns task-level validation handoff.

## Runtime Helpers

Useful entrypoints:

1. `node .codex/scripts/task-overview.mjs`
2. `node .codex/scripts/aide-evolution.mjs`
3. `node .codex/scripts/aide-governance.mjs`
4. `node .codex/scripts/session-context.mjs`
5. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
6. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

`runtime-state.json` is created on demand. QC reminders appear only when the current task explicitly enables `/qc`.

## Smoke Test

```bash
node tests/runtime-hooks.smoke.mjs
```
