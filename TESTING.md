# Testing

[简体中文](docs/TESTING.zh-CN.md)

This document describes the development-time validation flow for `codex-aide` in this repository.

It is about maintaining this repository itself. It is not a guide for installed-runtime usage inside target repositories.

## Scope

Development validation here covers:

- validator entrypoints in `scripts/`
- rule data in `tests/standards/`
- fixtures in `tests/fixtures/codex-aide-dev/`
- the validation guidance used by hooks and CI

These files are development-governance assets. They help keep the runtime and the repository implementation aligned, but they are not runtime authority themselves.

## Default Commands

Use the unified validator:

```bash
node scripts/validate-codex-aide-dev.mjs contract
node scripts/validate-codex-aide-dev.mjs consistency
node scripts/validate-codex-aide-dev.mjs meta
node scripts/validate-codex-aide-dev.mjs full
```

Default meaning:

- `contract`: executable contract checks
- `consistency`: cross-file alignment checks
- `meta`: validation-system health checks
- `full`: all of the above

For small local iteration, run the smallest relevant mode.
For closeout on testing or validation changes, prefer `full`.

## How To Think About The Layers

- `contract` checks whether the owned contract still works as implemented.
- `consistency` checks whether related files still agree with each other.
- `meta` checks whether the validation system itself is still healthy and maintainable.

Keep the model simple:

- executable behavior belongs in validators and fixtures
- cross-file agreement belongs in consistency data
- testing-system health belongs in meta validation

## Source Of Truth

Development validation in this repository is defined by:

- [AGENTS.md](AGENTS.md)
- [TESTING.md](TESTING.md)
- [scripts/validate-codex-aide-dev.mjs](scripts/validate-codex-aide-dev.mjs)
- [scripts/validate-codex-aide-authority.mjs](scripts/validate-codex-aide-authority.mjs)
- [tests/standards/codex-aide-authority-map.json](tests/standards/codex-aide-authority-map.json)
- [tests/standards/codex-aide-consistency-map.json](tests/standards/codex-aide-consistency-map.json)
- [tests/standards/codex-aide-test-registry.json](tests/standards/codex-aide-test-registry.json)
- [tests/fixtures/codex-aide-dev](tests/fixtures/codex-aide-dev)

## Maintenance Rules

- Keep validation registry-driven. Prefer updating existing rule data, fixtures, or executors before adding new ones.
- When validation commands, layers, registry expectations, or maintenance workflow change, update this document in the same change.
- Do not expand this file into a second copy of every detailed rule. Detailed rules belong in validators, standards data, fixtures, and owner files.
- Keep at least one maintained failing-proof path for active validators.

## Delivery Expectations

When you change testing or validation behavior, report:

- what you ran
- what those checks cover
- whether coverage changed
- any remaining validation gap
