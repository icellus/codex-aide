# codex-aide install

Install `codex-aide` into the current repository.

Default target: current working directory.

Success means these paths exist:

```text
AGENTS.md
.codex/config.toml
.codex/hooks.json
.codex/aide/
.codex/aide/AGENTS.md
```

The installer also ensures `.gitignore` covers `AGENTS.md` and `/.codex/`.

## Preferred path

Use this when Node.js `>=20` is available:

```bash
npm i -g @icellus/codex-aide
codex-aide install
```

Prefer this path if the repository already has `AGENTS.md`.

## Fallback path

Use this only if the installer path is unavailable or the user explicitly wants manual install.

Do not blindly overwrite an existing `AGENTS.md`.

```bash
git clone --depth 1 https://github.com/icellus/codex-aide.git /tmp/codex-aide
cp /tmp/codex-aide/starter/AGENTS.md ./AGENTS.md
mkdir -p ./.codex
cp /tmp/codex-aide/starter/config.toml ./.codex/config.toml
cp /tmp/codex-aide/starter/hooks.json ./.codex/hooks.json
cp -R /tmp/codex-aide/starter/aide ./.codex/aide
```

If Codex CLI still does not run hooks or delegated subagents in that repository, enable `codex_hooks` and `multi_agent` in `~/.codex/config.toml` or start Codex with `codex --enable codex_hooks --enable multi_agent`.

## Report back

Report:

- which path you used
- whether `AGENTS.md` already existed
- any limitation of the path you used
