# Overview

This document explains the model.
Runtime authority lives in `AGENTS.md`, `.agents/skills/*/SKILL.md`, and `.codex/routing-policy.md`.

## What This Starter Is

`codex-starter` is a lightweight Codex workflow starter with two current delivery lines:

- coding: code changes, validation, QC, governed delivery
- product: documentation and other non-code deliverables

It is built for repositories that want a small default surface and stronger controls only when the task actually needs them.

Route names such as `Aide`, `qc`, and `submit` are logical aliases.
Some Codex clients do not support custom slash commands, so plain-language requests should map to the same routes.

English documentation is canonical.
Chinese documentation is synchronized guidance.

## Core Principles

- start light
- keep the user-facing command surface small
- keep runtime authority explicit
- let `Aide` act like the team's secretary and people manager
- let `Aide` start with the smallest active team and add roles only when they add real value
- let `Aide` own advice-only or analysis-only replies, with read-heavy analysis delegated to short-lived `repo_explorer` subagents by default
- let execution roles own concrete delivery
- keep product memory lightweight and revisable

## Runtime Authority

| File | Responsibility |
| --- | --- |
| `AGENTS.md` | global stance and command map |
| `.agents/skills/*/SKILL.md` | skill contracts |
| `.codex/agents/*.toml` | subagent role definitions |
| `.codex/routing-policy.md` | routing and module activation |
| `.codex/delivery-policy.json` | governed submit defaults |
| `.codex/evolution-policy.json` | automatic governance writeback policy |
| `.codex/state/task-context.json` | hot task state |
| `.codex/state/task-registry.json` | current and unfinished task history |
| `.codex/state/repo-context.json` | cached repo facts |
| `.codex/validation-profile.json` | repository validation baseline |
| `.codex/state/evolution-registry.json` | governance evolution queue |
| `.codex/scripts/*.mjs` | runtime helpers |
| `.product/registry.json` | product template registry |
| `.product/memory.json` | lightweight product memory; current conversation wins on conflict |
| `.product/evolution.json` | product evolution candidates reviewed against the real chat record |

## Roles and Modules

| Item | Responsibility | Default |
| --- | --- | --- |
| `Aide` | first response, delegation, governance, result review | enabled |
| `conduct` | delivery routing plus environment judgment and setup | disabled |
| `prd` | WHAT, WHY, MVP clarification | disabled |
| `architect` | HOW at system level | disabled |
| `plan` | implementation handoff | disabled |
| `product_assistant` | docs and non-code delivery | disabled |
| `tester` | task-level validation ownership | disabled |
| `coder` | implementation and sanity checks | disabled |
| `qc` | explicit audit gate | disabled |
| `submit` | governed delivery | disabled |

The disabled-by-default table matters operationally:

- new repo or missing context alone should not activate the whole team
- `Aide` should activate one clear execution role first when the task is already concrete
- for new task chains, prefer real subagents when delegation is available to keep the main thread focused on coordination
- extra roles should be dropped again once the task no longer needs them

## Delivery Lines

Outside the two delivery lines, advice-only or analysis-only work stays inside `Aide` by default:

- Q&A
- analysis
- option comparison
- route recommendations

When the user is not asking for a durable artifact, this work should not automatically spawn execution roles or durable state writes.
If analysis becomes read-heavy, prefer `repo_explorer` for read-only inspection and let `Aide` close the user-facing reply.

### Coding line

Use the coding line when the primary deliverable is:

- a code change
- a behavior change
- task-level validation
- release or governed delivery work

Typical route:

```text
Aide -> optional conduct -> optional plan -> tester/coder -> optional qc -> optional submit
```

### Product line

Use the product line when the primary deliverable is:

- docs
- API descriptions
- structured non-code content
- package artifacts
- other non-code outputs

Typical route:

```text
Aide -> product_assistant
```

`product_assistant` may read code, config, interface definitions, and other technical materials when needed. The output should still match the audience and should avoid AI-style filler and unnecessary implementation noise.

## What `/Aide` Optimizes

- acting like a capable secretary for the user and a people manager for the team
- picking the lightest correct next owner for the current task
- direct answers when the user only needs analysis or recommendations
- secretary-style coordination and closeout rather than acting as the primary deep-dive troubleshooter
- systemic governance instead of cosmetic cleanup
- product-line review based on the real chat record
- light user feedback when product-task completion is still ambiguous
- low-cost evolution review without blocking the initial route

For concrete implementation work, `/Aide` should delegate early and avoid deep local code reading unless it is necessary to decide ownership or answer the user's actual question.
For read-heavy analysis, default to a short-lived `repo_explorer` pass and let `Aide` synthesize the final response.
Missing or stale context should trigger the smallest owner scan that keeps delegation safe, not an automatic full scan or a whole-team wake-up.

For product work, `/Aide` should review:

- whether the user actually got the intended deliverable
- whether `.product/*` writeback is supported by the conversation
- whether the issue was missing user input, an understanding mismatch, or a route mismatch that should move to coding

## Product Workspace

`.product/` is the non-code delivery workspace.

- `.product/templates/`: reusable product-line templates
- `.product/registry.json`: template index and triggers
- `.product/memory.json`: lightweight user and repo preference memory
- `.product/evolution.json`: repeated mismatch candidates for later role improvement

Current conversation beats older memory. Product memory should stay weak, small, and revisable.

## Delivery Modes

- `lightweight`: small, local, clear work
- `standard`: work that benefits from a plan artifact
- `long-running`: multi-step, cross-session, release, or higher-risk work

Environment judgment and `environment setup` belong to `conduct`, not `/Aide`.
