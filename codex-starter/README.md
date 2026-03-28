# codex-starter

Project-local Codex workflow starter.

English documentation is canonical.
Chinese documentation is synchronized guidance and may lag briefly behind the English source of truth.

Explanation docs explain the framework.
Runtime authority lives in `AGENTS.md`, `.agents/skills/*/SKILL.md`, and `.codex/routing-policy.md`.

It keeps the default path lightweight, routes work through a small set of clear authorities, and supports two current delivery lines:

- coding: code, tests, validation, governed delivery
- product: documentation and other non-code deliverables

For analysis, Q&A, and option-comparison work with no durable artifact, `Aide` owns the user-facing response instead of forcing an execution handoff.
When analysis becomes read-heavy, default to a short-lived `repo_explorer` subagent for repository reading, then let `Aide` integrate and close the reply.
`Aide` is intended to act like the user's team secretary and the team's people manager, not the default implementer or primary deep-dive troubleshooter.
It should activate the smallest team that can safely finish the current task, then drop extra roles again when they are no longer needed.

Route names such as `Aide`, `qc`, and `submit` are logical aliases.
If the client does not support custom slash commands, the user should just describe the goal in plain language and ask for QC or submit in plain language when needed.

## At A Glance

- default route aliases: `Aide`, `qc`, `submit`
- default mode for small work: `lightweight`
- default non-code route: `Aide -> product_assistant`
- repo skill layout: `.agents/skills/*/SKILL.md`
- custom subagent layout: `.codex/agents/*.toml`
- product-line workspace: `.product/*`
- runtime authority: `.codex/routing-policy.md`
- hot task state: `.codex/state/task-context.json`
- cached repo facts: `.codex/state/repo-context.json`
- runtime dependency: `node` on `PATH`

## Quick Start

1. Copy `AGENTS.md`, `.agents/skills/`, `.codex/`, `.product/`, and optionally `docs/` and `tests/` into the target repository.
2. Ensure `node` is available if you want runtime helpers and smoke tests.
3. Start by describing your goal in plain language.
4. Let `Aide` take the first coordination pass, refresh current state if needed, and decide the next owner in plain language.

If you want a local installer, run this from the target repository root:

```bash
bash /path/to/codex-starter/install.sh
```

The installer refreshes `AGENTS.md`, `.agents/`, `.product/`, and the starter-managed files under `.codex/`, then creates or updates `.gitignore`.
It installs a minimal project-local `.codex/config.toml` that only enables repo-local Codex hooks, copies `.codex/hooks.json` and `.codex/hooks/`, seeds the baseline `.codex/state/task-context.json`, `.codex/state/repo-context.json`, and `.codex/state/task-registry.json` files only when they are missing, preserves existing `.codex/state/` and `.codex/logs/` contents, does not seed source runtime history into the target repository, and removes the legacy top-level `.codex/logs/runtime-hooks.jsonl` file if present.
The copied starter files are ignored as a whole: `AGENTS.md`, `.agents/`, `.codex/`, and `.product/`.

To make repo-local hooks effective, Codex must trust the project so that `<repo>/.codex/config.toml` is loaded. The project-local config only sets `[features].codex_hooks = true`; all other defaults continue to come from `~/.codex/config.toml` unless the project layer explicitly overrides them.

With hooks active, Codex automatically appends raw lifecycle events to `.codex/logs/codex-hooks/YYYY-MM-DD.jsonl` and also runs the startup helper on `SessionStart`.

If an integration wants a single startup command outside the hook system instead of wiring several scripts manually, use:

```bash
node .codex/scripts/startup-context.mjs
```

When wiring runtime scripts from outside the target repository root, pass the target path through `cwd`, `workdir`, `projectDir`, or `CODEX_PROJECT_DIR` so state and logs resolve to the intended repository.

There is currently no dedicated repo-scan script.
Repo scans are coordinated by `Aide` through targeted repository inspection and optional read-only exploration.
For read-heavy analysis or unclear ownership, prefer a short-lived read-only `repo_explorer` subagent and have `Aide` synthesize the result for the user.
On a concrete repo-change task, missing context should trigger only the minimum owner scan needed for delegation first; a full scan is for repo-wide assessment, unresolved ownership, or genuinely unknown high-risk boundaries.

If a fresh thread starts without an explicit supported route alias, let `Aide` handle the user's first turn by default.

## Current Model

### Coding line

- route for implementation, validation, QC, and governed submit
- main execution roles: `tester`, `coder`, optional `/qc`, optional `/submit`
- best when the primary deliverable is a behavior change, code change, or release action

### Product line

