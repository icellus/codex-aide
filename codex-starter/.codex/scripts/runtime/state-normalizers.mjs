import { detectSubagentStatus, extractStructuredResult } from "./structured.mjs";

export function normalizeEventName(input = {}) {
  const raw = String(input.event || input.hook_event_name || "").trim().toLowerCase();

  if (!raw) {
    return "";
  }

  if (raw === "subagentstop" || raw === "subagent_stop" || raw === "subagent-result") {
    return "subagent_result";
  }

  if (raw === "stop" || raw === "session-stop" || raw === "session_close") {
    return "session_end";
  }

  if (raw === "task-stop" || raw === "task_complete" || raw === "task-complete" || raw === "task-settled") {
    return "task_settled";
  }

  return raw;
}

export function normalizeRole(input = {}, message = "") {
  const structured = extractStructuredResult(message);
  const raw = String(input.role || input.agent_type || structured?.role || "").trim().toLowerCase();

  if (raw === "qc_reviewer") {
    return "qc";
  }

  if (raw === "submit_worker") {
    return "submit";
  }

  return raw;
}

export function normalizeMessage(input = {}) {
  return String(input.message || input.last_assistant_message || input.report || "");
}

export function normalizeStatus(input = {}, role, message) {
  const explicitStatus = String(input.status || "").trim().toLowerCase();
  if (explicitStatus) {
    return explicitStatus;
  }

  return detectSubagentStatus(role, message);
}

export function normalizeWorkflowPhase(value, fallback = "idle") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || fallback;
}

export function normalizeWorkflowChainId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function structuredChainId(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return (
    normalizeWorkflowChainId(value.chain_id) ||
    normalizeWorkflowChainId(value.chainId) ||
    normalizeWorkflowChainId(value.workflow_chain_id) ||
    normalizeWorkflowChainId(value.workflowChainId)
  );
}

export function resolveWorkflowChainId(input = {}, message = "", preferredStructured = null) {
  const inputWorkflow =
    input.workflow && typeof input.workflow === "object" && !Array.isArray(input.workflow) ? input.workflow : {};
  const inputStructured =
    input.structured_result && typeof input.structured_result === "object" && !Array.isArray(input.structured_result)
      ? input.structured_result
      : {};
  const structured =
    preferredStructured && typeof preferredStructured === "object" && !Array.isArray(preferredStructured)
      ? preferredStructured
      : extractStructuredResult(message) || {};

  return (
    normalizeWorkflowChainId(input.chain_id) ||
    normalizeWorkflowChainId(input.chainId) ||
    normalizeWorkflowChainId(input.workflow_chain_id) ||
    normalizeWorkflowChainId(input.workflowChainId) ||
    normalizeWorkflowChainId(inputWorkflow.chain_id) ||
    normalizeWorkflowChainId(inputWorkflow.chainId) ||
    normalizeWorkflowChainId(inputWorkflow.workflow_chain_id) ||
    normalizeWorkflowChainId(inputWorkflow.workflowChainId) ||
    structuredChainId(inputStructured) ||
    structuredChainId(structured)
  );
}

function sanitizeChainScopeSegment(value, fallback = "current-task") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

export function generateWorkflowChainId(taskId) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const scope = sanitizeChainScopeSegment(taskId || "current-task");
  const nonce = Math.random().toString(36).slice(2, 8);
  return `chain-${timestamp}-${scope}-${nonce}`;
}

export function workflowChainMatches(expectedChainId, actualChainId) {
  const expected = normalizeWorkflowChainId(expectedChainId);
  if (!expected) {
    return true;
  }

  const actual = normalizeWorkflowChainId(actualChainId);
  if (!actual) {
    return true;
  }

  return actual === expected;
}

export function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function defaultGovernanceDisposition(level) {
  return String(level || "").trim().toUpperCase() === "G1" ? "auto-fix" : "ask-user";
}

