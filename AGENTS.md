# agent-skills

Repository-level maintenance guidance for this repo.

## Scope

- This repository currently maintains `codex-starter` only.
- `claude-starter` has been archived out of tree at `/workspace/claude-starter`.
- The in-repo file [CLAUDE_STARTER_ARCHIVE.md](/workspace/agent-skills/CLAUDE_STARTER_ARCHIVE.md) is the archive note, not an active maintenance target.
- This root-level `AGENTS.md` is for maintaining `/workspace/agent-skills` itself.
- It is not the runtime authority shipped into target repositories by `codex-starter`.
- The shipped runtime authority for the starter lives at [codex-starter/AGENTS.md](/workspace/agent-skills/codex-starter/AGENTS.md).

## Default Working Rules

- Reply to the user in Chinese by default.
- Keep the literal address `Boss` unless the user explicitly changes it.
- For repo-maintenance changes, do not hand-pick overlapping test files.
- Use the root test runner as the default validation entrypoint:
  `node tests/codex-starter/run.mjs`
- For bounded subagent-owned work, prefer targeted validation with explicit files instead of whole-worktree guessing:
  `node tests/codex-starter/run.mjs --file <path> --file <path>`
- Use explicit suites only when you deliberately need them:
  `--suite fast`, `--suite smoke`, `--suite mutation`, `--suite full`
- If the runner, manifest, shared test helpers, or multiple runtime/test layers changed together, run:
  `node tests/codex-starter/run.mjs --suite full`

## Context And Token Discipline

- Prefer minimal complete task briefs for subagents.
- Do not default to `fork_context: true`; only use it when inherited thread context is genuinely required.
- When a subagent owns a clear write set, pass the owned files and let it validate with `--file` for those paths.
- Prefer one authoritative test entrypoint over long file lists in prompts.

## Testing

- Repository-level tests live under `tests/codex-starter/`.
- `node tests/codex-starter/run.mjs` auto-selects the minimal mapped suites from the current git worktree.
- `node tests/codex-starter/run.mjs --file ...` does the same for an explicit file set.
- Docs-only changes may legitimately map to no test suite; do not invent fake coverage.
