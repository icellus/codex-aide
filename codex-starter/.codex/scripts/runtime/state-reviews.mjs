import { extractStructuredResult, highestGovernanceLevel } from "./structured.mjs";
import {
  normalizeGovernanceCandidates,
  normalizeProductGovernanceCandidates,
  normalizeProductMemoryUpdates,
  normalizeProductOpenGaps,
  normalizeProductTemplateChanges,
  normalizeStringList
} from "./state-normalizers.mjs";
import { upsertPendingAction } from "./state.mjs";

export function governanceLevelForRetryCount(triggerCount) {
  return triggerCount >= 4 ? "G3" : "G2";
}

export function defaultGovernanceDisposition(level) {
  return String(level || "").trim().toUpperCase() === "G1" ? "auto-fix" : "ask-user";
}

export function upsertSessionRetrospective(state, taskId, details = {}) {
  const id = details.id || `session-retrospective:${taskId || "unknown"}`;
  upsertPendingAction(state, {
    id,
    type: "session_retrospective",
    taskId,
    ...details
  });
}

export function upsertGovernanceReview(state, details = {}) {
  const scopeKey = details.taskId || "current-task";
  const issueKey = String(details.issueKey || details.sourceRole || details.issue || "general")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const level = String(details.level || "").trim().toUpperCase() || "G2";

  upsertPendingAction(state, {
    id: details.id || `governance-review:${issueKey}:${scopeKey}`,
    type: "governance_review",
    scope: details.scope || undefined,
    issue: details.issue || "governance review pending",
    level: level === "G1" || level === "G2" || level === "G3" ? level : "G2",
    impact: details.impact || "Governance follow-up required.",
    authority_target: details.authority_target || details.authorityTarget || "to-be-determined",
    recommended_action: details.recommended_action || details.recommendedAction || "review and decide next step",
    disposition: details.disposition || defaultGovernanceDisposition(level),
    taskId: details.taskId || null,
    sourceRole: details.sourceRole || null,
    note: details.note || "",
    decisions: normalizeStringList(details.decisions),
    wrongAssumptions: normalizeStringList(details.wrongAssumptions),
    governance_candidates: Array.isArray(details.governance_candidates)
      ? details.governance_candidates
      : Array.isArray(details.governanceCandidates)
        ? details.governanceCandidates
        : []
  });
}

export function recordArchitectRetrospective(state, taskId, message) {
  const structured = extractStructuredResult(message) || {};
  const decisions = normalizeStringList(structured.key_decisions);
  const wrongAssumptions = normalizeStringList(structured.wrong_assumptions);
  const tradeoffs = normalizeStringList(structured.technical_tradeoffs);
  const candidates = normalizeGovernanceCandidates(message);

  upsertSessionRetrospective(state, taskId, {
    id: `session-retrospective:architect:${taskId || "current-task"}`,
    trigger: "architect_review",
    role: "architect",
    note: `Architect review captured${decisions.length > 0 ? ` decisions: ${decisions.slice(0, 2).join("; ")}` : ""}${
      wrongAssumptions.length > 0 ? `. Wrong assumptions: ${wrongAssumptions.slice(0, 2).join("; ")}` : ""
    }`,
    categories: Array.from(new Set(candidates.map((item) => item.level))),
    decisions,
    wrongAssumptions,
    tradeoffs
  });

  if (candidates.length === 0) {
    return;
  }

  upsertGovernanceReview(state, {
    issueKey: `architect:${taskId || "current-task"}`,
    taskId,
    sourceRole: "architect",
    issue: `Architect completed with ${candidates.length} governance candidate(s).`,
    level: highestGovernanceLevel(candidates.map((item) => item.level), "G2"),
    impact: "Architect produced reusable governance corrections that may affect shared role guidance or authority files.",
    authority_target:
      candidates.length === 1
        ? candidates[0].authority_target
        : ".codex/policies/aide-governance-policy.md",
    recommended_action: "Review the governance candidates and apply only the smallest authority update that stays within the agreed boundary.",
    disposition: candidates.every((item) => item.disposition === "auto-fix") ? "auto-fix" : "ask-user",
    note: `Architect completed with ${candidates.length} governance candidate(s). Review the shared workflow before the next similar task.`,
    decisions,
    wrongAssumptions,
    governance_candidates: candidates
  });
}

