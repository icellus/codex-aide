---
{
  "version": 1,
  "default_disposition": {
    "G1": "auto-fix",
    "G2": "ask-user",
    "G3": "ask-user"
  },
  "auto_fix_levels": ["G1"],
  "persist_fields": ["issue", "level", "authority_target", "disposition", "note"],
  "candidate_sources": ["Aide", "architect", "product_assistant", "technical_manager", "tester", "qc"],
  "runtime_state_path": ".codex/state/governance-context.json",
  "safe_diff_types": ["replace-exact-text", "remove-exact-text", "insert-after-anchor"],
  "special_flow_targets": [".codex/policies/validation-profile.json"],
  "active_statuses": ["accepted", "ask-user", "special-flow"]
}
---

# Aide Governance Policy

This file is the single authority for `Aide` governance rules.

## Governance Objects

- Role contracts
- Routing rules
- Critical runtime behavior
- Default state and default summaries
- Shared prompts and shared constraints

## Governance Triggers

- The same failure pattern repeats
- Multiple files define the same concept inconsistently
- Runtime behavior diverges from the contract
- Defaults, prompts, or state fields keep reintroducing an outdated model
- Role boundaries drift or are crossed repeatedly

## Governance Levels

### G1

- Low-risk governance items
- Limited to wording fixes, summary fixes, deduplication, default descriptions, authority pointers, or other low-risk text writebacks
- Must not change system behavior, role boundaries, or routing decisions

### G2

- Medium-risk governance items
- Affect the system contract, role boundaries, authority ownership, or how the system interprets itself
- Do not directly change automated runtime behavior

### G3

- High-risk governance items
- Affect automated runtime behavior, route progression, state transitions, or governance boundaries
- Incorrect changes would directly alter system behavior

## Governance Output

Every governance result must include:

- `issue`
- `level`
- `impact`
- `authority_target`
- `recommended_action`
- `disposition`

## State Persistence

At minimum, persist the following fields in state:

- `issue`
- `level`
- `authority_target`
- `disposition`
- `note`

## Runtime Governance State

- Maintain active governance items in `.codex/state/governance-context.json`
- Only `Aide` may write this runtime governance state directly
- Keep this file limited to active items; do not accumulate applied or rejected history there

## Candidate Intake

- Candidate sources are `Aide`, `architect`, `product_assistant`, `technical_manager`, `tester`, and `qc`
- Downstream roles contribute governance evidence and candidate proposals; `Aide` decides whether to open or update an active governance item
- Only `Aide` may turn candidate intake into active runtime governance state or generic governance writeback
- `qc` contributes governance evidence and repeated categories; `Aide` decides whether to open or update an active governance item
- Candidate intake must include repository evidence before a governance item can move forward

## Generic Writeback Gates

- Generic governance writeback is allowed only for `G1` items
- Generic governance writeback runs only from an `Aide` decision, even when the candidate evidence originated in another role
- Generic writeback requires one owner file, one safe diff plan, and a passing target validator after the patch
- Safe diff types are `replace-exact-text`, `remove-exact-text`, and `insert-after-anchor`
- Targets with dedicated maintenance flows, including `.codex/policies/validation-profile.json`, must bypass generic governance writeback and stay on their special flow
- If any gate fails, move the item to `ask-user` or `special-flow` instead of applying an automatic writeback

## Automatic Disposition

- `G1 -> auto-fix`
- `G2 -> ask-user`
- `G3 -> ask-user`

Only `G1` items may be auto-fixed.
