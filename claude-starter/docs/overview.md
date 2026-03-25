# Overview

## What This Starter Is

`claude-starter` is a project-local workflow starter for Claude/Codex that favors a light default path.

It is designed for repositories where most work should begin with a small command surface, direct execution, and repository-derived validation, while still keeping stronger planning, architecture, QC, and release controls available when needed.

## Design Principles

- Start light.
- Keep the user-facing surface small.
- Derive validation from the repository.
- Enable heavier roles and modules only when the task justifies them.
- Separate intake/governance from delivery routing.
- Preserve durable state only when coordination actually needs it.

## Role and Module Model

| Item | Type | Responsibility | Default |
| --- | --- | --- | --- |
| `/Aide` | command | Repo scan, project brief, preference memory, governance | enabled |
| `prd` | internal skill | Clarify WHAT, WHY, and MVP | disabled |
| `architect` | internal skill | Clarify HOW at system level | disabled |
| `conduct` | internal skill | Decide delivery mode, own optional `workspace prep`, coordinate orchestration | disabled |
| `plan` | internal skill | Create an `Implementation Plan` | disabled |
| `tester` | agent | Write or update tests from requirements | disabled |
| `coder` | agent | Implement and validate changes | disabled |
| `/qc` | command | Audit work at light, plan, or release depth | disabled |
| `/follow` | command | Inspect or follow through on post-push CI/release work | disabled |
| `auto_qc` | internal skill | Trigger QC automatically when runtime automation is enabled | disabled |
| hooks | optional runtime layer | Session context, git validation, runtime state | disabled |

## Delivery Modes

| Mode | When it fits | Typical modules |
| --- | --- | --- |
| `direct` | Small, local, clear work | main agent, focused validation |
| `plan-driven` | Work that benefits from durable implementation guidance | optional `prd`, optional `architect`, optional `plan` |
| `orchestrated` | Multi-step, cross-session, release, or higher-risk work | `conduct`, optional progress tracking, optional `qc`, optional `follow` |

`workspace prep` belongs to `conduct`. It is an execution-preparation capability, not a user-facing role and not part of `/Aide` intake.

## Task Class Defaults

| Task class | Default mode | Notes |
| --- | --- | --- |
| `bugfix` | `direct` | Most bugfixes should skip PM, architecture, and planning |
| `feature` | `plan-driven` | Add `prd` or `architect` only when boundaries are unclear |
| `refactor` | `direct` | Promote to planning only when scope or risk grows |
| `release` | `orchestrated` | Start from coordination and quality gates |
| `exploration` | `direct` | Prefer inspection and lightweight notes |

## Durable Artifacts

| Artifact | Owner | Purpose |
| --- | --- | --- |
| `.claude/project-profile.md` | `/Aide` | Project brief, validation profile, task matrix, collaboration preferences |
| `PRD.md` or scoped PRD file | `prd` | Product scope and MVP |
| `ARCHITECTURE.md` or scoped architecture file | `architect` | System-level design decisions |
| `Implementation Plan` | `plan` | Implementation-focused handoff and validation guidance |
| `PROGRESS.md` | `conduct` | Cross-session or release coordination state |
| runtime state JSON | hooks | Optional runtime automation memory |

## Runtime Automation

Hooks are off by default.

When enabled, they can provide:

- session context
- git validation
- runtime state tracking
- optional `auto_qc` follow-up behavior

## Best Fit

This starter fits best when:

- the repository is small or medium-sized
- most tasks are bugfixes, focused features, or local refactors
- the team wants strong optional controls without forcing a full heavy workflow every time

It can also scale to higher-risk work, but only by enabling the relevant modules for that task.
