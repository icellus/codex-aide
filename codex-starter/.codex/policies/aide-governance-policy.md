---
{
  "version": 1,
  "default_disposition": {
    "G1": "auto-fix",
    "G2": "ask-user",
    "G3": "ask-user"
  },
  "auto_fix_levels": ["G1"],
  "persist_fields": ["issue", "level", "authority_target", "disposition", "note"]
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

## Automatic Disposition

- `G1 -> auto-fix`
- `G2 -> ask-user`
- `G3 -> ask-user`

Only `G1` items may be auto-fixed.
