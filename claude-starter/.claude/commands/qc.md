---
name: qc
description: Optional quality audit. Choose the lightest verification depth that matches the current task and risk.
tools: Read, Glob, Grep, Bash
model: opus
---

# QC Command

User-facing entrypoint for `/qc`.

This file is intentionally thin. The authoritative QC logic lives in `.claude/skills/qc.md`.

## Purpose

Run quality control at the depth justified by `.claude/project-profile.md`, the current task, and explicit user intent.

Typical QC modes:

- **light**: targeted audit for a direct task or small change
- **plan**: audit against an active implementation plan or explicit tester/coder handoff
- **release**: broader audit for higher-risk or pre-release work

## Usage

```bash
/qc
/qc --mode=light
/qc --mode=plan
/qc --mode=release
/qc --phase=tester
/qc --phase=coder
/qc [plan-file]
```

## Execution Contract

When `/qc` runs:

1. Read `.claude/project-profile.md` and the current task
2. Decide the audit mode unless the user explicitly forces one
3. Use an implementation plan only when plan-driven delivery is active or the user provides one
4. Verify code, tests, claims, and validation evidence at the chosen depth
5. Return a concise report with findings and next-step guidance

## Guardrails

- do not require an implementation plan for simple direct work
- do not auto stage, commit, or push
- prefer targeted evidence from files, diffs, and command output
- use a different model family from implementation agents when available
- keep this command doc lightweight; update `.claude/skills/qc.md` for substantive QC behavior changes
