# agent-skills

[简体中文](README.zh-CN.md)

This repository currently maintains `codex-aide` only.
English root documents are the default display and canonical versions for this repository.

After installation, runtime authority lives in:

- `AGENTS.md`
- `.codex/skills/*/SKILL.md`
- `.codex/policies/routing-policy.md`

Source entrypoints:

- [codex-aide/README.md](codex-aide/README.md)
- [codex-aide/AGENTS.md](codex-aide/AGENTS.md)

Project documents:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [TESTING.md](TESTING.md)
- [SUPPORT.md](SUPPORT.md)
- [SECURITY.md](SECURITY.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [CHANGELOG.md](CHANGELOG.md)

## Repository Layout

- [codex-aide](codex-aide): starter content shipped to downstream repositories
- [scripts](scripts): repository maintenance scripts and development validation entrypoints
- [standards](standards): rule data used by development validation
- [fixtures](fixtures): minimal failing-proof and behavior fixtures
- [.githooks](.githooks): local Git hook wiring
- [.github](.github): GitHub automation and contribution templates

Notes:

- Legacy `tests/codex-aide/` scripts have been removed and are no longer the default validation entrypoint
- Generic repository maintenance still uses the smallest task-relevant validation available, or an explicit "not validated" note
- `codex-aide` development validation follows [TESTING.md](TESTING.md)

`claude-starter` now lives as a standalone repository: <https://github.com/icellus/claude-starter>

## Community

- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Support boundaries: [SUPPORT.md](SUPPORT.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

Core repository documents also have Simplified Chinese copies via `*.zh-CN.md`.

## License

This repository is licensed under the [MIT License](LICENSE).
