# @icellus/codex-aide

Codex Aide is a governed repository starter for Codex-based execution, validation, and delivery workflows.

It installs a Codex runtime into an existing repository so work can run with explicit authority files, durable runtime state, validation baselines, and governed delivery rules.

- npm package: `@icellus/codex-aide`
- repository: <https://github.com/icellus/codex-aide>
- Chinese introduction: [docs/README.zh-CN.md](docs/README.zh-CN.md)

## What You Get

After installation, the target repository gets:

- a thin project-level `AGENTS.md` that defines the codex-aide entry boundary
- a `.codex/aide/` runtime with policies, skills, agents, hooks, templates, and helper scripts
- a `.codex/aide/AGENTS.md` runtime subtree contract for codex-aide-owned files
- durable runtime state for task tracking, governance context, submit preferences, and progress records
- a governed path for validation, commit, push, and delivery follow-through

## Contract Model

Codex Aide now uses a layered authority model instead of putting every runtime rule into the repository root `AGENTS.md`.

- the root `AGENTS.md` is intentionally thin
- `.codex/aide/AGENTS.md` governs the codex-aide runtime subtree
- `.codex/aide/skills/*/SKILL.md` and `.codex/aide/agents/*.toml` govern role behavior

This keeps the repository root contract easier to merge with existing repository instructions while still letting codex-aide keep a complete runtime contract under `.codex/aide/**`.

## Compatibility

Codex Aide is designed to coexist with other installed skills.

- other skills may remain installed in the same repository or external skill locations
- codex-aide keeps its own route, state, governance, and delivery authority inside `.codex/aide/**`
- other skills do not enter codex-aide `next_owner`, `sticky_owner`, governance writeback, or runtime state ownership by default

This is the default compatibility model after installation: coexistence without implicit routing takeover.

## Quick Start

Target:

- a repository root where the runtime should be installed

### Install With npm

Requirements:

- Node.js `>=20`

```bash
npm i -g @icellus/codex-aide
code-aide install
```

Optional:

```bash
code-aide install --target /path/to/repo
code-aide install --dry-run
```

### Manual Install

If you do not want to use npm or Node.js at install time, copy the starter files into the target repository manually.

```bash
git clone https://github.com/icellus/codex-aide.git
cd codex-aide

cp starter/AGENTS.md /path/to/repo/AGENTS.md
mkdir -p /path/to/repo/.codex
cp -R starter/aide /path/to/repo/.codex/aide
```

Manual installation uses the same layout as the installer, but it does not apply the installer's merge or preservation logic automatically. It will not update an existing `AGENTS.md` for you, and it will not preserve runtime-local files automatically.

## Installed Layout

The published package ships:

```text
starter/AGENTS.md
starter/aide/AGENTS.md
starter/aide/**
```

The installer maps that into:

```text
starter/AGENTS.md   -> <repo>/AGENTS.md
starter/aide/AGENTS.md -> <repo>/.codex/aide/AGENTS.md
starter/aide/**     -> <repo>/.codex/aide/**
```

## Upgrade

The current `code-aide install` command can be re-run to refresh the shipped runtime files and the codex-aide root contract.

- if the target repository root already has `AGENTS.md`, the installer prepends or updates the managed codex-aide contract at the top and leaves the existing content in place
- `.codex/aide/**` shipped files are refreshed from the latest starter
- runtime-local files remain preserved

The managed root block is wrapped with `<!-- codex-aide:start -->` / `<!-- codex-aide:end -->` markers when the installer merges into an existing `AGENTS.md`.

The merge model is intentionally narrow:

- codex-aide manages only its own top-level contract block
- existing repository instructions remain below that managed block
- codex-aide does not try to rewrite or normalize the rest of the user's `AGENTS.md`

When doing a manual upgrade, preserve these runtime-local paths instead of replacing them from the package:

- `.codex/aide/state/*.json`, except `*.demo.json`
- `.codex/aide/context/project-profile.md`
- `.codex/aide/policies/validation-profile.json`
- `.codex/aide/progress/**`
- `.codex/aide/logs/**`
- `.codex/aide/artifacts/**`
- `.codex/aide/product/**`

Package-owned static files such as `.codex/aide/policies/routing-policy.md` can usually be refreshed from the latest starter.

## CLI

```bash
code-aide --help
code-aide --version
code-aide install [--target <dir>] [--dry-run]
```

## Development

```bash
node scripts/validate-codex-aide-dev.mjs full
npm pack --dry-run
```

## License

MIT
