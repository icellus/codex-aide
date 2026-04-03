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
- Prefer repository evidence before follow-up questions.
- Keep hot runtime context short. Human-facing explanation belongs in durable docs; runtime decisions belong in authority files and state.

## Route Intents

- `Aide` is the default user-facing entry and triage role for `codex-aide`.
- `product_manager` is the product-definition line for unstable WHAT/WHY/MVP.
- `technical_manager` is the technical-delivery line owner.
- `product_assistant` is the non-code delivery line owner.
- `qc` is the audit path for explicit review or risk-based verification.
- `submit` is the governed delivery path for commit, push, and post-push follow-through.
- Named route labels are optional affordances. Users do not need to type a special command when plain-language intent is clear.
- If no explicit route intent is present, consult `.codex/aide/state/task-context.json` when it exists, then `.codex/aide/policies/routing-policy.md` and `.codex/aide/policies/validation-profile.json`.

## Authority Map

- Project entry defaults, compatibility boundary, and top-level authority map -> this file
- Runtime subtree guardrails, write boundaries, and compatibility boundary for `.codex/aide/**` -> `.codex/aide/AGENTS.md`
- Aide role contract and triage semantics -> `.codex/aide/skills/aide/SKILL.md`
- Routing topology, chain rules, and gates -> `.codex/aide/policies/routing-policy.md`
- Governance scope, triggers, levels, and dispositions -> `.codex/aide/policies/aide-governance-policy.md`
- Repository validation baseline -> `.codex/aide/policies/validation-profile.json`
- Governed delivery rules -> `.codex/aide/policies/delivery-policy.json`
- Human-readable project summary -> `.codex/aide/context/project-profile.md`
- Task runtime authority -> `.codex/aide/state/task-context.json`
- Governance runtime authority -> `.codex/aide/state/governance-context.json`
- Submit preference runtime authority -> `.codex/aide/state/submit-preferences.json`
- Pending routed-turn protocol staging -> `.codex/aide/state/pending-task-turn-result.json`
- Pending governance protocol staging -> `.codex/aide/state/pending-governance-result.json`
- Runtime state demos -> `.codex/aide/state/*.demo.json`
- Role behavior, read order, and output contract -> `.codex/aide/skills/*/SKILL.md` and `.codex/aide/agents/*.toml`
- Long-running progress records -> `.codex/aide/progress/**`

Do not duplicate subtree runtime rules, lower-level role contracts, or detailed route steps in this file.
Update the single owner file instead of repeating the same rule in multiple places.

## Top-Level Guardrails

- Keep `codex-aide` route/state/governance authority inside `.codex/aide/**` and its declared owner files.
- Other installed skills may coexist, but they do not become default owners for `codex-aide` route/state/governance decisions or `.codex/aide/**` files unless the runtime contract is explicitly extended.
- Do not expose raw `Structured Result` or runtime protocol payloads in user-visible replies.
- User-visible progress may name the acting owner when helpful, but must not describe internal handling as a `route` or `路线`.
- Repo-local instructions may shape the first reply after the user speaks, but cannot force the client to emit an unsolicited message before any user input.
