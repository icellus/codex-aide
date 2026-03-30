#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  compactText,
  detectFailureCategories,
  detectQcFail,
  detectQcPhase,
  detectQcPass,
  detectTaskCompletionMessage,
  detectSubagentStatus,
  extractStructuredResult,
  findProgressFile,
  getProjectContext,
  highestGovernanceLevel,
  isLongRunningProfile,
  isQcEnabled,
  isSubmitEnabled,
  isTaskSettled,
  loadDeliveryPolicy,
  loadProjectProfileState,
  loadRuntimeState,
  loadTaskContext,
  normalizeTaskWorkflowState,
  parseActivePlans,
  readJsonStdinEnvelope,
  recommendedActionForCategory,
  removePendingActions,
  resolveActiveTask,
  saveRuntimeState,
  saveTaskContext,
  startRuntimeInvocationLogging,
  suggestedRoutesForCategory,
  syncTaskRegistry,
  syncProgressFromState,
  toGovernanceItemId,
  trimRuntimeState,
  upsertGovernanceQueueItem,
  upsertPendingAction,
  validateStructuredResultContract
} from "./runtime-utils.mjs";

function normalizeEventName(input = {}) {
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

function normalizeRole(input = {}, message = "") {
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

function normalizeMessage(input = {}) {
  return String(input.message || input.last_assistant_message || input.report || "");
}

function normalizeStatus(input = {}, role, message) {
  const explicitStatus = String(input.status || "").trim().toLowerCase();
  if (explicitStatus) {
    return explicitStatus;
  }

  return detectSubagentStatus(role, message);
}

function normalizeWorkflowPhase(value, fallback = "idle") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || fallback;
}

function normalizeWorkflowChainId(value) {
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

function resolveWorkflowChainId(input = {}, message = "", preferredStructured = null) {
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

function generateWorkflowChainId(taskId) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const scope = sanitizeChainScopeSegment(taskId || "current-task");
  const nonce = Math.random().toString(36).slice(2, 8);
  return `chain-${timestamp}-${scope}-${nonce}`;
}

function workflowChainMatches(expectedChainId, actualChainId) {
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

function upsertSessionRetrospective(state, taskId, details = {}) {
  const id = details.id || `session-retrospective:${taskId || "unknown"}`;
  upsertPendingAction(state, {
    id,
    type: "session_retrospective",
    taskId,
    ...details
  });
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeGovernanceCandidates(message) {
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

function normalizeProductMemoryUpdates(message) {
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

function normalizeProductTemplateChanges(message) {
  const structured = extractStructuredResult(message) || {};
  const entries = structured.template_updates_applied;
  if (Array.isArray(entries)) {
    return entries
      .map((entry) => {
        if (typeof entry === "string") {
          const path = String(entry).trim();
          return path ? { id: "", path, artifact_type: "" } : null;
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

  return normalizeStringList(structured.template_files_changed).map((path) => ({
    id: "",
    path,
    artifact_type: ""
  }));
}

function normalizeProductOpenGaps(message) {
  const structured = extractStructuredResult(message) || {};
  return normalizeStringList(structured.open_gaps);
}

function normalizeProductGovernanceCandidates(message) {
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

function governanceLevelForRetryCount(triggerCount) {
  return triggerCount >= 4 ? "G3" : "G2";
}

function defaultGovernanceDisposition(level) {
  return String(level || "").trim().toUpperCase() === "G1" ? "auto-fix" : "ask-user";
}

function upsertGovernanceReview(state, details = {}) {
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

function recordArchitectRetrospective(state, taskId, message) {
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

function recordProductAssistantReview(state, taskId, status, message) {
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

function currentTaskLabel(profile, taskId) {
  return String(profile.task || "").trim() || (taskId || "current-task");
}

function buildTaskContextWorkflowPatch(profile, workflow, hasTaskContextFile) {
  if (hasTaskContextFile) {
    return {
      task: {
        workflow
      }
    };
  }

  return {
    collaboration: {
      preferred_address: String(profile.preferredAddress || "Boss"),
      greeting_style: String(profile.greetingStyle || "warm"),
      first_startup_greeting_completed: Boolean(profile.firstStartupGreetingCompleted)
    },
    task: {
      current_task: String(profile.task || ""),
      status: String(profile.taskStatus || "idle"),
      class: String(profile.taskClass || "unknown"),
      risk: String(profile.riskLevel || "unknown"),
      delivery_mode: String(profile.deliveryMode || "lightweight"),
      route_rationale: String(profile.routeRationale || ""),
      routing_overrides: Array.isArray(profile.routingOverrides) ? profile.routingOverrides : [],
      enabled_roles: Array.isArray(profile.enabledRoles) ? profile.enabledRoles : [],
      enabled_modules: Array.isArray(profile.enabledModules) ? profile.enabledModules : [],
      qc_policy: String(profile.qcPolicy || "disabled"),
      submit_policy: String(profile.submitPolicy || "enabled"),
      validation_profile_status: String(profile.validationProfileStatus || "not-set"),
      open_questions: Array.isArray(profile.openQuestions) ? profile.openQuestions : [],
      workflow
    }
  };
}

function normalizeWorkflowTaskId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function workflowScopeMatches(requiredTaskId, taskId) {
  const required = normalizeWorkflowTaskId(requiredTaskId);
  if (!required) {
    return true;
  }

  if (!taskId) {
    return true;
  }

  return required === taskId;
}

function resolveWorkflowScopedTaskId(taskId, workflow) {
  return normalizeWorkflowTaskId(taskId) || normalizeWorkflowTaskId(workflow?.required_handoff_task_id) || null;
}

function resolveRuntimeTaskId(taskRegistry, input, projectDir) {
  const activeTask = resolveActiveTask(taskRegistry, input, projectDir);
  return activeTask?.id || null;
}

function inferWorkflowPhaseFromChain(chain, fallback = "idle") {
  const normalizedChain = String(chain || "").trim().toLowerCase();
  if (!normalizedChain) {
    return normalizeWorkflowPhase(fallback, "idle");
  }

  if (normalizedChain === "tester_blocked") {
    return "tester";
  }

  if (normalizedChain === "settlement_blocked" || normalizedChain === "qc" || normalizedChain === "submit") {
    return normalizeWorkflowPhase(fallback, "coder");
  }

  return normalizedChain;
}

function updateWorkflowState(workflow, patch = {}) {
  const next = normalizeTaskWorkflowState({
    ...(workflow || {}),
    ...(patch || {}),
    updated_at: new Date().toISOString()
  });
  Object.assign(workflow, next);
}

function markWorkflowRequiresTesterHandoff(workflow, taskId, chain, reason, options = {}) {
  const phase = normalizeWorkflowPhase(options.phase, inferWorkflowPhaseFromChain(chain, workflow?.phase || "coder"));
  const chainId = normalizeWorkflowChainId(options.chainId) || normalizeWorkflowChainId(workflow?.chain_id);
  updateWorkflowState(workflow, {
    phase,
    chain_id: chainId,
    current_chain: chain,
    expected_next_step: "tester_handoff",
    required_handoff: "tester",
    required_handoff_task_id: taskId || null,
    settlement_guard: "require_required_handoff",
    settlement_guard_reason: reason
  });
}

function markWorkflowTesterHandoffCompleted(workflow, profile, deliveryPolicy, options = {}) {
  const expectedNext = isQcEnabled(profile)
    ? "qc"
    : isSubmitEnabled(profile, deliveryPolicy)
      ? "submit"
      : "none";
  const chainId = normalizeWorkflowChainId(options.chainId) || normalizeWorkflowChainId(workflow?.chain_id);

  updateWorkflowState(workflow, {
    phase: "tester",
    chain_id: chainId,
    current_chain: "tester",
    expected_next_step: expectedNext,
    required_handoff: "none",
    required_handoff_task_id: null,
    settlement_guard: "none",
    settlement_guard_reason: ""
  });
}

function markWorkflowSettled(workflow) {
  updateWorkflowState(workflow, {
    phase: "settled",
    current_chain: "settled",
    expected_next_step: "none",
    required_handoff: "none",
    required_handoff_task_id: null,
    settlement_guard: "none",
    settlement_guard_reason: ""
  });
}

function workflowRequiresTesterHandoff(workflow, taskId) {
  if (workflow?.required_handoff !== "tester") {
    return false;
  }

  if (workflow?.settlement_guard !== "require_required_handoff") {
    return false;
  }

  return workflowScopeMatches(workflow.required_handoff_task_id, taskId);
}

function hasPendingQc(state, taskId) {
  return state.pendingActions.some(
    (item) => item.type === "run_qc" && matchesTaskScope(item.taskId, taskId)
  );
}

function hasPendingSubmit(state, taskId) {
  return state.pendingActions.some(
    (item) => item.type === "run_submit" && matchesTaskScope(item.taskId, taskId)
  );
}

function hasRequiredTesterHandoff(state, taskId, workflow) {
  return (
    hasPendingTesterHandoff(state, taskId, workflow?.chain_id) ||
    workflowRequiresTesterHandoff(workflow, taskId)
  );
}

function syncWorkflowExpectedNextStep(state, taskId, workflow) {
  if (hasRequiredTesterHandoff(state, taskId, workflow)) {
    updateWorkflowState(workflow, { expected_next_step: "tester_handoff" });
    return;
  }

  if (hasPendingQc(state, taskId)) {
    updateWorkflowState(workflow, { expected_next_step: "qc" });
    return;
  }

  if (hasPendingSubmit(state, taskId)) {
    updateWorkflowState(workflow, { expected_next_step: "submit" });
    return;
  }

  updateWorkflowState(workflow, { expected_next_step: "none" });
}

function hasHotTaskState(state, taskId) {
  const hasPending = state.pendingActions.some((item) => {
    if (
      item.type !== "run_tester" &&
      item.type !== "run_qc" &&
      item.type !== "run_submit" &&
      item.type !== "blocked_review" &&
      item.type !== "session_retrospective"
    ) {
      return false;
    }

    if (taskId) {
      return item.taskId === taskId;
    }

    return !item.taskId;
  });

  return hasPending || Boolean(state.sessionContext.lastReminderText);
}

function hasOutstandingCompletionWork(state, taskId) {
  return state.pendingActions.some((item) => {
    if (item.type !== "run_tester" && item.type !== "run_qc" && item.type !== "run_submit" && item.type !== "blocked_review") {
      return false;
    }

    if (taskId) {
      return item.taskId === taskId;
    }

    return !item.taskId;
  });
}

function upsertCompletedTask(state, entry) {
  const index = state.completedTasks.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    state.completedTasks[index] = {
      ...state.completedTasks[index],
      ...entry
    };
    return;
  }

  state.completedTasks.push(entry);
}

function clearHotTaskState(state, taskId, profile, message, workflow) {
  removePendingActions(state, (item) => {
    if (
      item.type !== "run_tester" &&
      item.type !== "run_qc" &&
      item.type !== "run_submit" &&
      item.type !== "blocked_review" &&
      item.type !== "session_retrospective"
    ) {
      return false;
    }

    if (taskId) {
      return item.taskId === taskId;
    }

    return !item.taskId;
  });

  state.sessionContext.lastReminderText = "";
  markWorkflowSettled(workflow);

  upsertCompletedTask(state, {
    id: taskId ? `task:${taskId}` : `task:${currentTaskLabel(profile, taskId)}`,
    task: currentTaskLabel(profile, taskId),
    taskId,
    deliveryMode: profile.deliveryMode || null,
    completedAt: new Date().toISOString(),
    summary: compactText(message || profile.routeRationale || currentTaskLabel(profile, taskId), 160)
  });
}

function shouldCompressCompletedTask(profile, state, taskId, message) {
  if (hasOutstandingCompletionWork(state, taskId)) {
    return false;
  }

  const taskStatus = String(profile.taskStatus || "").toLowerCase();

  if (taskStatus === "done") {
    return taskId ? true : hasHotTaskState(state, taskId);
  }

  if (taskStatus === "idle") {
    return taskId ? hasHotTaskState(state, taskId) : false;
  }

  if (isTaskSettled(profile)) {
    return true;
  }

  return detectTaskCompletionMessage(message);
}

function resolveQcPhaseForMetrics(state, message, taskId) {
  const explicit = detectQcPhase(message);
  if (explicit === "tester" || explicit === "coder") {
    return explicit;
  }

  const queued = state.pendingActions
    .filter((item) => item.type === "run_qc" && (!taskId || item.taskId === taskId))
    .slice(-1)[0];

  if (queued?.phase === "tester" || queued?.phase === "coder") {
    return queued.phase;
  }

  return "manual";
}

function recordQcMetrics(state, taskId, message, verdict, categories = []) {
  const phase = resolveQcPhaseForMetrics(state, message, taskId);
  const bucket = state.qualityMetrics.qcByPhase[phase] || { runs: 0, passes: 0, fails: 0 };

  state.qualityMetrics.qcRuns += 1;
  bucket.runs += 1;

  if (verdict === "pass") {
    state.qualityMetrics.qcPasses += 1;
    bucket.passes += 1;
  } else {
    state.qualityMetrics.qcFails += 1;
    bucket.fails += 1;
  }

  state.qualityMetrics.qcByPhase[phase] = bucket;

  for (const category of categories) {
    state.qualityMetrics.failureCategoryCounts[category] =
      (state.qualityMetrics.failureCategoryCounts[category] || 0) + 1;
  }

  state.qualityMetrics.recentQcRuns.push({
    timestamp: new Date().toISOString(),
    taskId,
    phase,
    verdict,
    categories
  });
}

function matchesTaskScope(itemTaskId, taskId) {
  if (taskId) {
    return !itemTaskId || itemTaskId === taskId;
  }

  return !itemTaskId;
}

function isAmbiguousTaskScope(activePlans, taskId) {
  return Array.isArray(activePlans) && activePlans.length > 1 && !taskId;
}

function clearAmbiguousBlockedSignals(state, role) {
  removePendingActions(state, (item) => {
    if (item.type === "blocked_review") {
      return item.phase === role && item.scope === "ambiguous";
    }

    if (item.type === "governance_review") {
      return item.sourceRole === role && item.scope === "ambiguous";
    }

    return false;
  });
}

function hasAmbiguousBlockedSignals(state, role) {
  return state.pendingActions.some((item) => {
    if (item.type === "blocked_review") {
      return item.phase === role && item.scope === "ambiguous";
    }

    if (item.type === "governance_review") {
      return item.sourceRole === role && item.scope === "ambiguous";
    }

    return false;
  });
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function isProductAssistantPhaseToken(value) {
  const token = normalizeToken(value);
  return token === "product-assistant" || token === "product-assistant-blocked";
}

function isNonCodeRouteByProfile(profile = {}) {
  const taskClass = normalizeToken(profile.taskClass);
  if (taskClass.includes("non-code") || taskClass.includes("noncode") || taskClass.includes("artifact")) {
    return true;
  }

  const enabledModules = Array.isArray(profile.enabledModules) ? profile.enabledModules : [];
  return enabledModules.some((item) => {
    const token = normalizeToken(item);
    return token.includes("non-code") || token.includes("artifact");
  });
}

function isNonCodeRouteByWorkflow(workflow = {}) {
  return isProductAssistantPhaseToken(workflow?.phase) || isProductAssistantPhaseToken(workflow?.current_chain);
}

function hasProductAssistantSignal(state, taskId) {
  const scopedTaskId = taskId || null;
  const pendingActions = Array.isArray(state.pendingActions) ? state.pendingActions : [];
  const recentEvents = Array.isArray(state.recentSubagentEvents) ? state.recentSubagentEvents : [];

  if (
    pendingActions.some(
      (item) => item.phase === "product_assistant" && matchesTaskScope(item.taskId, scopedTaskId)
    )
  ) {
    return true;
  }

  return recentEvents.some(
    (item) =>
      item.agentType === "product_assistant" &&
      (scopedTaskId ? item.taskId === scopedTaskId : !item.taskId)
  );
}

function isNonCodeDeliveryRoute({ role = "", workflow = {}, profile = {}, state = null, taskId = null } = {}) {
  if (normalizeToken(role) === "product-assistant") {
    return true;
  }

  if (isNonCodeRouteByWorkflow(workflow)) {
    return true;
  }

  if (isNonCodeRouteByProfile(profile)) {
    return true;
  }

  if (state && hasProductAssistantSignal(state, taskId)) {
    return true;
  }

  return false;
}

function shouldQueueByPolicy(deliveryPolicy, trigger) {
  if (!trigger) {
    return true;
  }

  return deliveryPolicy?.submit?.queue_after?.[trigger] !== false;
}

function queueSubmit(state, taskId, note, trigger) {
  upsertPendingAction(state, {
    id: `run-submit:${taskId || "current-task"}`,
    type: "run_submit",
    taskId,
    trigger,
    note
  });
}

function queueTesterHandoff(
  state,
  taskId,
  trigger = "coder_complete_requires_tester",
  chainId = null,
  note = "Coder completed. Route back through technical_manager to hand off tester for required validation."
) {
  const normalizedChainId = normalizeWorkflowChainId(chainId);
  upsertPendingAction(state, {
    id: `run-tester:${taskId || "current-task"}`,
    type: "run_tester",
    phase: "tester",
    taskId,
    chain_id: normalizedChainId,
    workflow_chain_id: normalizedChainId,
    trigger,
    note
  });
}

function clearExecutionContinuation(state, taskId) {
  removePendingActions(
    state,
    (item) =>
      (item.type === "run_tester" || item.type === "run_qc" || item.type === "run_submit") &&
      matchesTaskScope(item.taskId, taskId)
  );
}

function clearTesterHandoff(state, taskId, chainId = null) {
  removePendingActions(
    state,
    (item) =>
      item.type === "run_tester" &&
      matchesTaskScope(item.taskId, taskId) &&
      workflowChainMatches(chainId, item.chain_id || item.workflow_chain_id)
  );
}

function hasPendingTesterHandoff(state, taskId, chainId = null) {
  if (!taskId) {
    return state.pendingActions.some(
      (item) => item.type === "run_tester" && workflowChainMatches(chainId, item.chain_id || item.workflow_chain_id)
    );
  }

  return state.pendingActions.some(
    (item) =>
      item.type === "run_tester" &&
      matchesTaskScope(item.taskId, taskId) &&
      workflowChainMatches(chainId, item.chain_id || item.workflow_chain_id)
  );
}

function detectMissingTaskImplementationBrief(role, message, structured = null) {
  if (role !== "coder" && role !== "tester") {
    return false;
  }

  const textParts = [String(message || "")];

  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    if (Array.isArray(structured.blockers)) {
      textParts.push(
        structured.blockers
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .join("\n")
      );
    }
    textParts.push(String(structured.brief_path || structured.briefPath || structured.brief || ""));
  }

  const text = textParts.join("\n");
  const mentionsBrief = /implementation brief|任务实施说明|execution brief|execution input|brief_path|brief path/i.test(text);
  const missingSignal =
    /missing|not found|unreadable|cannot read|unable to read|not provided|empty|缺失|缺少|不存在|未提供|无法读取|不可读|为空|没给/i.test(
      text
    );

  return mentionsBrief && missingSignal;
}

function recordMissingTesterWorkflowBreak(state, taskId, source, note) {
  upsertPendingAction(state, {
    id: `blocked-review:tester-required:${source}:${taskId || "current-task"}`,
    type: "blocked_review",
    phase: "tester",
    taskId,
    note
  });

  upsertGovernanceReview(state, {
    issueKey: `tester-required:${source}:${taskId || "current-task"}`,
    taskId,
    sourceRole: source,
    issue: "Required tester handoff is missing.",
    level: "G3",
    impact: "The guarded technical delivery chain cannot settle until tester runs for the current workflow chain.",
    authority_target: ".codex/skills/technical_manager/SKILL.md",
    recommended_action: "Route back through Aide, then technical_manager, and re-run tester for the active chain before QC or submit.",
    disposition: "ask-user",
    note
  });
}

function submitLooksReady(profile, message) {
  return isTaskSettled(profile) || detectTaskCompletionMessage(message);
}

function shouldQueueSubmitAfterCompletion(role, profile, message, deliveryPolicy) {
  if (!isSubmitEnabled(profile, deliveryPolicy)) {
    return false;
  }

  if (isNonCodeDeliveryRoute({ role })) {
    return false;
  }

  if (role === "coder") {
    return false;
  }

  if (role === "tester") {
    return shouldQueueByPolicy(deliveryPolicy, "tester_complete_without_qc");
  }

  return submitLooksReady(profile, message) && shouldQueueByPolicy(deliveryPolicy, "task_settled_without_qc");
}

function shouldQueueSubmitAfterQc(state, taskId, profile, message, deliveryPolicy, workflow) {
  if (!isSubmitEnabled(profile, deliveryPolicy)) {
    return false;
  }

  if (isNonCodeDeliveryRoute({ workflow, profile, state, taskId })) {
    return false;
  }

  if (hasRequiredTesterHandoff(state, taskId, workflow)) {
    return false;
  }

  const phase = resolveQcPhaseForMetrics(state, message, taskId);
  if (phase === "coder") {
    return false;
  }

  if (phase === "tester") {
    return shouldQueueByPolicy(deliveryPolicy, "qc_pass_after_tester");
  }

  return submitLooksReady(profile, message) && shouldQueueByPolicy(deliveryPolicy, "task_settled_after_qc");
}

function maybeQueueSubmitForSettledTask(state, taskId, profile, message, deliveryPolicy, workflow) {
  if (!isSubmitEnabled(profile, deliveryPolicy)) {
    return;
  }

  if (isNonCodeDeliveryRoute({ workflow, profile, state, taskId })) {
    return;
  }

  if (hasRequiredTesterHandoff(state, taskId, workflow)) {
    return;
  }

  if (isQcEnabled(profile) && !detectQcPass(message)) {
    return;
  }

  const trigger = detectQcPass(message) ? "task_settled_after_qc" : "task_settled_without_qc";
  if (!shouldQueueByPolicy(deliveryPolicy, trigger)) {
    return;
  }

  queueSubmit(state, taskId, "Task is settled and ready for governed delivery. Enter the submit path.", trigger);
}

function shouldBlockSettlementForMissingTester(state, taskId, message, workflow) {
  if (!hasRequiredTesterHandoff(state, taskId, workflow)) {
    return false;
  }

  return detectTaskCompletionMessage(message);
}

function blockSettlementForMissingTester(state, taskId, source, workflow) {
  const scopedTaskId = resolveWorkflowScopedTaskId(taskId, workflow);
  removePendingActions(
    state,
    (item) => item.type === "run_submit" && matchesTaskScope(item.taskId, scopedTaskId)
  );
  markWorkflowRequiresTesterHandoff(
    workflow,
    scopedTaskId,
    "settlement_blocked",
    "Settlement is blocked until required tester handoff completes."
  );
  recordMissingTesterWorkflowBreak(
    state,
    scopedTaskId,
    source,
    "Coder already ran, but task settlement was attempted before tester handoff. Main thread cannot replace tester."
  );
}

function processQcOutcome(state, taskId, profile, message, deliveryPolicy, workflow) {
  const scopedTaskId = resolveWorkflowScopedTaskId(taskId, workflow);
  if (detectQcPass(message)) {
    recordQcMetrics(state, taskId, message, "pass");

    if (hasRequiredTesterHandoff(state, taskId, workflow)) {
      removePendingActions(
        state,
        (item) => item.type === "run_submit" && matchesTaskScope(item.taskId, scopedTaskId)
      );
      markWorkflowRequiresTesterHandoff(
        workflow,
        scopedTaskId,
        "qc",
        "QC cannot replace required tester handoff after coder completion."
      );
      recordMissingTesterWorkflowBreak(
        state,
        scopedTaskId,
        "qc",
        "QC completed before required tester handoff. QC is optional and cannot replace tester after coder."
      );
      return;
    }

    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesTaskScope(item.taskId, taskId)
    );
    removePendingActions(
      state,
      (item) => item.type === "blocked_review" && item.scope !== "ambiguous" && matchesTaskScope(item.taskId, taskId)
    );

    if (shouldQueueSubmitAfterQc(state, taskId, profile, message, deliveryPolicy, workflow)) {
      const phase = resolveQcPhaseForMetrics(state, message, taskId);
      queueSubmit(
        state,
        taskId,
        "QC passed for a deliverable handoff. Enter the submit path.",
        phase === "tester" ? "qc_pass_after_tester" : "task_settled_after_qc"
      );
    }

    if (taskId) {
      const queuedForTask = state.governanceQueue.filter(
        (item) => item.status === "queued" && (item.source || "unknown") === taskId
      );

      if (queuedForTask.length > 0 && isLongRunningProfile(profile)) {
        upsertSessionRetrospective(state, taskId, {
          trigger: "qc_pass_after_retries",
          categories: Array.from(new Set(queuedForTask.map((item) => item.category))),
          note: `QC passed for ${taskId}, but queued governance candidates remain. Decide in the retrospective which ones should route through Aide.`
        });
      }
    }
  }

  if (detectQcFail(message)) {
    const categories = detectFailureCategories(message);
    const escalatedCategories = [];
    recordQcMetrics(state, taskId, message, "fail", categories);

    if (hasRequiredTesterHandoff(state, taskId, workflow)) {
      markWorkflowRequiresTesterHandoff(
        workflow,
        scopedTaskId,
        "qc",
        "QC failed before required tester handoff completed."
      );
      recordMissingTesterWorkflowBreak(
        state,
        scopedTaskId,
        "qc",
        "QC failed before required tester handoff. QC cannot replace tester after coder."
      );
    }

    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesTaskScope(item.taskId, taskId)
    );
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesTaskScope(item.taskId, taskId)
    );

    if (taskId) {
      for (const category of categories) {
        const key = `${taskId}::${category}`;
        const existing = state.failurePatterns[key] || {
          taskId,
          category,
          count: 0,
          firstSeenAt: new Date().toISOString()
        };

        existing.taskId = taskId;
        existing.count += 1;
        existing.lastSeenAt = new Date().toISOString();
        state.failurePatterns[key] = existing;

        if (existing.count >= 2) {
          escalatedCategories.push({
            category,
            triggerCount: existing.count
          });
          upsertGovernanceQueueItem(state, {
            id: toGovernanceItemId(taskId, category),
            source: taskId,
            taskId,
            category,
            triggerCount: existing.count,
            suggestedRoute: suggestedRoutesForCategory(category),
            recommended_action: recommendedActionForCategory(category),
            issue: `Repeated QC failure category detected: ${category}.`,
            level: governanceLevelForRetryCount(existing.count),
            impact: `QC repeated the same failure category ${existing.count} time(s), indicating shared guidance or workflow drift.`,
            authority_target: suggestedRoutesForCategory(category)[0] || ".codex/policies/aide-governance-policy.md",
            disposition: "ask-user",
            status: "queued"
          });
        }
      }

      if (escalatedCategories.length > 0) {
        const level = highestGovernanceLevel(
          escalatedCategories.map((item) => governanceLevelForRetryCount(item.triggerCount)),
          "G2"
        );
        upsertGovernanceReview(state, {
          issueKey: `qc-pattern:${taskId || "current-task"}`,
          taskId,
          sourceRole: "qc",
          issue: "Repeated QC failure categories detected.",
          level,
          impact: "Shared prompts, handoff rules, or execution expectations are drifting across repeated failures.",
          authority_target: ".codex/policies/aide-governance-policy.md",
          recommended_action: "Review the repeated failure pattern and correct the smallest shared authority file instead of patching only the latest output.",
          disposition: "ask-user",
          note: `Repeated QC failure categories detected: ${escalatedCategories
            .map((item) => `${item.category} x${item.triggerCount}`)
            .join(", ")}. Review shared prompts and handoff rules instead of only patching the latest output.`
        });
      }

      if (categories.length > 0 && isLongRunningProfile(profile)) {
        upsertSessionRetrospective(state, taskId, {
          trigger: "qc_failure",
          categories,
          note: `QC failure categories detected for ${taskId}. Capture the wrong assumption, the corrective decision, and whether any lesson is durable enough for Aide governance review.`
        });
      }
    }
  }
}

function processSubmitOutcome(state, taskId, profile, message, status, workflow) {
  if (status === "complete") {
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesTaskScope(item.taskId, taskId)
    );
    removePendingActions(
      state,
      (item) => item.type === "blocked_review" && item.phase === "submit" && matchesTaskScope(item.taskId, taskId)
    );

    if (shouldCompressCompletedTask(profile, state, taskId, message)) {
      clearHotTaskState(state, taskId, profile, message, workflow);
    }
    return;
  }

  if (status === "blocked") {
    upsertPendingAction(state, {
      id: `blocked-review:submit:${taskId || "current-task"}`,
      type: "blocked_review",
      phase: "submit",
      taskId,
      note: "Governed delivery blocked. Review the submit report before continuing."
    });

    upsertGovernanceReview(state, {
      issueKey: `blocked:submit:${taskId || "current-task"}`,
      taskId,
      sourceRole: "submit",
      issue: "Submit step blocked the governed delivery flow.",
      level: "G3",
      impact: "Delivery cannot be completed until submit preconditions or environment constraints are resolved.",
      authority_target: ".codex/policies/delivery-policy.json",
      recommended_action: "Review branch policy, remotes, permissions, or delivery configuration before retrying submit.",
      disposition: "ask-user",
      note: "A submit step blocked the delivery flow. Review branch policy, remotes, permissions, or delivery configuration."
    });
  }
}

function recordSubagentResult(input, state, activePlans, taskRegistry, projectDir, profile, deliveryPolicy, workflow) {
  const message = normalizeMessage(input);
  const role = normalizeRole(input, message);
  const status = normalizeStatus(input, role, message);
  let contractStructured = null;
  const taskId = resolveRuntimeTaskId(taskRegistry, input, projectDir);
  const ambiguousPlanScope = isAmbiguousTaskScope(activePlans, taskId);
  const isAmbiguousBlockedScope = (role === "tester" || role === "coder") && ambiguousPlanScope && status === "blocked";
  const canResolveAmbiguousSignals =
    (role === "tester" || role === "coder") &&
    Boolean(taskId) &&
    (status === "complete" || status === "blocked") &&
    hasAmbiguousBlockedSignals(state, role);

  const activeWorkflowChainId = normalizeWorkflowChainId(workflow?.chain_id);

  state.recentSubagentEvents.push({
    timestamp: new Date().toISOString(),
    agentType: role,
    status,
    taskId,
    chainId: activeWorkflowChainId,
    summary: compactText(message, 120)
  });

  if (canResolveAmbiguousSignals) {
    clearAmbiguousBlockedSignals(state, role);
  }

  if (role === "tester" || role === "coder") {
    const contract = validateStructuredResultContract(role, message);
    if (!contract.ok) {
      const scopedTaskId = resolveWorkflowScopedTaskId(taskId, workflow);
      const missingBriefByContract = contract.code === "missing_structured_result_brief_path";
      clearExecutionContinuation(state, scopedTaskId);
      updateWorkflowState(workflow, {
        phase: role,
        current_chain: `${role}_blocked`,
        expected_next_step: "technical_manager"
      });
      if (role === "tester" && workflow.required_handoff === "tester") {
        markWorkflowRequiresTesterHandoff(
          workflow,
          scopedTaskId,
          "tester_blocked",
          "Tester handoff remains required before settlement.",
          {
            phase: "tester",
            chainId: activeWorkflowChainId
          }
        );
        updateWorkflowState(workflow, {
          expected_next_step: "technical_manager"
        });
      }
      upsertPendingAction(state, {
        id: `blocked-review:${role}:structured:${scopedTaskId || "current-task"}`,
        type: "blocked_review",
        phase: role,
        taskId: scopedTaskId,
        note: missingBriefByContract
          ? `${contract.reason} Stop downstream tester, qc, and submit progression and route back through technical_manager. If user clarification is required, technical_manager should collect it via Aide -> user.`
          : `${contract.reason} Route back through technical_manager before retrying this handoff.`
      });

      if (!missingBriefByContract) {
        upsertGovernanceReview(state, {
          issueKey: `invalid-structured:${role}:${scopedTaskId || "current-task"}`,
          taskId: scopedTaskId,
          sourceRole: role,
          issue: "Runtime rejected a handoff because the structured result contract was invalid.",
          level: "G3",
          impact: "The technical delivery chain was stopped to prevent a silent workflow break.",
          authority_target: role === "tester" ? ".codex/agents/tester.toml" : ".codex/agents/coder.toml",
          recommended_action: "Repair the structured result contract and re-run the handoff through the owning role before resuming the chain.",
          disposition: "ask-user",
          note: `${contract.reason} Runtime rejected the handoff to prevent silent workflow break in the technical_manager-owned chain.`
        });
      }
      return;
    }

    contractStructured = contract.structured;
  }

  const incomingChainId = resolveWorkflowChainId(input, message, contractStructured);

  if ((role === "tester" || role === "coder") && ambiguousPlanScope && status !== "blocked") {
    return;
  }

  if ((role === "tester" || role === "coder") && status === "complete") {
    removePendingActions(
      state,
      (item) =>
        item.type === "blocked_review" &&
        item.phase === role &&
        item.scope !== "ambiguous" &&
        matchesTaskScope(item.taskId, taskId)
    );
  }

  if (role === "coder" && status === "complete") {
    const activeChainId = incomingChainId || generateWorkflowChainId(taskId);
    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesTaskScope(item.taskId, taskId)
    );
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesTaskScope(item.taskId, taskId)
    );
    queueTesterHandoff(state, taskId, "coder_complete_requires_tester", activeChainId);
    markWorkflowRequiresTesterHandoff(
      workflow,
      taskId,
      "coder",
      "Coder completion requires tester handoff before settlement.",
      {
        phase: "coder",
        chainId: activeChainId
      }
    );
    syncWorkflowExpectedNextStep(state, taskId, workflow);
  }

  if (role === "tester" && status === "complete") {
    const scopedTaskId = resolveWorkflowScopedTaskId(taskId, workflow);
    const enforceWorkflowChain =
      workflow.required_handoff === "tester" && workflow.settlement_guard === "require_required_handoff";
    const missingRequiredChainId =
      enforceWorkflowChain &&
      Boolean(activeWorkflowChainId) &&
      !incomingChainId;
    const hasExplicitChainMismatch =
      enforceWorkflowChain &&
      Boolean(activeWorkflowChainId) &&
      Boolean(incomingChainId) &&
      incomingChainId !== activeWorkflowChainId;

    if (missingRequiredChainId || hasExplicitChainMismatch) {
      const scopedTaskId = taskId || workflow.required_handoff_task_id || null;
      const mismatchReason = missingRequiredChainId
        ? "Tester handoff omitted workflow_chain_id for an active guarded chain. Re-run tester for the current chain."
        : "Tester handoff chain_id mismatched the active workflow chain. Re-run tester for the current chain.";
      const mismatchReviewNote = missingRequiredChainId
        ? "Tester handoff omitted workflow_chain_id while the active chain required it. Required tester handoff remains pending."
        : "Tester handoff workflow_chain_id mismatched active chain_id. Required tester handoff remains pending.";
      const mismatchBlockedId = missingRequiredChainId ? "chain-missing" : "chain-mismatch";

      queueTesterHandoff(
        state,
        scopedTaskId,
        missingRequiredChainId ? "tester_chain_missing" : "tester_chain_mismatch",
        activeWorkflowChainId,
        mismatchReason
      );
      markWorkflowRequiresTesterHandoff(
        workflow,
        scopedTaskId,
        "tester_blocked",
        mismatchReviewNote,
        {
          phase: "tester",
          chainId: activeWorkflowChainId
        }
      );
      upsertPendingAction(state, {
        id: `blocked-review:tester:${mismatchBlockedId}:${scopedTaskId || "current-task"}`,
        type: "blocked_review",
        phase: "tester",
        taskId: scopedTaskId,
        note: mismatchReason
      });
      upsertGovernanceReview(state, {
        issueKey: `tester-${mismatchBlockedId}:${scopedTaskId || "current-task"}`,
        taskId: scopedTaskId,
        sourceRole: "tester",
        issue: "Tester handoff chain did not match the active guarded workflow chain.",
        level: "G3",
        impact: "Settlement remains blocked because the required tester handoff for the active chain is still unresolved.",
        authority_target: ".codex/skills/technical_manager/SKILL.md",
        recommended_action: "Route back through Aide and technical_manager, then re-run tester for the current guarded chain.",
        disposition: "ask-user",
        note: mismatchReviewNote
      });
      syncWorkflowExpectedNextStep(state, scopedTaskId, workflow);
      return;
    }

    clearTesterHandoff(state, scopedTaskId, incomingChainId || activeWorkflowChainId);
    markWorkflowTesterHandoffCompleted(workflow, profile, deliveryPolicy, {
      chainId: incomingChainId || activeWorkflowChainId
    });

    if (isQcEnabled(profile)) {
      upsertPendingAction(state, {
        id: `run-qc:${role}:${scopedTaskId || "current-task"}`,
        type: "run_qc",
        phase: role,
        taskId: scopedTaskId,
        note: `Recent ${role} completion detected. Route through technical_manager to decide QC, then enter the qc review path for phase=${role} if approved.`
      });
    } else {
      removePendingActions(
        state,
        (item) => item.type === "run_qc" && item.phase === role && matchesTaskScope(item.taskId, scopedTaskId)
      );
      if (shouldQueueSubmitAfterCompletion(role, profile, message, deliveryPolicy)) {
        queueSubmit(
          state,
          scopedTaskId,
          `Recent ${role} completion detected. Enter the submit path.`,
          "tester_complete_without_qc"
        );
      }
    }

    syncWorkflowExpectedNextStep(state, scopedTaskId, workflow);
  }

  if ((role === "tester" || role === "coder") && status === "blocked") {
    const scopedTaskId = resolveWorkflowScopedTaskId(taskId, workflow);
    const missingImplementationBrief = detectMissingTaskImplementationBrief(role, message, contractStructured);
    clearExecutionContinuation(state, scopedTaskId);
    const blockedScopeLabel = isAmbiguousBlockedScope ? "ambiguous-plan-scope" : scopedTaskId || "current-task";
    const blockedNote = isAmbiguousBlockedScope
      ? `Recent ${role} blockage detected, but active task ownership is ambiguous. Resolve ownership (currentTaskId/cwd/worktree/branch) before resuming.`
      : missingImplementationBrief
        ? `Recent ${role} blockage detected: Implementation Brief (任务实施说明) is missing or unreadable. Stop downstream tester, qc, and submit progression and route back through technical_manager. If user clarification is needed, technical_manager should collect it via Aide -> user.`
      : `Recent ${role} blockage detected. Route back through technical_manager and review the structured handoff before continuing.`;
    const reviewNote = isAmbiguousBlockedScope
      ? `A ${role} handoff blocked while multiple active plans were unresolved. Investigate task ownership first, then route fixes to the correct task chain.`
      : missingImplementationBrief
        ? `A ${role} handoff was blocked because Implementation Brief (任务实施说明) was missing or unreadable. Resume only after technical_manager refreshes the brief; if user clarification is required, route via technical_manager -> Aide -> user.`
      : `A ${role} handoff blocked the workflow. Investigate whether execution entry, technical_manager brief ownership, role boundaries, or shared guidance caused the break.`;

    upsertPendingAction(state, {
      id: `blocked-review:${role}:${blockedScopeLabel}`,
      type: "blocked_review",
      phase: role,
      taskId: scopedTaskId,
      scope: isAmbiguousBlockedScope ? "ambiguous" : undefined,
      note: blockedNote
    });
    if (scopedTaskId && isLongRunningProfile(profile)) {
      upsertSessionRetrospective(state, scopedTaskId, {
        trigger: "blocked",
        phase: role,
        note: `Before pausing ${scopedTaskId}, capture attempted fixes, the broken assumption, and whether shared workflow docs need updates.`
      });
    }

    if (!missingImplementationBrief) {
      upsertGovernanceReview(state, {
        issueKey: `blocked:${role}:${blockedScopeLabel}`,
        taskId: scopedTaskId,
        scope: isAmbiguousBlockedScope ? "ambiguous" : undefined,
        sourceRole: role,
        issue: `${role} handoff blocked the workflow.`,
        level: "G3",
        impact: isAmbiguousBlockedScope
          ? "Task ownership is ambiguous and the workflow cannot safely continue."
          : "The execution chain cannot continue until the blocker is understood and routed to the correct owner.",
        authority_target: isAmbiguousBlockedScope
          ? ".codex/state/task-context.json"
          : ".codex/skills/technical_manager/SKILL.md",
        recommended_action: isAmbiguousBlockedScope
          ? "Resolve task ownership first, then re-route the fix through the correct chain."
          : "Investigate the blocker and correct the smallest owner before resuming execution.",
        disposition: "ask-user",
        note: reviewNote
      });
    }

    if (role === "tester" && workflow.required_handoff === "tester") {
      markWorkflowRequiresTesterHandoff(
        workflow,
        scopedTaskId,
        "tester_blocked",
        "Tester handoff remains required before settlement.",
        {
          phase: "tester"
        }
      );
      syncWorkflowExpectedNextStep(state, scopedTaskId, workflow);
      if (missingImplementationBrief) {
        updateWorkflowState(workflow, {
          expected_next_step: "technical_manager"
        });
      }
    } else {
      updateWorkflowState(workflow, {
        phase: role,
        current_chain: `${role}_blocked`,
        expected_next_step: "technical_manager"
      });
    }
  }

  if (role === "product_assistant" && (status === "complete" || status === "blocked")) {
    const scopedTaskId = resolveWorkflowScopedTaskId(taskId, workflow);
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesTaskScope(item.taskId, scopedTaskId)
    );
    updateWorkflowState(workflow, {
      phase: "product_assistant",
      current_chain: status === "blocked" ? "product_assistant_blocked" : "product_assistant",
      expected_next_step: "aide",
      required_handoff: "none",
      required_handoff_task_id: null,
      settlement_guard: "none",
      settlement_guard_reason: ""
    });
    recordProductAssistantReview(state, taskId, status, message);
  }

  if (role === "architect" && status === "complete") {
    recordArchitectRetrospective(state, taskId, message);
  }

  if (role === "qc") {
    processQcOutcome(state, taskId, profile, message, deliveryPolicy, workflow);
    syncWorkflowExpectedNextStep(state, taskId, workflow);
  }

  if (role === "submit") {
    processSubmitOutcome(state, taskId, profile, message, status, workflow);
    syncWorkflowExpectedNextStep(state, taskId, workflow);
  }
}

function recordSessionEnd(input, state, activePlans, taskRegistry, projectDir, profile, deliveryPolicy, workflow) {
  const message = normalizeMessage(input);
  const taskId = resolveRuntimeTaskId(taskRegistry, input, projectDir);

  if (shouldBlockSettlementForMissingTester(state, taskId, message, workflow)) {
    blockSettlementForMissingTester(state, taskId, "session_end", workflow);
    syncWorkflowExpectedNextStep(state, taskId, workflow);
    return;
  }

  if (taskId && isLongRunningProfile(profile)) {
    upsertSessionRetrospective(state, taskId, {
      trigger: "session_close",
      note: `Session paused around ${taskId}. Capture key decisions, broken assumptions, and whether any queued governance item should write back through Aide.`
    });
  }

  syncWorkflowExpectedNextStep(state, taskId, workflow);
}

function recordTaskSettled(input, state, activePlans, taskRegistry, projectDir, profile, deliveryPolicy, workflow) {
  const message = normalizeMessage(input) || `Task status: ${String(input.task_status || input.status || "done")}`;
  const taskId = resolveRuntimeTaskId(taskRegistry, input, projectDir);

  if (hasRequiredTesterHandoff(state, taskId, workflow)) {
    blockSettlementForMissingTester(state, taskId, "task_settled", workflow);
    syncWorkflowExpectedNextStep(state, taskId, workflow);
    return;
  }

  if (taskId && isLongRunningProfile(profile)) {
    upsertSessionRetrospective(state, taskId, {
      trigger: "task_settled",
      note: `Task settled for ${taskId}. Before archival, capture durable decisions, wrong assumptions, and whether any governance item should route through Aide.`
    });
  }

  processQcOutcome(state, taskId, profile, message, deliveryPolicy, workflow);
  maybeQueueSubmitForSettledTask(state, taskId, profile, message, deliveryPolicy, workflow);
  syncWorkflowExpectedNextStep(state, taskId, workflow);

  if (shouldCompressCompletedTask(profile, state, taskId, message)) {
    clearHotTaskState(state, taskId, profile, message, workflow);
  }
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const eventName = normalizeEventName(input);
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "runtime-state.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      event: eventName || null,
      role: normalizeRole(input, normalizeMessage(input)) || null,
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    if (envelope.parseError) {
      throw envelope.parseError;
    }

    if (!eventName) {
      logger.finalize({
        status: "ignored",
        metadata: {
          reason: "missing_event"
        }
      });
      return;
    }

    if (eventName !== "subagent_result" && eventName !== "session_end" && eventName !== "task_settled") {
      throw new Error(
        `Unsupported event "${eventName}". Supported events: subagent_result, session_end, task_settled.`
      );
    }

    const progressPath = findProgressFile(input.cwd || projectDir) || findProgressFile(projectDir);
    const activePlans = parseActivePlans(progressPath);
    const state = loadRuntimeState(projectDir);
    const taskContextPath = path.join(projectDir, ".codex", "state", "task-context.json");
    const hasTaskContextFile = fs.existsSync(taskContextPath);
    const taskContext = loadTaskContext(projectDir);
    const workflow = normalizeTaskWorkflowState(taskContext?.task?.workflow);
    const workflowBaseline = JSON.stringify(workflow);
    const profile = loadProjectProfileState(projectDir);
    const deliveryPolicy = loadDeliveryPolicy(projectDir);

    const taskRegistry = syncTaskRegistry(projectDir, {
      profile,
      runtimeState: state,
      progressPath,
      persist: false
    });

    if (eventName === "subagent_result") {
      recordSubagentResult(input, state, activePlans, taskRegistry, projectDir, profile, deliveryPolicy, workflow);
    } else if (eventName === "session_end") {
      recordSessionEnd(input, state, activePlans, taskRegistry, projectDir, profile, deliveryPolicy, workflow);
    } else if (eventName === "task_settled") {
      recordTaskSettled(input, state, activePlans, taskRegistry, projectDir, profile, deliveryPolicy, workflow);
    }

    trimRuntimeState(state);
    saveRuntimeState(projectDir, state);
    if (JSON.stringify(workflow) !== workflowBaseline) {
      saveTaskContext(projectDir, buildTaskContextWorkflowPatch(profile, workflow, hasTaskContextFile));
    }
    const syncedTaskRegistry = syncTaskRegistry(projectDir, {
      profile,
      runtimeState: state,
      progressPath
    });
    syncProgressFromState(progressPath, activePlans, state, syncedTaskRegistry);
    logger.finalize({
      status: "ok",
      metadata: {
        event: eventName,
        pendingActionCount: Array.isArray(state.pendingActions) ? state.pendingActions.length : 0,
        recentSubagentEventCount: Array.isArray(state.recentSubagentEvents) ? state.recentSubagentEvents.length : 0
      }
    });
  } catch (error) {
    process.stderr.write(`runtime-state error: ${error instanceof Error ? error.message : String(error)}\n`);
    logger.finalize({
      status: "error",
      error,
      metadata: {
        event: eventName || null
      }
    });
    process.exit(1);
  } finally {
    restoreStreams();
  }
}

await main();
