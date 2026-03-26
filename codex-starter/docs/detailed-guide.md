# Detailed Guide

This document is for people who want to adapt or extend `codex-starter`.

It explains the current design.
Runtime authority lives in `AGENTS.md`, `.agents/skills/*/SKILL.md`, and `.codex/routing-policy.md`.

## Current Model

`codex-starter` currently has two delivery lines:

- coding
- product

Both lines share `/Aide` for intake, routing, and governance, but they use different execution roles and different durable artifacts.

Outside those delivery lines, `/Aide` also owns discussion-shaped work directly:

- Q&A
- analysis
- option comparison
- route recommendations

These turns produce conclusions, not durable artifacts.

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

`/Aide` owns intake, routing, governance, and discussion-shaped work.
`conduct` applies formal delivery routing after `/Aide` decides the task needs it.

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

1. intake
2. routing
3. direct discussion handling
4. governance
5. result review

`/Aide` should not replace execution roles.

### Discussion turns

For discussion-shaped work, `/Aide` should:

- answer directly
- read only the minimum context needed
- avoid durable state writes by default
- re-route only when the task becomes a request for a concrete artifact or execution workflow

### Coding line

For coding work, `/Aide` mainly decides:

- whether `tester` is needed
- whether `coder` is needed
- whether `/qc` is needed
- whether `/submit` is needed
- whether there is a governance issue

### Product line

For product work, `/Aide` mainly decides:

- whether the task really belongs on the product line
- whether completion is sufficient
- whether `.product/*` writeback is justified by the real chat record
- whether the real issue is missing user input, an understanding mismatch, or a route mismatch that should move to coding

Discussion turns should not be upgraded into formal execution just because the topic is technical.

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
`/Aide` performs repo scanning through targeted repository inspection and optional read-only exploration.

That means:

- repo scans are real, but manual at the workflow layer
- cached repo context should be reused when possible
- a full scan should happen only when context is missing, stale, or explicitly requested

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
