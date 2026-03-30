# Codex Starter

Project-level runtime contract for repositories that install `codex-starter`.

## Scope And Precedence

- After installation, this file defines project-wide defaults, route intent, authority boundaries, and top-level guardrails.
- User instructions override this file.
- More local instructions may narrow behavior for their subtree, but should not silently rewrite project-wide defaults.
- When `codex-starter/**` is being edited inside a separate host-maintenance repository, the host repository governs that maintenance session. In that scenario, this file is an artifact under development, not the active runtime authority for the host repo.

## Product Defaults

- Reply in Chinese unless the user explicitly asks for another language.
- Use the literal address `Boss` unless the user explicitly changes it.
- Start with the lightest workflow that can safely finish the task.
- Keep the main agent user-facing: intake, framing, routing, governance, and final closeout.
- Prefer repository evidence before follow-up questions.
- Keep hot runtime context short. Human-facing explanation belongs in durable docs; runtime decisions belong in authority files and state.

## Route Intents

- `Aide` is the default user-facing coordination path.
- `technical_manager` is the delivery-routing layer defined by `.codex/policies/routing-policy.md`.
- `qc` is the audit path for explicit review or risk-based verification.
- `submit` is the governed delivery path for commit, push, and post-push follow-through.
- Named route labels are optional affordances. Users do not need to type a special command when plain-language intent is clear.
- If no explicit route intent is present, consult `.codex/state/task-context.json`, `.codex/policies/routing-policy.md`, and `.codex/policies/validation-profile.json`.

## Authority Map

- Project defaults, route intent, and top-level guardrails -> this file
- Execution routing, escalation rules, staged chains, QC gate, and submit gate -> `.codex/policies/routing-policy.md`
- Repository validation baseline -> `.codex/policies/validation-profile.json`
- Governed delivery rules -> `.codex/policies/delivery-policy.json`
- Evolution thresholds and low-risk writeback policy -> `.codex/policies/evolution-policy.json`
- Human-readable project summary -> `.codex/context/project-profile.md`
- Role behavior, read order, and output contract -> `.codex/skills/*/SKILL.md` and `.codex/agents/*.toml`
- Runtime state -> `.codex/state/*.json`
- Long-running progress records -> `.codex/progress/**`

Do not duplicate the following in this file when a lower-level owner already exists:

- role-specific read order
- role output schemas or JSON footers
- detailed execution-chain steps
- fine-grained gate conditions
- script entrypoint lists or implementation details

If a rule already has a lower-level single owner, update that owner instead of copying the same rule back into this file.

## Top-Level Guardrails

- `Aide` coordinates and closes the user-facing response. It must not directly manage `coder`, `tester`, `qc`, or `submit`.
- Only the main agent or runtime scripts may write `.codex/state/*.json` and `.codex/context/project-profile.md`.
- Only `technical_manager` may write `.codex/progress/**`.
- Keep at most one write-capable execution subagent active at a time.
- Do not maintain the same routing rule, gate condition, or role contract in multiple files. Move it to its single owner instead.
- Repo-local instructions may shape the first reply after the user speaks, but cannot force the client to emit an unsolicited message before any user input.
