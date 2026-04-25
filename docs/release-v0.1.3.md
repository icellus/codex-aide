# Release notes: v0.1.3

`v0.1.3` is the current public npm release of codex-aide.

## Highlights

- Installs a governed Codex-ready runtime into existing repositories.
- Keeps root instructions light while grouping workflow state and guidance under `.codex/aide/`.
- Supports npm install, direct git install, and AI-assisted installation.
- Enables hook-driven runtime syncing and delegated subagent routing through generated Codex config files.
- Ships maintainer validation commands for contract checks and package dry runs.

## Validation

Before publishing this release, maintainers should run:

```bash
node scripts/validate-codex-aide-dev.mjs full
npm pack --dry-run
```

## Useful links

- Repository: https://github.com/icellus/codex-aide
- Package: https://www.npmjs.com/package/@icellus/codex-aide
- Install guide: https://github.com/icellus/codex-aide/blob/master/INSTALL.md

