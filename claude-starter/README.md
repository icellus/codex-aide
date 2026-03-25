# claude-starter

Light-start starter for project-local Claude/Codex workflows.

It keeps the user-facing surface small, starts in direct mode by default, and only enables heavier planning, routing, or release modules when the task actually needs them.

## Highlights

- Default user-facing commands: `/Aide`, `/qc`, `/follow`
- `/Aide` handles repo intake, project brief, preference memory, and governance
- `conduct` owns delivery routing and optional `workspace prep`
- `prd`, `architect`, `plan`, `tester`, `coder`, `qc`, `follow`, and hooks are all optional
- Validation commands are inferred from the repository instead of hardcoded starter defaults
- Hooks are disabled by default

## User-Facing Commands

| Command | Purpose |
| --- | --- |
| `/Aide` | Entry point for repo scan, project brief, role/module guidance, and governance actions |
| `/qc` | Optional quality audit for higher-risk or user-requested verification |
| `/follow` | Optional post-push CI or release follow-through |

## Internal Model

| Item | Type | Responsibility | Default |
| --- | --- | --- | --- |
| `Aide` | command | Intake, repo scan, project profile, governance | enabled |
| `prd` | skill | Clarify WHAT, WHY, and MVP | off |
| `architect` | skill | Clarify HOW at system level | off |
| `conduct` | skill | Route delivery mode and own optional `workspace prep` | off |
| `plan` | skill | Create an `Implementation Plan` when durable execution guidance is needed | off |
| `tester` | agent | Write or update tests from requirements | off |
| `coder` | agent | Implement and validate the change | off |
| `auto_qc` | skill | Optional QC trigger for runtime automation | off |
| hooks | optional runtime layer | Session context, git validation, runtime state | off |

## Quick Start

1. Copy `CLAUDE.md` and `.claude/` into the target repository.
2. Start with `/Aide` or `/Aide [your goal]`.
3. Let `/Aide` scan the repo, write `.claude/project-profile.md`, and recommend the initial role/module mix.
4. Work directly for small tasks.
5. Let `conduct` enable `workspace prep`, `plan`, orchestration, or execution handoffs only when the task justifies them.

## Default Task Routing

| Task class | Default mode | Typical path |
| --- | --- | --- |
| `bugfix` | `direct` | `/Aide` -> direct implementation -> focused validation |
| `feature` | `plan-driven` | `/Aide` -> optional `prd` -> optional `architect` -> `conduct` -> optional `plan` |
| `refactor` | `direct` | `/Aide` -> direct work -> upgrade only if scope grows |
| `release` | `orchestrated` | `/Aide` -> `conduct` -> optional `/qc` -> optional `/follow` |
| `exploration` | `direct` | `/Aide` -> focused inspection -> lightweight notes |

## Repository Layout

- `CLAUDE.md`: project operating model
- `.claude/project-profile.md`: durable project brief, validation profile, routing matrix, and preferences
- `.claude/commands/`: user-facing commands
- `.claude/skills/`: internal workflow logic
- `.claude/agents/`: optional execution roles
- `.claude/templates/`: optional PRD, architecture, plan, progress, and research templates
- `.claude/hooks/`: optional runtime automation helpers
- `.claude/settings.json`: hooks disabled by default
- `.claude/settings.hooks.example.json`: example hook configuration

When hooks are enabled, runtime state is created on demand under `.claude/state/runtime-state.json`.

## Documentation

- English overview: [`docs/overview.md`](./docs/overview.md)
- English usage: [`docs/usage.md`](./docs/usage.md)
- Chinese overview: [`docs/overview.zh-CN.md`](./docs/overview.zh-CN.md)
- Chinese usage: [`docs/usage.zh-CN.md`](./docs/usage.zh-CN.md)
- Chinese README: [`README.zh-CN.md`](./README.zh-CN.md)
