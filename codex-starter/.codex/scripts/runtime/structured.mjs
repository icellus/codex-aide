import { basenameLabel } from "./progress.mjs";

const GOVERNANCE_LEVEL_ORDER = {
  G1: 1,
  G2: 2,
  G3: 3
};

export function normalizeGovernanceLevel(value, fallback = "G2") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "G1" || normalized === "G2" || normalized === "G3") {
    return normalized;
  }
  return fallback;
}

export function compareGovernanceLevel(left, right) {
  return (
    (GOVERNANCE_LEVEL_ORDER[normalizeGovernanceLevel(right, "G1")] || 0) -
    (GOVERNANCE_LEVEL_ORDER[normalizeGovernanceLevel(left, "G1")] || 0)
  );
}

export function highestGovernanceLevel(values = [], fallback = "G2") {
  const normalized = Array.isArray(values)
    ? values.map((item) => normalizeGovernanceLevel(item, fallback))
    : [];

  if (normalized.length === 0) {
    return fallback;
  }

  return normalized.sort(compareGovernanceLevel)[0];
}

export function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

export function compactText(value, maxLength = 240) {
  const normalized = normalizeText(value).replace(/\n+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function extractStructuredResult(message) {
  const text = String(message || "");

  const previousNonEmptyLine = (source, position) => {
    if (!source) {
      return "";
    }
    const prefix = source.slice(0, Math.max(0, position));
    const lines = prefix.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = String(lines[index] || "").trim();
      if (line) {
        return line;
      }
    }
    return "";
  };

  const isExampleMarkerLine = (line) => {
    const normalized = String(line || "")
      .trim()
      .replace(/^[>*+\-\s]+/, "")
      .trim();
    if (!normalized) {
      return false;
    }

    if (/^(example(?:\s+output|\s+result)?|sample(?:\s+output|\s+result)?|for example|e\.g\.)\s*:?\s*$/i.test(normalized)) {
      return true;
    }

    return /(?:example output|sample output)/i.test(normalized);
  };

  const parseCandidates = (candidates = []) => {
    const parsedCandidates = [];

    for (const candidate of candidates) {
      const block = candidate?.block;
      try {
        const parsedValue = JSON.parse(block);
        if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
          parsedCandidates.push({
            value: parsedValue,
            isExample: Boolean(candidate?.isExample)
          });
        }
      } catch {
        continue;
      }
    }

    if (parsedCandidates.length === 0) {
      return null;
    }

    const nonExample = parsedCandidates.filter((item) => !item.isExample);
    const pool = nonExample.length > 0 ? nonExample : parsedCandidates;
    return pool[pool.length - 1].value;
  };

  const structuredCandidates = [...text.matchAll(/## Structured Result[\s\S]*?```json\s*([\s\S]*?)```/gi)].map(
    (match) => {
      const position = Number.isFinite(match.index) ? match.index : 0;
      return {
        block: match[1],
        isExample: isExampleMarkerLine(previousNonEmptyLine(text, position))
      };
    }
  );
  const structuredParsed = parseCandidates(structuredCandidates);
  if (structuredParsed) {
    return structuredParsed;
  }

  const fallbackCandidates = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((match) => {
    const position = Number.isFinite(match.index) ? match.index : 0;
    return {
      block: match[1],
      isExample: isExampleMarkerLine(previousNonEmptyLine(text, position))
    };
  });
  return parseCandidates(fallbackCandidates);
}

function extractStructuredResultFromRequiredSection(message) {
  const text = String(message || "");
  const sectionMatch = text.match(/(^|\n)\s*##\s*Structured Result\b([\s\S]*?)(?=\n\s*##\s+[^\n]+|\s*$)/i);

  if (!sectionMatch) {
    return {
      hasSection: false,
      structured: null
    };
  }

  const sectionBody = String(sectionMatch[2] || "");
  const candidates = [...sectionBody.matchAll(/```json\s*([\s\S]*?)```/gi)].map((match) => match[1]);

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(candidates[index]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          hasSection: true,
          structured: parsed
        };
      }
    } catch {
      continue;
    }
  }

  return {
    hasSection: true,
    structured: null
  };
}

function normalizeStructuredRole(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  if (raw === "qc_reviewer") {
    return "qc";
  }

  if (raw === "submit_worker") {
    return "submit";
  }

  return raw;
}

