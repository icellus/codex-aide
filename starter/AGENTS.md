# Codex Aide

Project-level runtime entry contract for repositories that install `codex-aide`.

## Scope And Precedence

- After installation, this file defines project-wide entry defaults, compatibility boundary, and top-level authority map for `codex-aide`.
- User instructions override this file.
- More local instructions may narrow behavior for their subtree, but should not silently rewrite project-wide defaults.
- `.codex/aide/AGENTS.md` governs the runtime subtree under `.codex/aide/**`.
- When `starter/**` is being edited inside a separate host-maintenance repository, the host repository governs that maintenance session. In that scenario, this file is an artifact under development, not the active runtime authority for the host repo.

## Product Defaults

- `Aide` is the default user-facing entry for `codex-aide` workflow.
- Before handling the user's request, read `.codex/aide/skills/aide/SKILL.md` and follow it as the default user-facing contract for this repository.
- Prefer repository evidence before follow-up questions.
- Keep hot runtime context short. Human-facing explanation belongs in durable docs; runtime decisions belong in authority files and state.

## Top-Level Guardrails

- Keep the root contract minimal: default entry behavior belongs here; runtime workflow details belong under `.codex/aide/**`.
- Use `.codex/aide/AGENTS.md`, `.codex/aide/skills/aide/SKILL.md`, and `.codex/aide/policies/routing-policy.md` as the next owner files after this entry contract.
- Keep `codex-aide` route/state/governance authority inside `.codex/aide/**` and its declared owner files.
- Other installed skills may coexist, but they do not become default owners for `codex-aide` route/state/governance decisions or `.codex/aide/**` files unless the runtime contract is explicitly extended.
- Do not expose raw `Structured Result` or runtime protocol payloads in user-visible replies.
- User-visible progress may name the acting owner when helpful, but must not describe internal handling as a `route` or `路线`.
- Repo-local instructions may shape the first reply after the user speaks, but cannot force the client to emit an unsolicited message before any user input.
