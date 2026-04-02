# agent-skills

[简体中文](docs/README.zh-CN.md)

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

- [Contributing](CONTRIBUTING.md)
- [Testing](TESTING.md)
- [Support](SUPPORT.md)
- [Security](SECURITY.md)
- [Code Of Conduct](CODE_OF_CONDUCT.md)

## Repository Layout

- [codex-aide](codex-aide): starter content shipped to downstream repositories
- [scripts](scripts): repository maintenance scripts and development validation entrypoints
- [tests](tests): development validation assets, including standards and fixtures
- [docs](docs): supplemental repository documentation and Chinese mirror files
- [.githooks](.githooks): local Git hook wiring
- [.github](.github): GitHub automation and contribution templates

Notes:

- Legacy fixed test-runner assumptions have been removed from this repository
- Generic repository maintenance still uses the smallest task-relevant validation available, or an explicit "not validated" note
- `codex-aide` development validation follows [TESTING.md](TESTING.md)

`claude-starter` now lives as a standalone repository: <https://github.com/icellus/claude-starter>

## Community

- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Support boundaries: [SUPPORT.md](SUPPORT.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Supplemental repository documents and Simplified Chinese mirrors live under [docs](docs).

## License

This repository is licensed under the [MIT License](LICENSE).