function normalizeStructuredBriefPath(structured) {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return "";
  }

  for (const candidate of [structured.brief_path, structured.briefPath, structured.brief]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

const IMPLEMENTATION_BRIEF_PATH_PATTERN = /^plans\/[a-z0-9]+(?:-[a-z0-9]+)*-implementation-brief\.md$/;

function isValidImplementationBriefPath(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return IMPLEMENTATION_BRIEF_PATH_PATTERN.test(normalized);
}

export function validateStructuredResultContract(role, message) {
  const normalizedRole = normalizeStructuredRole(role);
  if (normalizedRole !== "coder" && normalizedRole !== "tester") {
    return {
      ok: true,
      code: "",
      reason: "",
      structured: null
    };
  }

  const strictStructured = extractStructuredResultFromRequiredSection(message);

  if (!strictStructured.hasSection) {
    return {
      ok: false,
      code: "missing_structured_result_section",
      reason: `${normalizedRole} handoff missing required "## Structured Result" section.`,
      structured: null
    };
  }

  const structured = strictStructured.structured;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return {
      ok: false,
      code: "invalid_structured_result_json",
      reason: `${normalizedRole} handoff has no valid JSON object in the structured result section.`,
      structured: null
    };
  }

  const structuredRole = normalizeStructuredRole(structured.role);
  if (!structuredRole) {
    return {
      ok: false,
      code: "missing_structured_result_role",
      reason: `${normalizedRole} structured result must include role.`,
      structured
    };
  }

  if (structuredRole !== normalizedRole) {
    return {
      ok: false,
      code: "structured_result_role_mismatch",
      reason: `${normalizedRole} structured result role mismatch: got "${structuredRole}".`,
      structured
    };
  }

  const status = String(structured.status || "").trim().toLowerCase();
  if (status !== "complete" && status !== "blocked") {
    return {
      ok: false,
      code: "invalid_structured_result_status",
      reason: `${normalizedRole} structured result status must be "complete" or "blocked".`,
      structured
    };
  }

  const legacyScopeKeys = ["story_path", "storyPath", "story"];
  const legacyScopeKey = legacyScopeKeys.find((key) => Object.prototype.hasOwnProperty.call(structured, key));
  if (legacyScopeKey) {
    return {
      ok: false,
      code: "legacy_structured_scope_key",
      reason: `${normalizedRole} structured result uses deprecated scope key "${legacyScopeKey}".`,
      structured
    };
  }

  if (structured.needs_qc !== true) {
    return {
      ok: false,
      code: "structured_result_needs_qc_not_true",
      reason: `${normalizedRole} structured result must set needs_qc: true.`,
      structured
    };
  }

  const briefPath = normalizeStructuredBriefPath(structured);

  if (status === "complete" && !briefPath) {
    return {
      ok: false,
      code: "missing_structured_result_brief_path",
      reason: `${normalizedRole} structured result must include a non-empty brief_path to the active Implementation Brief.`,
      structured
    };
  }

  if (briefPath && !isValidImplementationBriefPath(briefPath)) {
    return {
      ok: false,
      code: "invalid_structured_result_brief_path_format",
      reason: `${normalizedRole} structured result brief_path must use a slugged repo-relative path like "plans/<task-slug>-implementation-brief.md".`,
      structured
    };
  }

  return {
    ok: true,
    code: "",
    reason: "",
    structured
  };
}

export function detectSubagentStatus(agentType, message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  const explicitStatus = String(structured?.status || "").toLowerCase();

  if (explicitStatus === "complete" || explicitStatus === "blocked" || explicitStatus === "other") {
    return explicitStatus;
  }

  if (/blocked|needs help|help needed|human intervention/i.test(text)) {
    return "blocked";
  }

  if (/implementation complete|tests written|testing complete|tests complete|submit complete|delivery complete|push complete/i.test(text)) {
    return "complete";
  }

  return "other";
}

export function detectQcPass(message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  const verdict = String(structured?.verdict || "").toUpperCase();
  if (verdict === "PASS" || verdict === "PASS WITH WARNINGS") {
    return true;
  }
  if (!/\bQC\b|Overall Verdict:/i.test(text)) {
    return false;
  }
  return /QC passed|QC pass|Overall Verdict:\s*PASS(?: WITH WARNINGS)?\b/i.test(text);
}