export function normalizeGovernanceCandidates(message) {
  const structured = extractStructuredResult(message);
  if (!Array.isArray(structured?.governance_candidates)) {
    return [];
  }

  return structured.governance_candidates
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const issue = String(entry.issue || "").trim();
      const level = String(entry.level || "").trim().toUpperCase();
      const impact = String(entry.impact || "").trim();
      const authorityTarget = String(entry.authority_target || "").trim();
      const recommendedAction = String(entry.recommended_action || "").trim();
      const disposition = String(entry.disposition || "").trim().toLowerCase();

      if (!issue && !impact && !authorityTarget && !recommendedAction) {
        return null;
      }

      return {
        issue: issue || "No issue provided.",
        level: level === "G1" || level === "G2" || level === "G3" ? level : "G2",
        impact: impact || "Governance follow-up required.",
        authority_target: authorityTarget || "to-be-determined",
        recommended_action: recommendedAction || "review and decide next step",
        disposition: disposition || defaultGovernanceDisposition(level || "G2")
      };
    })
    .filter(Boolean);
}

export function normalizeProductMemoryUpdates(message) {
  const structured = extractStructuredResult(message) || {};
  const updates = structured.memory_updates_applied;
  if (!updates || typeof updates !== "object") {
    return {
      userPreferences: [],
      repoPreferences: []
    };
  }

  const normalizePreferenceEntries = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (typeof entry === "string") {
          const text = String(entry).trim();
          return text ? { id: "", preference: text, applies_to: "", source: "explicit|repeated" } : null;
        }
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const preference = String(entry.preference || "").trim();
        const appliesTo = String(entry.applies_to || "").trim();
        const source = String(entry.source || "").trim();
        if (!preference && !appliesTo && !source) {
          return null;
        }
        return {
          id: String(entry.id || "").trim(),
          preference,
          applies_to: appliesTo,
          source: source || "explicit|repeated"
        };
      })
      .filter(Boolean);
  };

  return {
    userPreferences: normalizePreferenceEntries(updates.user_preferences),
    repoPreferences: normalizePreferenceEntries(updates.repo_preferences)
  };
}

export function normalizeProductTemplateChanges(message) {
  const structured = extractStructuredResult(message) || {};
  const entries = structured.template_updates_applied;
  if (Array.isArray(entries)) {
    return entries
      .map((entry) => {
        if (typeof entry === "string") {
          const filePath = String(entry).trim();
          return filePath ? { id: "", path: filePath, artifact_type: "" } : null;
        }
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const filePath = String(entry.path || "").trim();
        const id = String(entry.id || "").trim();
        const artifactType = String(entry.artifact_type || "").trim();
        if (!filePath && !id && !artifactType) {
          return null;
        }
        return {
          id,
          path: filePath,
          artifact_type: artifactType
        };
      })
      .filter(Boolean);
  }

  return normalizeStringList(structured.template_files_changed).map((filePath) => ({
    id: "",
    path: filePath,
    artifact_type: ""
  }));
}

export function normalizeProductOpenGaps(message) {
  const structured = extractStructuredResult(message) || {};
  return normalizeStringList(structured.open_gaps);
}

export function normalizeProductGovernanceCandidates(message) {
  const structured = extractStructuredResult(message) || {};
  if (!Array.isArray(structured?.governance_candidates)) {
    return [];
  }

  return structured.governance_candidates
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const issue = String(entry.issue || "").trim();
      const level = String(entry.level || "").trim().toUpperCase();
      const impact = String(entry.impact || "").trim();
      const authorityTarget = String(entry.authority_target || "").trim();
      const recommendedAction = String(entry.recommended_action || "").trim();
      const disposition = String(entry.disposition || "").trim().toLowerCase();
      const source = String(entry.source || "").trim();
      if (!issue && !impact && !authorityTarget && !recommendedAction && !source) {
        return null;
      }

      return {
        issue: issue || "No issue provided.",
        level: level === "G1" || level === "G2" || level === "G3" ? level : "G2",
        impact: impact || "Governance follow-up required.",
        authority_target: authorityTarget || "to-be-determined",
        recommended_action: recommendedAction || "review and decide next step",
        disposition: disposition || defaultGovernanceDisposition(level || "G2"),
        source: source || "product_assistant"
      };
    })
    .filter(Boolean);
}
