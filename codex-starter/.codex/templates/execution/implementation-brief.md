# Implementation Brief: [Task Name]

**Date**: [YYYY-MM-DD]  
**Owner**: `technical_manager`  
**Suggested Path**: `plans/<task-slug>-implementation-brief.md`

**Input Sources**:
- [User goal / Aide handoff summary]
- [`PRD.md` or specific PRD path, or `N/A`]
- [`ARCHITECTURE.md` or specific architecture doc path, or `N/A`]
- [Key repository evidence: code, config, tests, logs]

**Boundary Notes**:
- `Implementation Brief` is the document type/title, not the literal filename
- The file path must stay slugged and space-free, for example `plans/<task-slug>-implementation-brief.md`
- Record only execution-critical information; do not include workflow result boilerplate
- Do not include routing decisions, role-activation decisions, or compatibility semantics
- Do not include default summaries, long background, or discussion-style open questions

---

## 1. Goal

- [Outcome this delivery must achieve]
- [Verifiable business or technical effect]

## 2. In Scope

- [Required implementation change]
- [Boundary condition]

## 3. Out of Scope

- [Explicitly excluded item]
- [Deferred follow-up]

## 4. Acceptance & Validation Targets

- [Completion criteria]
- [Key validation target: function, interface, stability, regression, etc.]

## 5. Target Files / Modules

- `[path/to/file-or-module]`: [Expected change]
- `[path/to/file-or-module]`: [Expected change]

## 6. Implementation Steps

1. [Step 1: change action and constraint]
2. [Step 2: change action and constraint]
3. [Step 3: closeout and consistency handling]

## 7. Validation Plan

- Command / Check: `[command-or-check]`
- Expected Result: [PASS condition]
- Coverage Rationale: [Why this validation covers the change objective]

## 8. Risks & Dependencies

- Risk: [Risk description] | Mitigation: [Mitigation strategy]
- Dependency: [External system or prerequisite] | Fallback: [Failure handling]

## 9. Handoff Notes

- For `coder`: [Constraint that implementation must follow]
- For `tester`: [Validation focus that must be covered]
- For `technical_manager`: [Closeout check that must be confirmed]
