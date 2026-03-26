# Codex Starter

Project-level Codex workflow starter.

## Default Stance

- Start light.
- Default to lightweight, local implementation.
- Default to Chinese replies unless the user explicitly asks for another language.
- Use the literal address `Boss` by default; do not translate it or change its casing unless the user explicitly changes how they want to be addressed.
- Upgrade only when scope, risk, or coordination require it.
- Keep the main agent on intake, routing, governance, and result integration.
- Prefer real subagents for `tester`, `coder`, `product_assistant`, `qc`, and `submit` when delegation adds value.
- Keep hot runtime context short. Human docs explain; runtime files decide.

## Route Map

- `Aide` route alias (`/Aide` only when the client supports custom slash commands) -> load `.agents/skills/aide/SKILL.md`
- `qc` route alias (`/qc` only when the client supports custom slash commands) -> load `.agents/skills/qc/SKILL.md`
- `submit` route alias (`/submit` only when the client supports custom slash commands) -> load `.agents/skills/submit/SKILL.md`
- no explicit supported route alias -> use `.codex/state/task-context.json`, `.codex/routing-policy.md`, and `.codex/validation-profile.json`
- cold start with no explicit supported route alias -> treat the first user turn as `Aide` intake by default, reply in Chinese with a warm contextual greeting that acknowledges the user's actual message, keep the default address as `Boss`, and avoid generic "what can I help with" follow-ups after the user already gave a task

## Runtime Files

- `.codex/routing-policy.md`: routing and module activation authority
- `.codex/evolution-policy.json`: automatic evolution thresholds and low-risk auto-writeback policy
- `.codex/delivery-policy.json`: governed submit policy for commit, push, and optional post-push delivery steps
- `.codex/state/task-context.json`: hot task state and collaboration preferences
- `.codex/state/task-registry.json`: cold task registry for current, unfinished, and completed task history
- `.codex/state/evolution-registry.json`: cold evolution candidates and settled-task review log
- `.codex/state/repo-context.json`: cached repo facts
- `.codex/validation-profile.json`: repository validation baseline and constraints
- `PROGRESS.md`: long-running checkpoint tracking only
- `.codex/state/runtime-state.json`: runtime memory, reminders, and QC follow-up
- `.codex/project-profile.md`: short human summary, not the hot path

## Runtime Hooks

- `node .codex/scripts/session-context.mjs`
- `node .codex/scripts/task-overview.mjs`
- `node .codex/scripts/aide-evolution.mjs`
- `node .codex/scripts/aide-governance.mjs`
- `node .codex/scripts/runtime-state.mjs`
- `node .codex/scripts/validate-git.mjs`
- prefer `{"event":"subagent_result",...}` and `{"event":"task_settled",...}` payloads; keep `session_end` as best-effort cleanup only

## Guardrails

- infer repo facts before asking
- `environment setup` belongs to `conduct`
- `/qc` is opt-in per task need or policy
- `/submit` is the governed post-validation delivery step for commit, push, and optional post-push follow-through
- only the main agent or runtime scripts write `.codex/state/*.json`, `.codex/project-profile.md`, or `PROGRESS.md`
- allow only one write-capable subagent at a time
- do not duplicate routing tables across files
- low-cost evolution sweeps must not block the initial `/Aide` route
- some Codex clients do not support custom slash commands; route by user intent and avoid telling the user to type unsupported aliases
- repo-local instructions can shape the first reply after the user speaks, but cannot force the CLI or desktop app to emit an unsolicited message before any user input