- route for documentation and other non-code deliverables
- main execution role: `product_assistant`
- supports docs, API descriptions, structured content, templates, package artifacts, and other non-code outputs
- `product_assistant` may read technical materials when needed, but the output should match the audience and avoid unnecessary technical noise

## What `/Aide` Owns

- first response, coordination, routing, and state maintenance
- secretary-style closeout: delegate, coordinate, and integrate the user-facing answer instead of acting as the primary deep-dive investigator
- direct handling of advice-only or analysis-only requests when the user is not asking for a durable artifact
- for read-heavy analysis, default to a short-lived `repo_explorer` read and then close the user reply as `Aide`
- systemic governance, not only one-off patching
- review of `product_assistant` writeback against the real chat record
- light feedback collection when product-task completion is still ambiguous
- background evolution review without blocking the first route
- quick delegation to the right execution role when the user actually wants a repo change or durable artifact
- for new task chains, prefer real subagents when delegation is available to reduce main-thread context pollution
- per-task staffing: start with the smallest active team, add roles only when they add real value, and drop them again when the task narrows

For product work, `/Aide` should not replace `product_assistant` in doing the business work. It should review whether `.product/*` writeback is justified by the real conversation and whether the current task actually belongs on the product line.

`conduct` is narrower than `/Aide`.
`/Aide` decides whether formal delivery routing is needed at all, then `conduct` applies the active delivery route when environment judgment or setup, module activation, or longer execution planning matters.

For advice-only or analysis-only requests, `/Aide` should stay lightweight:

- answer directly
- inspect only the minimum context needed
- for read-heavy analysis, prefer a short-lived `repo_explorer` pass and keep `Aide` as the final user-facing responder
- avoid durable state writes unless the conversation becomes a tracked task
- re-route only when the expected output becomes a concrete artifact or execution workflow

For concrete implementation work, `/Aide` should avoid deep local troubleshooting when a writer will need to inspect the same area again. Prefer fast delegation with only the minimum boundary evidence needed to choose the next owner, and prefer real subagents for new task chains when available.
New repo state or thin context alone is not a reason to activate `tester`, `architect`, `qc`, or other extra roles before that value is justified.

## Runtime Authority

- `AGENTS.md`: global stance and command map
- `.agents/skills/*/SKILL.md`: skill contracts
- `.codex/agents/*.toml`: role contracts
- `.codex/routing-policy.md`: routing and module activation
- `.codex/state/task-context.json`: hot task state
- `.codex/state/task-registry.json`: current and unfinished task history
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: repository validation baseline
- `.codex/delivery-policy.json`: governed submit defaults
- `.codex/evolution-policy.json`: low-risk automatic writeback policy
- `.codex/state/evolution-registry.json`: governance evolution queue
- `.codex/logs/codex-hooks/YYYY-MM-DD.jsonl`: raw Codex lifecycle events captured by repo-local hooks
- `.codex/logs/runtime-hooks/YYYY-MM-DD[.part-NNN].jsonl`: full runtime hook invocation log, including input, output, and file writes
- `.codex/config.toml`: minimal repo-local hook enablement; leave global defaults in `~/.codex/config.toml`
- `.codex/hooks.json`: repo-local hook wiring
- `.codex/hooks/*.mjs`: repo-local hook handlers
- `.codex/scripts/*.mjs`: runtime helpers
- `.product/registry.json`: product template registry
- `.product/memory.json`: lightweight product memory; current conversation wins on conflict
- `.product/evolution.json`: product-line evolution candidates, reviewed against the real chat record

The `.product/*.json` files ship with starter schemas and starter policy only. Real projects should evolve them through normal product-line work plus `/Aide` review.

If a repository still has the legacy top-level `.codex/logs/runtime-hooks.jsonl`, the next runtime hook write will migrate it into the daily log chunks automatically and remove the stale file.

## Docs

- Overview: [`docs/overview.md`](./docs/overview.md)
- Usage: [`docs/usage.md`](./docs/usage.md)
- Detailed guide: [`docs/detailed-guide.md`](./docs/detailed-guide.md)
- 中文索引: [`docs/zh-CN.md`](./docs/zh-CN.md)
- 中文概览: [`docs/overview.zh-CN.md`](./docs/overview.zh-CN.md)
- 中文使用说明: [`docs/usage.zh-CN.md`](./docs/usage.zh-CN.md)
- 中文详细说明: [`docs/detailed-guide.zh-CN.md`](./docs/detailed-guide.zh-CN.md)

## Smoke Test

```bash
node tests/runtime-hooks.smoke.mjs
```
