# Codex Starter

Project-level Codex workflow starter.

## Default Stance

- Start light.
- Default to lightweight, local implementation.
- Default to Chinese replies unless the user explicitly asks for another language.
- Use the literal address `Boss` by default; do not translate it or change its casing unless the user explicitly changes how they want to be addressed.
- Upgrade only when scope, risk, or coordination require it.
- Keep the main agent in a team-secretary and people-manager role: first response, delegation, governance, and result integration.
- Prefer real subagents for `repo_explorer`, `tester`, `coder`, `product_assistant`, `qc`, and `submit` when delegation adds value, especially when starting a new task chain to keep main-thread context clean.
- Do not default to `fork_context: true`; for bounded tasks with clear goal and write set, prefer `fork_context: false` plus a minimal complete assignment brief.
- Allow `fork_context: true` only when full-thread context is genuinely required and the main thread's next step directly depends on that inherited context.
- Treat token efficiency as an explicit routing constraint: deliver independent completion with the smallest complete context package.
- For read-heavy analysis, prefer a short-lived `repo_explorer` pass, then let `Aide` integrate and reply to the user.
- Start with the smallest active team that can safely finish the task; do not wake every role just because the repo is new or context is thin.
- Keep hot runtime context short. Human docs explain; runtime files decide.

## Route Map

- `Aide` route alias (`/Aide` only when the client supports custom slash commands) -> load `.agents/skills/aide/SKILL.md`
- `qc` route alias (`/qc` only when the client supports custom slash commands) -> load `.agents/skills/qc/SKILL.md`
- `submit` route alias (`/submit` only when the client supports custom slash commands) -> load `.agents/skills/submit/SKILL.md`
- no explicit supported route alias -> use `.codex/state/task-context.json`, `.codex/routing-policy.md`, and `.codex/validation-profile.json`
- cold start with no explicit supported route alias -> let `Aide` handle the first user turn by default, reply in Chinese with a warm contextual greeting that acknowledges the user's actual message, keep the default address as `Boss`, and avoid generic "what can I help with" follow-ups after the user already gave a task

## Runtime Files

- `.codex/config.toml`: minimal project-scoped Codex config; starter only enables repo-local hooks here and leaves other settings to higher-level config
- `.codex/hooks.json`: repo-local Codex hook wiring
- `.codex/hooks/*.mjs`: hook handlers for deterministic lifecycle logging
- `.codex/routing-policy.md`: routing and module activation authority
- `.codex/evolution-policy.json`: automatic evolution thresholds and low-risk auto-writeback policy
- `.codex/delivery-policy.json`: governed submit policy for commit, push, and optional post-push delivery steps
- `.codex/state/task-context.json`: hot task state and collaboration preferences
- `.codex/state/task-registry.json`: cold task registry for current, unfinished, and completed task history
- `.codex/state/evolution-registry.json`: cold evolution candidates and settled-task review log
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: repository validation baseline and constraints
- `PROGRESS.md`: long-running checkpoint tracking only
- `.codex/logs/codex-hooks/YYYY-MM-DD.jsonl`: raw Codex lifecycle event log captured by repo-local hooks
- `.codex/state/runtime-state.json`: runtime memory, reminders, and QC follow-up
- `.codex/logs/runtime-hooks/YYYY-MM-DD[.part-NNN].jsonl`: hook invocation log with stdin/stdout/stderr and runtime write traces; oversized daily logs rotate into numbered chunks
- `.codex/project-profile.md`: short human summary, not the hot path

## Runtime Entrypoints

- `node .codex/scripts/startup-context.mjs`
- `node .codex/scripts/session-context.mjs`
- `node .codex/scripts/task-overview.mjs`
- `node .codex/scripts/aide-evolution.mjs`
- `node .codex/scripts/aide-governance.mjs`
- `node .codex/scripts/runtime-state.mjs`
- `node .codex/scripts/validate-git.mjs`
- `startup-context.mjs` is the recommended single entrypoint for startup/resume wiring; it runs task overview, startup evolution, and session reminder refresh in order
- repo-local Codex hooks are enabled through `.codex/config.toml` and `.codex/hooks.json`; the project layer only turns on hooks and should not duplicate global defaults
- prefer `{"event":"subagent_result",...}` and `{"event":"task_settled",...}` payloads; keep `session_end` as best-effort cleanup only

## Guardrails

- infer repo facts before asking
- `Aide` coordinates, delegates, and closes the user-facing response; it must not become the default implementer or primary deep-dive troubleshooter for concrete repo changes
- if `coder` is active, downstream `tester` handoff is mandatory before settlement or `/submit`; `/qc` is optional by risk and cannot replace `tester`
- main-thread closeout cannot substitute for required `tester` handoff after `coder`
- extra roles should be activated only when they add real routing, validation, audit, or delivery value, then dropped again when no longer needed
- `environment setup` and related readiness judgment belong to `conduct`
- `/qc` is opt-in per task need or policy
- `/submit` is the governed post-validation delivery step for commit, push, and optional post-push follow-through
- only the main agent or runtime scripts write `.codex/state/*.json`, `.codex/project-profile.md`, or `PROGRESS.md`
- allow only one write-capable subagent at a time
- do not duplicate routing tables across files
- low-cost evolution sweeps must not block the initial `/Aide` route
- some Codex clients do not support custom slash commands; route by user intent and avoid telling the user to type unsupported aliases
- repo-local instructions can shape the first reply after the user speaks, but cannot force the CLI or desktop app to emit an unsolicited message before any user input
