# Detailed Guide

This document is for people who want to adapt or extend `codex-starter`.

It explains the current design.
Runtime authority lives in `AGENTS.md`, `.agents/skills/*/SKILL.md`, and `.codex/routing-policy.md`.

## Current Model

`codex-starter` currently has two delivery lines:

- coding
- product

Both lines share `/Aide` as the team secretary and people manager, but they use different execution roles and different durable artifacts.
`/Aide` is also responsible for task-by-task staffing: start small, add people only when there is real value, and shrink the active team again when the task narrows.

Outside those delivery lines, `/Aide` also owns advice-only and analysis-only work directly:

- Q&A
- analysis
- option comparison
- route recommendations

These turns produce conclusions, not durable artifacts.
When those turns become read-heavy, `repo_explorer` should do the read-only repo pass first, then `/Aide` should integrate and deliver the final user-facing answer.

## Directory Boundaries

### `AGENTS.md`

Keep only:

- global stance
- slash-command mapping
- a small number of guardrails

Do not turn `AGENTS.md` into a full project handbook.

### `.agents/skills/`

This directory holds skill contracts.

The most important ones in the current starter are:

- `aide`
- `conduct`
- `qc`
- `submit`

`/Aide` owns first response, delegation, governance, and advice-only work.
`conduct` applies formal delivery routing after `/Aide` decides the task needs it, including environment judgment and setup work.

### `.codex/`

This directory holds runtime-layer material:

- role definitions
- routing policy
- hot state
- runtime scripts
- coding-line helpers

### `.product/`

This directory holds product-line internal memory and reusable structure:

- `templates/`
- `registry.json`
- `memory.json`
- `evolution.json`

It is not the final user-facing docs directory.

## `/Aide` Boundary

`/Aide` has five responsibilities:

1. first response and user-facing coordination
2. delegation
3. direct advice/analysis handling
4. governance
5. result review

`/Aide` should not replace execution roles.
It is a manager, not the default implementer or the primary deep-dive troubleshooter.

### Advice / Analysis turns

For advice-only or analysis-only work, `/Aide` should:

- answer directly
- read only the minimum context needed
- when analysis is read-heavy, default to a short-lived `repo_explorer` read pass and keep `/Aide` as the final responder
- avoid durable state writes by default
- re-route only when the task becomes a request for a concrete artifact or execution workflow

### Coding line

For coding work, `/Aide` mainly decides:

- whether `tester` is needed
- whether `coder` is needed
- whether `/qc` is needed
- whether `/submit` is needed
- whether there is a governance issue

The staffing rule is to start with the smallest active team that can safely finish the task.
New repo state or stale context does not mean every role should wake up.
If ownership is clear, route directly to one execution role first and add others only when validation, audit, or delivery requirements justify them.
For new task chains, prefer real subagents when delegation is available so the main thread stays focused on coordination and user communication.

It should not do a deep implementation read unless that evidence is required to assign the right owner.
If ownership is clear, delegate early and let the execution role read the code in detail.

### Product line

For product work, `/Aide` mainly decides:

- whether the task really belongs on the product line
- whether completion is sufficient
- whether `.product/*` writeback is justified by the real chat record
- whether the real issue is missing user input, an understanding mismatch, or a route mismatch that should move to coding

Advice turns should not be upgraded into formal execution just because the topic is technical.

## `product_assistant` Boundary

`product_assistant` is the non-code delivery role.

It owns:

- docs
- API descriptions
- structured non-code content
- packaged non-code deliverables
- direct `.product/*` updates

It does not own:

- coding-line validation ownership
- `/qc`
- `/submit`
- implementation ownership

The output should match the audience and avoid filler.

## State and Repo Scan

The starter keeps hot runtime state in `.codex/state/`.

The most important files are:

- `task-context.json`
- `repo-context.json`
- `task-registry.json`

There is currently no dedicated repo-scan script.
`/Aide` coordinates repo scanning through targeted repository inspection and optional read-only exploration.

That means:

- repo scans are real, but manual at the workflow layer
- cached repo context should be reused when possible
- for read-heavy analysis or unclear ownership, default to short-lived read-only `repo_explorer` passes and let `/Aide` synthesize
- if context is missing or stale, `Aide` should choose the smallest scan that answers the current task
- a concrete repo-change request should usually start with a minimal owner scan, then delegate as soon as the next owner is clear
- a full scan is for explicit repo-wide assessment, unresolved ownership after minimal triage, or genuinely unknown high-risk boundaries

## `.product/*` Meaning

### `.product/templates/`

Reusable template directory.
The starter intentionally ships without opinionated content templates.
Templates are expected to evolve from real use.

### `.product/registry.json`

Template registry:

- what templates exist
- which artifact types they apply to
- what triggered them

### `.product/memory.json`

Lightweight preference memory:

- user preferences
- repo-level style or artifact preferences

Current conversation always wins over older memory.

### `.product/evolution.json`

Queue of repeated mismatches that may justify future role or template changes.

## Automation and Evolution

The starter already includes lightweight automation for:

- runtime reminders
- QC and submit follow-up
- governance review queues
- low-risk evolution sweeps

The important boundary is:

- discovering signals is normal runtime behavior
- changing authority files is a stronger action and should stay tightly scoped

## Design Summary

The current design aims to keep three things true at the same time:

- simple work should stay light
- durable workflows should be explicit when needed
- the framework should learn from repeated failure patterns without turning every task into process overhead
