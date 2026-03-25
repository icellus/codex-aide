# Claude Starter

Project-level Claude Code configuration starter.

## Default Operating Mode

- Start light. Do not assume the full workflow is active.
- Read the repository and the user's stated goal before choosing roles, artifacts, or process.
- Prefer the lightest workflow that can safely finish the current task.
- For a small bug fix or straightforward edit, implement directly and run the closest validation.
- Only enable heavier workflow modules when the user asks for them or the task complexity, risk, or release needs clearly justify them.

## Role Model

- `/Aide` is the primary user-facing aide and governance steward. It scans the project, maintains `.claude/project-profile.md`, summarizes role and module capabilities, routes durable lessons, and runs protocol audits and dedup reviews.
- `prd` is an optional internal product manager or product owner module. It clarifies WHAT, WHY, and MVP scope before delivery work starts.
- `architect` is an optional internal architect module. It clarifies HOW at system level before implementation planning starts.
- `conduct` is an optional internal delivery router. It decides whether the task stays direct, becomes plan-driven, or becomes orchestrated, and it owns optional workspace prep when execution needs it.
- `plan` is an optional internal implementation-planning module. When enabled, it creates an `Implementation Plan`; add a plan summary only when orchestration truly needs one.
- `tester` and `coder` are optional execution roles. Use them when explicit red/green separation or handoffs add value.
- `/qc` is an optional audit step. It should verify work, not auto-run git operations by default.
- `/follow` is an optional post-push module. Start report-first and only attempt fixes when justified.
- `PROGRESS.md` and runtime hooks are optional controls, not default requirements.

## Module Activation

Core modules:

- repo scan and short brief
- direct implementation with focused validation
- minimal role routing through `/Aide`
- governance routing through `/Aide`

Optional modules:

- product requirements: `prd`
- architecture design: `architect`
- workspace prep: `conduct`
- plan-driven delivery: `plan`, `tester`, `coder`
- orchestration: internal coordination, `PROGRESS.md`, plan summaries
- quality gate: `/qc`
- release follow-through: `/follow`
- runtime automation: hooks and `.claude/state/runtime-state.json`

Enable optional modules only when:

- the user explicitly asks
- the task is a feature, large refactor, or release activity
- work spans multiple sessions, branches, or contributors
- failure cost justifies stronger process control

## Sources of Truth

- `.claude/project-profile.md` is the durable project brief, task activation matrix, and module policy maintained by `/Aide`.
- `PRD.md` is only required when the `prd` module is enabled.
- `ARCHITECTURE.md` is only required when the `architect` module is enabled.
- `PROGRESS.md` is only required when orchestration is enabled.
- `Implementation Plan` files are only required when the `plan` module is enabled.
- plan summaries are orchestration helpers when the `plan` module is active.
- `RESEARCH.md` is an optional checkpoint when discovery is needed.
- `.claude/state/runtime-state.json` exists only when runtime hooks are enabled.
- templates live under `.claude/templates/`.

## User-Facing Commands

- `/Aide`
- `/qc`
- `/follow`

## Available Subagents

- `tester`
- `coder`

## Guardrails

- Start with a repo scan and the user's goal; do not ask for facts that are easy to infer.
- Ask only high-leverage questions that change roles, modules, validation depth, or release handling.
- Prefer repository-derived validation commands over fixed starter-era defaults.
- Start module activation from the task-class baseline in `.claude/project-profile.md`, then apply the smallest justified override.
- Prefer targeted `git add` over `git add .` or `git add -A`.
- Keep command docs lightweight when a matching skill file is the real authority.
- Let `/Aide` handle intake, governance, lesson routing, audits, and dedup; let `conduct` handle delivery routing and workspace prep when implementation planning begins.
- Do not assume automatic commit or push behavior unless the project policy explicitly enables it.
- Enable hooks only when the project benefits from persistent automation.
- Update paths and placeholders for the target project before relying on the workflow in production.
