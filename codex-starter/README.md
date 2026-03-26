# codex-starter

Project-local Codex workflow starter.

It keeps the default path lightweight, routes work through a small set of clear authorities, and supports two current delivery lines:

- coding: code, tests, validation, governed delivery
- product: documentation and other non-code deliverables

## At A Glance

- default commands: `/Aide`, `/qc`, `/submit`
- default mode for small work: `lightweight`
- default non-code route: `/Aide -> product_assistant`
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
3. Start with `/Aide` or `/Aide [your goal]`.
4. Let `/Aide` scan the repo, update current state, and recommend the lightest route.

If a fresh thread starts without a slash command, treat the first user turn as `/Aide` intake by default.

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

- intake, repo scan, routing, and state maintenance
- systemic governance, not only one-off patching
- review of `product_assistant` writeback against the real chat record
- light feedback collection when product-task completion is still ambiguous
- background evolution review without blocking the first route

For product work, `/Aide` should not replace `product_assistant` in doing the business work. It should review whether `.product/*` writeback is justified by the real conversation and whether the current task actually belongs on the product line.

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
- `.codex/scripts/*.mjs`: runtime helpers
- `.product/registry.json`: product template registry
- `.product/memory.json`: lightweight product memory; current conversation wins on conflict
- `.product/evolution.json`: product-line evolution candidates, reviewed against the real chat record

The `.product/*.json` files ship with starter schemas and starter policy only. Real projects should evolve them through normal product-line work plus `/Aide` review.

## Docs

- 中文指南: [`docs/zh-CN.md`](./docs/zh-CN.md)
- 中文概览: [`docs/overview.zh-CN.md`](./docs/overview.zh-CN.md)
- 中文使用说明: [`docs/usage.zh-CN.md`](./docs/usage.zh-CN.md)
- 中文详细说明: [`docs/detailed-guide.zh-CN.md`](./docs/detailed-guide.zh-CN.md)
- Overview: [`docs/overview.md`](./docs/overview.md)
- Usage: [`docs/usage.md`](./docs/usage.md)

## Smoke Test

```bash
node tests/runtime-hooks.smoke.mjs
```
