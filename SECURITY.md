# Security Policy

[简体中文](docs/SECURITY.zh-CN.md)

## Scope

The current support scope covers `codex-aide` in this repository together with its maintenance scripts, rule data, and documentation.

Out of scope:

- the archived `claude-starter` line
- business code, deployment configuration, or third-party services added by a downstream repository after installing `codex-aide`
- issues that clearly belong to upstream platforms, runtime environment setup, or GitHub itself

## Reporting A Security Issue

Do not file public issues, pull requests, or comments that contain exploit details.

Recommended order:

1. If GitHub Private Vulnerability Reporting is enabled, use that private channel first
2. If you already have a private maintainer contact path, report there directly
3. If public GitHub discussion is the only available path, open only a minimal public note and request private follow-up

Please include, when available:

- impact scope
- reproduction steps or trigger conditions
- potential exploitation path
- temporary mitigation or workaround
- your preferred disclosure timing

## Response Expectations

- Maintainers will try to acknowledge receipt within 7 days
- If the report is valid, maintainers will try to communicate status, impact boundaries, and a repair plan
- If a quick fix is not available, maintainers will try to describe current risk and temporary mitigation guidance

## Disclosure

- Do not publicly disclose directly exploitable details before a fix, mitigation, or confirmed non-impact state exists
- After remediation, maintainers may publish an update or changelog entry as appropriate

## Non-Security Support

For non-security issues, use the normal collaboration paths:

- usage questions or feature requests: [SUPPORT.md](SUPPORT.md)
- general contribution flow: [CONTRIBUTING.md](CONTRIBUTING.md)