export function detectQcFail(message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  if (String(structured?.verdict || "").toUpperCase() === "FAIL") {
    return true;
  }
  if (!/\bQC\b|Overall Verdict:/i.test(text)) {
    return false;
  }
  return /QC failure|QC failed|QC fail|Overall Verdict:\s*FAIL\b/i.test(text);
}

export function detectQcPhase(message) {
  const structured = extractStructuredResult(message);
  const structuredPhase = String(structured?.phase || "").toLowerCase();
  if (structuredPhase === "tester" || structuredPhase === "coder") {
    return structuredPhase;
  }

  const text = normalizeText(message);
  const match = text.match(/(?:--phase=|phase\s*[:=]\s*|trigger phase\s*[:=]\s*)(tester|coder)/i);
  return match ? match[1].toLowerCase() : null;
}

export function detectTaskCompletionMessage(message) {
  const text = normalizeText(message);
  return /(?:task status:\s*done|final status:\s*done|task complete|task completed|completed the task)/i.test(text);
}

export function detectFailureCategories(message) {
  const text = normalizeText(message);
  const keywordText = text
    .replace(/"[^"\n]*"/g, " ")
    .replace(/“[^”\n]*”/g, " ")
    .replace(/'[^'\n]*'/g, " ")
    .replace(/`[^`\n]*`/g, " ");
  const categories = new Set();
  const structured = extractStructuredResult(message);

  if (Array.isArray(structured?.categories)) {
    for (const category of structured.categories) {
      const normalized = String(category || "").trim();
      if (normalized) {
        categories.add(normalized);
      }
    }
  }

  if (/TODO|FIXME|placeholder/i.test(keywordText)) {
    categories.add("placeholder");
  }
  if (/FAKE TEST|fake test/i.test(keywordText)) {
    categories.add("fake-test");
  }
  if (/MISSING TEST/i.test(keywordText)) {
    categories.add("missing-test");
  }
  if (/NOT IMPLEMENTED|missing implementation/i.test(keywordText)) {
    categories.add("missing-implementation");
  }
  if (/plan mismatch|plan align|Implementation Plan mismatch/i.test(keywordText)) {
    categories.add("plan-mismatch");
  }
  if (/error handling/i.test(keywordText)) {
    categories.add("error-handling");
  }
  if (/shared protocol|handoff protocol|interface between roles/i.test(keywordText)) {
    categories.add("shared-protocol");
  }
  if (/environment mismatch|connection refused|postgres service|CI missing/i.test(keywordText)) {
    categories.add("environment-mismatch");
  }

  return Array.from(categories);
}

export function suggestedRoutesForCategory(category) {
  switch (category) {
    case "placeholder":
      return [".codex/agents/coder.toml", ".codex/skills/qc/SKILL.md"];
    case "fake-test":
    case "missing-test":
      return [".codex/agents/tester.toml", ".codex/skills/qc/SKILL.md"];
    case "missing-implementation":
    case "plan-mismatch":
    case "error-handling":
      return [".codex/agents/coder.toml", ".codex/skills/qc/SKILL.md"];
    case "shared-protocol":
      return ["AGENTS.md", ".codex/templates/progress/current.md"];
    case "environment-mismatch":
      return [".codex/skills/submit/SKILL.md", "AGENTS.md"];
    default:
      return [".codex/skills/qc/SKILL.md"];
  }
}

export function recommendedActionForCategory(category) {
  switch (category) {
    case "placeholder":
      return "Placeholder comments must be treated as incomplete work and rejected before completion.";
    case "fake-test":
      return "Tests must verify behavior, not merely exercise code paths without meaningful assertions.";
    case "missing-test":
      return "Every requirement needs a real test before the testing phase is considered complete.";
    case "missing-implementation":
      return "Implementation claims must map to real behavior, not partial scaffolding.";
    case "plan-mismatch":
      return "QC should reject work that diverges from the implementation plan or acceptance criteria.";
    case "error-handling":
      return "Error handling must be explicit and verified, especially on edge and failure paths.";
    case "shared-protocol":
      return "When failures come from handoffs between roles, update shared workflow protocols, not only role docs.";
    case "environment-mismatch":
      return "Environment-specific failures should route to CI or deployment guidance before repeated coding retries.";
    default:
      return "Repeated QC failures should be captured as reusable governance guidance.";
  }
}

export function toGovernanceItemId(source, category) {
  const raw = `${basenameLabel(source)}-${category}`.toLowerCase();
  return `governance-item-${raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}
