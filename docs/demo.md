# Demo workflow

This demo shows the intended shape of codex-aide in a small repository. It is written as a reproducible maintainer walkthrough rather than a generated transcript.

## 1. Install into a project

From any repository where you use Codex:

```bash
npm i -g @icellus/codex-aide
cd /path/to/project
codex-aide install
```

For a dry run:

```bash
codex-aide install --target /path/to/project --dry-run
```

## 2. Review the installed runtime

The installer adds a root handoff and a grouped Codex runtime:

```text
AGENTS.md
.codex/
  config.toml
  hooks.json
  aide/
    AGENTS.md
    agents/
    policies/
    progress/
    state/
    templates/
```

The root `AGENTS.md` stays small. The detailed workflow lives under `.codex/aide/`, which makes it easier for maintainers to review or refresh without burying project instructions in unrelated files.

## 3. Ask Codex to use the repository workflow

Start Codex in the project and give it normal maintainer work:

```text
Use the repository workflow to investigate issue #42, make the smallest safe fix,
run the documented validation checks, and prepare a concise PR summary.
```

codex-aide does not replace Codex. It gives Codex a project-local workflow baseline for intake, routing, state, validation, and delivery.

## 4. Validate before release

In the codex-aide repository itself, maintainers can run:

```bash
node scripts/validate-codex-aide-dev.mjs full
npm pack --dry-run
```

These checks verify the starter contract and packaging behavior before a release is published.

## 5. Expected maintainer benefit

The same workflow can be reinstalled as codex-aide evolves. That gives maintainers a practical upgrade path for Codex project governance without rewriting each repository's instructions by hand.
