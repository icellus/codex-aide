# Codex Aide Runtime

Runtime subtree contract for `.codex/aide/**`.

## Scope And Precedence

- After installation, this file governs the `.codex/aide/**` runtime subtree.
- The repository root `AGENTS.md` remains the project-wide entry contract.
- More local instructions inside `.codex/aide/**` may narrow behavior for their subtree, but should not silently rewrite this subtree contract.
- When `starter/**` is being edited inside a separate host-maintenance repository, this file is an artifact under development and the host repository governs that maintenance session.

## Runtime Boundary

- Route, state, governance, delivery, and runtime helper semantics for `codex-aide` live under `.codex/aide/**`.
- Coexisting installed skills may be consulted as supporting capability, but they are not default owners for `next_owner`, `sticky_owner`, governance decisions, or runtime state writes.
- Unless the runtime contract is explicitly extended, `codex-aide` route owners stay inside the built-in role set used by the runtime scripts.
- Keep role contracts, routing rules, and special flows in their declared owner files instead of mirroring them across unrelated runtime files.

## Write Boundaries

- Only the main agent or runtime scripts may write `.codex/aide/state/*.json` and `.codex/aide/context/project-profile.md`.
- Runtime task-state sync writes `.codex/aide/progress/**`; `technical_manager` owns technical progress semantics and checkpoints.
- `Aide` is the only direct writer of `.codex/aide/state/governance-context.json`.
- Treat `.codex/aide/state/*.demo.json` and `.codex/aide/progress/*.demo.md` as shipped examples only, never live runtime truth.

## Runtime Sources

- Task runtime authority -> `.codex/aide/state/task-context.json`
- Governance runtime authority -> `.codex/aide/state/governance-context.json`
- Submit preference runtime authority -> `.codex/aide/state/submit-preferences.json`
- Pending routed-turn protocol staging -> `.codex/aide/state/pending-task-turn-result.json`
- Pending governance protocol staging -> `.codex/aide/state/pending-governance-result.json`
- Repository validation baseline -> `.codex/aide/policies/validation-profile.json`
- Human-readable project summary -> `.codex/aide/context/project-profile.md`
- Role behavior, read order, and output contract -> `.codex/aide/skills/*/SKILL.md` and `.codex/aide/agents/*.toml`

## Compatibility Boundary

- Other installed skills may coexist in the repository or external skill locations without entering `codex-aide` route/state/governance by default.
- `Aide` may reference or delegate to other skills as supporting capability, but accepted outcomes must be integrated back through `codex-aide` owner files and runtime state.
- Do not expose raw `Structured Result` or runtime protocol payloads in user-visible replies.
- If user-visible progress names an acting owner, do not describe internal handling as a `route` or `路线`.