function reviewLevelForProductResult(candidates = [], openGaps = [], memoryUpdates, templateChanges) {
  if (openGaps.length > 0) {
    return "G2";
  }

  if (candidates.some((item) => item.level === "G3")) {
    return "G3";
  }

  if (candidates.some((item) => item.level === "G2")) {
    return "G2";
  }

  if (
    candidates.length > 0 ||
    templateChanges.length > 0 ||
    memoryUpdates.userPreferences.length > 0 ||
    memoryUpdates.repoPreferences.length > 0
  ) {
    return "G1";
  }

  return "G1";
}

export function recordProductAssistantReview(state, taskId, status, message) {
  const memoryUpdates = normalizeProductMemoryUpdates(message);
  const templateChanges = normalizeProductTemplateChanges(message);
  const openGaps = normalizeProductOpenGaps(message);
  const candidates = normalizeProductGovernanceCandidates(message);

  if (status === "blocked") {
    upsertPendingAction(state, {
      id: `blocked-review:product:${taskId || "current-task"}`,
      type: "blocked_review",
      phase: "product_assistant",
      taskId,
      note: "Recent product_assistant blockage detected. Review the missing context or route before continuing."
    });

    upsertGovernanceReview(state, {
      issueKey: `blocked:product:${taskId || "current-task"}`,
      taskId,
      sourceRole: "product_assistant",
      issue: "A product_assistant task blocked.",
      level: "G3",
      impact: "The non-code delivery line cannot continue until Aide re-triages the task across the three direct downstreams.",
      authority_target: ".codex/skills/aide/SKILL.md",
      recommended_action: "Review the chat record and re-triage through Aide across product_manager, technical_manager, and product_assistant lines.",
      disposition: "ask-user",
      note: "A product_assistant task blocked. Review the chat record and re-triage through Aide across product_manager, technical_manager, and product_assistant lines."
    });
    return;
  }

  const shouldReview =
    templateChanges.length > 0 ||
    memoryUpdates.userPreferences.length > 0 ||
    memoryUpdates.repoPreferences.length > 0 ||
    candidates.length > 0 ||
    openGaps.length > 0;

  if (!shouldReview) {
    return;
  }

  const noteParts = [];
  if (templateChanges.length > 0) {
    noteParts.push(
      `template changes: ${templateChanges
        .slice(0, 2)
        .map((item) => item.path || item.id || "template-update")
        .join(", ")}`
    );
  }
  if (memoryUpdates.userPreferences.length > 0 || memoryUpdates.repoPreferences.length > 0) {
    noteParts.push("memory updates proposed");
  }
  if (candidates.length > 0) {
    noteParts.push(`governance candidates: ${candidates.map((item) => item.issue).slice(0, 2).join("; ")}`);
  }
  if (openGaps.length > 0) {
    noteParts.push(`open gaps: ${openGaps.slice(0, 2).join("; ")}`);
  }

  const level = reviewLevelForProductResult(candidates, openGaps, memoryUpdates, templateChanges);
  upsertGovernanceReview(state, {
    issueKey: `product-review:${taskId || "current-task"}`,
    taskId,
    sourceRole: "product_assistant",
    issue: "Completed product_assistant result requires governance review.",
    level,
    impact:
      level === "G1"
        ? "Low-risk non-code guidance or preference updates may be ready for direct writeback."
        : "The completed non-code result affects long-term guidance, routing clarity, or reusable delivery expectations.",
    authority_target:
      candidates[0]?.authority_target ||
      ".codex/policies/aide-governance-policy.md",
    recommended_action:
      level === "G1"
        ? "Review the result for low-risk writeback and keep only the smallest safe update."
        : "Review the completed result against the chat record before applying any durable governance change.",
    disposition: defaultGovernanceDisposition(level),
    note: `Review the completed product_assistant result against the chat record before accepting long-term writeback${noteParts.length > 0 ? ` (${noteParts.join("; ")})` : ""}.`
  });
}
