# Overview

## What This Starter Is

`codex-starter` is a lightweight Codex workflow starter with two current delivery lines:

- coding: code changes, validation, QC, governed delivery
- product: documentation and other non-code deliverables

It is built for repositories that want a small default surface and stronger controls only when the task actually needs them.

## Core Principles

- start light
- keep the user-facing command surface small
- keep runtime authority explicit
- let `/Aide` own intake and governance
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
| `/Aide` | intake, routing, governance, result review | enabled |
| `conduct` | delivery routing and environment setup | disabled |
| `prd` | WHAT, WHY, MVP clarification | disabled |
| `architect` | HOW at system level | disabled |
| `plan` | implementation handoff | disabled |
| `product_assistant` | docs and non-code delivery | disabled |
| `tester` | task-level validation ownership | disabled |
| `coder` | implementation and sanity checks | disabled |
| `/qc` | explicit audit gate | disabled |
| `/submit` | governed delivery | disabled |

## Delivery Lines

### Coding line

Use the coding line when the primary deliverable is:

- a code change
- a behavior change
- task-level validation
- release or governed delivery work

Typical route:

```text
/Aide -> optional conduct -> optional plan -> tester/coder -> optional /qc -> optional /submit
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
/Aide -> product_assistant
```

`product_assistant` may read code, config, interface definitions, and other technical materials when needed. The output should still match the audience and should avoid AI-style filler and unnecessary implementation noise.

## What `/Aide` Optimizes

- the lightest correct route for the current task
- systemic governance instead of cosmetic cleanup
- product-line review based on the real chat record
- light user feedback when product-task completion is still ambiguous
- low-cost evolution review without blocking the initial route

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

`environment setup` belongs to `conduct`, not `/Aide`.
