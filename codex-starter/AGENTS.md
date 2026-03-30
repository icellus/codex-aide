# Codex Starter

Project-level runtime contract for repositories that install `codex-starter`.

## Scope And Precedence

- After installation, this file defines project-wide defaults, route intent summary, authority boundaries, and top-level guardrails.
- User instructions override this file.
- More local instructions may narrow behavior for their subtree, but should not silently rewrite project-wide defaults.
- When `codex-starter/**` is being edited inside a separate host-maintenance repository, the host repository governs that maintenance session. In that scenario, this file is an artifact under development, not the active runtime authority for the host repo.

## Product Defaults

- Reply in Chinese unless the user explicitly asks for another language.
- Use the literal address `Boss` unless the user explicitly changes it.
- Start with the lightest workflow that can safely finish the task.
- Keep the main agent user-facing: intake, triage, coordination, governance, and final closeout.
- Prefer repository evidence before follow-up questions.
- Keep hot runtime context short. Human-facing explanation belongs in durable docs; runtime decisions belong in authority files and state.

## Route Intents

- `Aide` is the default user-facing entry and triage role.
- `product_manager` is the product-definition line for unstable WHAT/WHY/MVP.
- `technical_manager` is the technical-delivery line owner.
- `product_assistant` is the non-code delivery line owner.
- `qc` is the audit path for explicit review or risk-based verification.
- `submit` is the governed delivery path for commit, push, and post-push follow-through.
- Named route labels are optional affordances. Users do not need to type a special command when plain-language intent is clear.
- If no explicit route intent is present, consult `.codex/state/task-context.json`, `.codex/policies/routing-policy.md`, and `.codex/policies/validation-profile.json`.

## Authority Map

- Project defaults and top-level guardrails -> this file
- Aide role contract and triage semantics -> `.codex/skills/aide/SKILL.md`
- Routing topology, chain rules, and gates -> `.codex/policies/routing-policy.md`
- Governance scope, triggers, levels, and dispositions -> `.codex/policies/aide-governance-policy.md`
- Repository validation baseline -> `.codex/policies/validation-profile.json`
- Governed delivery rules -> `.codex/policies/delivery-policy.json`
- Low-risk governance writeback policy -> `.codex/policies/aide-writeback-policy.json`
- Human-readable project summary -> `.codex/context/project-profile.md`
- Role behavior, read order, and output contract -> `.codex/skills/*/SKILL.md` and `.codex/agents/*.toml`
- Runtime state -> `.codex/state/*.json`
- Long-running progress records -> `.codex/progress/**`

Do not duplicate lower-level role contracts or detailed route steps in this file.
Update the single owner file instead of repeating the same rule in multiple places.

## Top-Level Guardrails

- Only the main agent or runtime scripts may write `.codex/state/*.json` and `.codex/context/project-profile.md`.
- Only `technical_manager` may write `.codex/progress/**`.
- Keep at most one write-capable execution subagent active at a time.
- Keep route intent and role contracts in their single-owner files.
- Repo-local instructions may shape the first reply after the user speaks, but cannot force the client to emit an unsolicited message before any user input.
