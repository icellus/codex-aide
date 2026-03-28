# Usage

This document explains usage patterns.
Runtime authority lives in `AGENTS.md`, `.agents/skills/*/SKILL.md`, and `.codex/routing-policy.md`.

## Install

1. Copy `AGENTS.md`, `.agents/skills/`, `.codex/`, and `.product/` into the target repository root.
2. Ensure `node` is available on `PATH` if you want runtime helpers or smoke tests.
3. Start by describing the goal in plain language.

You can also install from the target repository root with:

```bash
bash /path/to/codex-starter/install.sh
```

The installer refreshes starter-managed files and ignores the copied starter files as a whole in `.gitignore`:
`AGENTS.md`, `.agents/`, `.codex/`, and `.product/`.
It installs a minimal project-local `.codex/config.toml` that only enables repo-local Codex hooks, copies `.codex/hooks.json` and `.codex/hooks/`, seeds baseline `task-context.json`, `repo-context.json`, and `task-registry.json` only when they are missing, preserves existing `.codex/state/` and `.codex/logs/`, and does not seed source runtime history into the target repository.

Route names such as `Aide`, `qc`, and `submit` are logical aliases.
If the client does not support custom slash commands, do not tell the user to type `/Aide`, `/qc`, or `/submit`.
Plain-language requests should map to the same routes.

## First Run

Use one of:

```text
Review the current repo state and pick the lightest route.
Fix the login callback bug.
```

If a fresh thread starts without an explicit supported route alias, treat the first user turn as `Aide` intake by default.

On first run, the default `Aide` intake should:

- greet in Chinese with a warm, lively, contextual line that acknowledges the user's actual first message
- keep the default address as `Boss` unless the user explicitly changes it
- avoid generic "what can I help with" follow-ups after the user already gave a task
- scan the repo
- update `.codex/state/task-context.json`
- update `.codex/state/repo-context.json`
- update `.codex/project-profile.md`
- update `.codex/validation-profile.json` with repository validation baseline signals
- recommend the lightest route for the task

There is currently no dedicated repo-scan script.
`Aide` performs repo scans through targeted repository inspection and optional read-only exploration.

Later turns should usually:

- skip repeat greetings
- report the current active task and unfinished historical tasks first
- reuse stored state
- mention routing changes only when they really changed
- start the low-cost evolution sweep without blocking the route

If the current turn is only Q&A, analysis, discussion, or option comparison and the user is not asking for a durable artifact:

- `Aide` answers directly
- execution roles stay disabled by default
- durable state is not written by default
- only the minimum context needed for a good answer should be read

The checked-in `.codex/*.json`, `.codex/project-profile.md`, and `.product/*.json` files are starter defaults. Real projects should evolve them during normal use.

## Route Aliases

| Alias | Use it when |
| --- | --- |
| `Aide` (`/Aide` when supported) | intake, routing, governance, refresh state |
| `qc` (`/qc` when supported) | you want an explicit audit on coding-line work |
| `submit` (`/submit` when supported) | coding-line work is ready for governed delivery |

## Typical Routes

| Task | Typical route |
| --- | --- |
| small bugfix | `Aide -> coder -> sanity checks -> submit` |
| higher-risk bugfix | `Aide -> tester -> coder -> tester or qc -> submit` |
| feature | `Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> optional qc -> submit` |
| discussion / Q&A | `Aide` direct |
| product | `Aide -> product_assistant` |
| release | `Aide -> conduct -> optional qc -> submit` |

## Product Tasks

Use the product line when the primary deliverable is a non-code artifact.

Examples:

- documentation
- API descriptions
- structured content files
- package artifacts
- non-code project deliverables

For product tasks:

- `Aide` routes to `product_assistant`
- `tester`, `qc`, and `submit` are normally not involved
- `product_assistant` may use technical materials when needed
- `.product/*` writeback should stay lightweight
- `Aide` should review the real chat record before accepting long-term memory or evolution updates

If completion is still ambiguous, `Aide` should ask the user for light feedback instead of forcing a rigid checklist.

## Coding Tasks

Use the coding line when the primary deliverable is:

- implementation
- a behavior change
- task-level validation
- governed delivery

For non-trivial behavior changes, `tester` owns task-level validation handoff.

## Runtime Helpers

Useful entrypoints:

1. `node .codex/scripts/startup-context.mjs`
2. `node .codex/scripts/task-overview.mjs`
3. `node .codex/scripts/aide-evolution.mjs`
4. `node .codex/scripts/aide-governance.mjs`
5. `node .codex/scripts/session-context.mjs`
6. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
7. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

Repo-local Codex hooks are enabled through `.codex/config.toml` and `.codex/hooks.json`. The project-local config only sets `[features].codex_hooks = true`, so the rest of your defaults continue to come from `~/.codex/config.toml` unless you explicitly override them. Codex must trust the project before it loads the project-scoped config layer.

With hooks active, raw lifecycle events are appended to `.codex/logs/codex-hooks/YYYY-MM-DD.jsonl`. This log is intended for later analysis of prompts, stops, and Bash usage. The existing runtime helper logs remain under `.codex/logs/runtime-hooks/YYYY-MM-DD[.part-NNN].jsonl`.

For startup or resume, the repo-local `SessionStart` hook runs `startup-context.mjs` automatically. If you are wiring runtime scripts from outside the hook system, prefer `startup-context.mjs` as the single entrypoint and pass the target repository through `cwd`, `workdir`, `projectDir`, or `CODEX_PROJECT_DIR` so logs and state resolve to the correct repository.

`runtime-state.json` is created on demand. Runtime helper logs are appended to `.codex/logs/runtime-hooks/YYYY-MM-DD[.part-NNN].jsonl`, including stdin, stdout, stderr, and runtime-managed file writes. Oversized daily logs rotate into numbered chunks automatically. If the legacy top-level `.codex/logs/runtime-hooks.jsonl` file still exists, the next runtime hook write migrates it into the daily log chunks and removes the stale file. QC reminders appear only when the current task explicitly enables `qc`.

## Smoke Test

```bash
node tests/runtime-hooks.smoke.mjs
```
