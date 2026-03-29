#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  basenameLabel,
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
  highestGovernanceSeverity,
  isLongRunningProfile,
  isQcEnabled,
  isSubmitEnabled,
  isTaskSettled,
  lessonForCategory,
  loadDeliveryPolicy,
  loadProjectProfileState,
  loadRuntimeState,
  loadTaskContext,
  normalizeTaskWorkflowState,
  parseActiveStories,
  readJsonStdinEnvelope,
  removePendingActions,
  resolveActiveStory,
  saveRuntimeState,
  saveTaskContext,
  startRuntimeInvocationLogging,
  suggestedRoutesForCategory,
  syncTaskRegistry,
  syncProgressFromState,
  toLessonId,
  trimRuntimeState,
  normalizeGovernanceSeverity,
  upsertLearningQueueItem,
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

function generateWorkflowChainId(storyPath) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const scope = sanitizeChainScopeSegment(storyPath ? basenameLabel(storyPath) : "current-task");
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

function upsertSessionRetrospective(state, storyPath, details = {}) {
  const id = details.id || `session-retrospective:${storyPath || "unknown"}`;
  upsertPendingAction(state, {
    id,
    type: "session_retrospective",
    storyPath,
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

function normalizeWritebackCandidates(message) {
  const structured = extractStructuredResult(message);
  if (!Array.isArray(structured?.writeback_candidates)) {
    return [];
  }

  return structured.writeback_candidates
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const target = String(entry.target || "").trim();
      const reason = String(entry.reason || "").trim();
      const capability = String(entry.capability || "investigation").trim().toLowerCase() || "investigation";
      const severity = normalizeGovernanceSeverity(entry.severity || "L2");

      if (!target && !reason) {
        return null;
      }

      return {
        target: target || "unknown-target",
        reason: reason || "No reason provided.",
        capability,
        severity
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

function normalizeProductEvolutionCandidates(message) {
  const structured = extractStructuredResult(message) || {};
  if (!Array.isArray(structured?.evolution_candidates)) {
    return [];
  }

  return structured.evolution_candidates
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const id = String(entry.id || "").trim();
      const category = String(entry.category || "").trim().toLowerCase();
      const summary = String(entry.summary || entry.reason || "").trim();
      const source = String(entry.source || "").trim();
      if (!id && !category && !summary && !source) {
        return null;
      }

      return {
        id,
        category: category || "role_gap",
        summary: summary || "No summary provided.",
        source: source || "product_assistant"
      };
    })
    .filter(Boolean);
}

function governanceSeverityForRetryCount(triggerCount) {
  return triggerCount >= 4 ? "L4" : "L3";
}

function preferredGovernanceCapability(candidates = [], fallback = "investigation") {
  if (candidates.some((item) => item.capability === "dedup")) {
    return "dedup";
  }

  if (candidates.some((item) => item.capability === "audit")) {
    return "audit";
  }

  if (candidates.some((item) => item.capability === "writeback")) {
    return "writeback";
  }

  return fallback;
}

function upsertAideReview(state, details = {}) {
  const storyKey = details.storyPath || "current-task";
  const issueKey = String(details.issueKey || details.sourceRole || details.capability || "general")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  upsertPendingAction(state, {
    id: details.id || `aide-review:${issueKey}:${storyKey}`,
    type: "aide_review",
    scope: details.scope || undefined,
    severity: normalizeGovernanceSeverity(details.severity || "L2"),
    capability: details.capability || "investigation",
    storyPath: details.storyPath || null,
    sourceRole: details.sourceRole || null,
    note: details.note || "",
    routeTarget: details.routeTarget || null,
    issueType: details.issueType || null,
    decisions: normalizeStringList(details.decisions),
    wrongAssumptions: normalizeStringList(details.wrongAssumptions),
    writebackCandidates: Array.isArray(details.writebackCandidates) ? details.writebackCandidates : []
  });
}

function recordArchitectRetrospective(state, storyPath, message) {
  const structured = extractStructuredResult(message) || {};
  const decisions = normalizeStringList(structured.key_decisions);
  const wrongAssumptions = normalizeStringList(structured.wrong_assumptions);
  const tradeoffs = normalizeStringList(structured.technical_tradeoffs);
  const candidates = normalizeWritebackCandidates(message);

  upsertSessionRetrospective(state, storyPath, {
    id: `session-retrospective:architect:${storyPath || "current-task"}`,
    trigger: "architect_review",
    role: "architect",
    note: `Architect review captured${decisions.length > 0 ? ` decisions: ${decisions.slice(0, 2).join("; ")}` : ""}${
      wrongAssumptions.length > 0 ? `. Wrong assumptions: ${wrongAssumptions.slice(0, 2).join("; ")}` : ""
    }`,
    categories: Array.from(new Set(candidates.map((item) => item.capability))),
    decisions,
    wrongAssumptions,
    tradeoffs
  });

  if (candidates.length === 0) {
    return;
  }

  upsertAideReview(state, {
    issueKey: `architect:${storyPath || "current-task"}`,
    storyPath,
    sourceRole: "architect",
    capability: preferredGovernanceCapability(candidates, "investigation"),
    severity: highestGovernanceSeverity(candidates.map((item) => item.severity), "L2"),
    issueType: "role_learning",
    routeTarget: "/Aide writeback",
    note: `Architect completed with ${candidates.length} writeback candidate(s). Review the shared workflow before the next similar task.`,
    decisions,
    wrongAssumptions,
    writebackCandidates: candidates
  });
}

function reviewCapabilityForProductResult(candidates = [], openGaps = []) {
  if (openGaps.length > 0) {
    return "investigation";
  }

  if (candidates.length > 0) {
    return "writeback";
  }

  return "audit";
}

function reviewSeverityForProductResult(candidates = [], openGaps = [], memoryUpdates, templateChanges) {
  if (openGaps.length > 0) {
    return "L2";
  }

  if (candidates.length >= 2) {
    return "L3";
  }

  if (
    candidates.length > 0 ||
    templateChanges.length > 0 ||
    memoryUpdates.userPreferences.length > 0 ||
    memoryUpdates.repoPreferences.length > 0
  ) {
    return "L1";
  }

  return "L1";
}

function recordProductAssistantReview(state, storyPath, status, message) {
  const memoryUpdates = normalizeProductMemoryUpdates(message);
  const templateChanges = normalizeProductTemplateChanges(message);
  const openGaps = normalizeProductOpenGaps(message);
  const candidates = normalizeProductEvolutionCandidates(message);

  if (status === "blocked") {
    upsertPendingAction(state, {
      id: `blocked-review:product:${storyPath || "current-task"}`,
      type: "blocked_review",
      phase: "product_assistant",
      storyPath,
      note: "Recent product_assistant blockage detected. Review the missing context or route before continuing."
    });

    upsertAideReview(state, {
      issueKey: `blocked:product:${storyPath || "current-task"}`,
      storyPath,
      sourceRole: "product_assistant",
      capability: "investigation",
      severity: "L2",
      issueType: "workflow_break",
      routeTarget: "/Aide investigate",
      note: "A product_assistant task blocked. Review the chat record to decide whether the user input was incomplete, the task was misunderstood, or the route should switch to coding."
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
    noteParts.push(`evolution candidates: ${candidates.map((item) => item.category).slice(0, 3).join(", ")}`);
  }
  if (openGaps.length > 0) {
    noteParts.push(`open gaps: ${openGaps.slice(0, 2).join("; ")}`);
  }

  upsertAideReview(state, {
    issueKey: `product-review:${storyPath || "current-task"}`,
    storyPath,
    sourceRole: "product_assistant",
    capability: reviewCapabilityForProductResult(candidates, openGaps),
    severity: reviewSeverityForProductResult(candidates, openGaps, memoryUpdates, templateChanges),
    issueType: "product_review",
    routeTarget: "/Aide review",
    note: `Review the completed product_assistant result against the chat record before accepting long-term writeback${noteParts.length > 0 ? ` (${noteParts.join("; ")})` : ""}.`
  });
}

function currentTaskLabel(profile, storyPath) {
  return String(profile.task || "").trim() || (storyPath ? basenameLabel(storyPath) : "current-task");
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

function normalizeWorkflowStoryPath(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function workflowScopeMatches(requiredStoryPath, storyPath) {
  const required = normalizeWorkflowStoryPath(requiredStoryPath);
  if (!required) {
    return true;
  }

  if (!storyPath) {
    return true;
  }

  return required === storyPath;
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

function markWorkflowRequiresTesterHandoff(workflow, storyPath, chain, reason, options = {}) {
  const phase = normalizeWorkflowPhase(options.phase, inferWorkflowPhaseFromChain(chain, workflow?.phase || "coder"));
  const chainId = normalizeWorkflowChainId(options.chainId) || normalizeWorkflowChainId(workflow?.chain_id);
  updateWorkflowState(workflow, {
    phase,
    chain_id: chainId,
    current_chain: chain,
    expected_next_step: "tester_handoff",
    required_handoff: "tester",
    required_handoff_story_path: storyPath || null,
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
    required_handoff_story_path: null,
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
    required_handoff_story_path: null,
    settlement_guard: "none",
    settlement_guard_reason: ""
  });
}

function workflowRequiresTesterHandoff(workflow, storyPath) {
  if (workflow?.required_handoff !== "tester") {
    return false;
  }

  if (workflow?.settlement_guard !== "require_required_handoff") {
    return false;
  }

  return workflowScopeMatches(workflow.required_handoff_story_path, storyPath);
}

function hasPendingQc(state, storyPath) {
  return state.pendingActions.some(
    (item) => item.type === "run_qc" && matchesStoryScope(item.storyPath, storyPath)
  );
}

function hasPendingSubmit(state, storyPath) {
  return state.pendingActions.some(
    (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
  );
}

function hasRequiredTesterHandoff(state, storyPath, workflow) {
  return (
    hasPendingTesterHandoff(state, storyPath, workflow?.chain_id) ||
    workflowRequiresTesterHandoff(workflow, storyPath)
  );
}

function syncWorkflowExpectedNextStep(state, storyPath, workflow) {
  if (hasRequiredTesterHandoff(state, storyPath, workflow)) {
    updateWorkflowState(workflow, { expected_next_step: "tester_handoff" });
    return;
  }

  if (hasPendingQc(state, storyPath)) {
    updateWorkflowState(workflow, { expected_next_step: "qc" });
    return;
  }

  if (hasPendingSubmit(state, storyPath)) {
    updateWorkflowState(workflow, { expected_next_step: "submit" });
    return;
  }

  updateWorkflowState(workflow, { expected_next_step: "none" });
}

function hasHotTaskState(state, storyPath) {
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

    if (storyPath) {
      return item.storyPath === storyPath;
    }

    return !item.storyPath;
  });

  return hasPending || Boolean(state.sessionContext.lastReminderText);
}

function hasOutstandingCompletionWork(state, storyPath) {
  return state.pendingActions.some((item) => {
    if (item.type !== "run_tester" && item.type !== "run_qc" && item.type !== "run_submit" && item.type !== "blocked_review") {
      return false;
    }

    if (storyPath) {
      return item.storyPath === storyPath;
    }

    return !item.storyPath;
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

function clearHotTaskState(state, storyPath, profile, message, workflow) {
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

    if (storyPath) {
      return item.storyPath === storyPath;
    }

    return !item.storyPath;
  });

  state.sessionContext.lastReminderText = "";
  markWorkflowSettled(workflow);

  upsertCompletedTask(state, {
    id: storyPath ? `story:${storyPath}` : `task:${currentTaskLabel(profile, storyPath)}`,
    task: currentTaskLabel(profile, storyPath),
    storyPath,
    deliveryMode: profile.deliveryMode || null,
    completedAt: new Date().toISOString(),
    summary: compactText(message || profile.routeRationale || currentTaskLabel(profile, storyPath), 160)
  });
}

function shouldCompressCompletedTask(profile, state, storyPath, message) {
  if (hasOutstandingCompletionWork(state, storyPath)) {
    return false;
  }

  const taskStatus = String(profile.taskStatus || "").toLowerCase();

  if (taskStatus === "done") {
    return storyPath ? true : hasHotTaskState(state, storyPath);
  }

  if (taskStatus === "idle") {
    return storyPath ? hasHotTaskState(state, storyPath) : false;
  }

  if (isTaskSettled(profile)) {
    return true;
  }

  return detectTaskCompletionMessage(message);
}

function resolveQcPhaseForMetrics(state, message, storyPath) {
  const explicit = detectQcPhase(message);
  if (explicit === "tester" || explicit === "coder") {
    return explicit;
  }

  const queued = state.pendingActions
    .filter((item) => item.type === "run_qc" && (!storyPath || item.storyPath === storyPath))
    .slice(-1)[0];

  if (queued?.phase === "tester" || queued?.phase === "coder") {
    return queued.phase;
  }

  return "manual";
}

function recordQcMetrics(state, storyPath, message, verdict, categories = []) {
  const phase = resolveQcPhaseForMetrics(state, message, storyPath);
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
    storyPath,
    phase,
    verdict,
    categories
  });
}

function matchesStoryScope(itemStoryPath, storyPath) {
  if (storyPath) {
    return !itemStoryPath || itemStoryPath === storyPath;
  }

  return !itemStoryPath;
}

function isAmbiguousStoryScope(activeStories, storyPath) {
  return Array.isArray(activeStories) && activeStories.length > 1 && !storyPath;
}

function clearAmbiguousBlockedSignals(state, role) {
  removePendingActions(state, (item) => {
    if (item.type === "blocked_review") {
      return item.phase === role && item.scope === "ambiguous";
    }

    if (item.type === "aide_review") {
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

    if (item.type === "aide_review") {
      return item.sourceRole === role && item.scope === "ambiguous";
    }

    return false;
  });
}

function shouldQueueByPolicy(deliveryPolicy, trigger) {
  if (!trigger) {
    return true;
  }

  return deliveryPolicy?.submit?.queue_after?.[trigger] !== false;
}

function queueSubmit(state, storyPath, note, trigger) {
  upsertPendingAction(state, {
    id: `run-submit:${storyPath || "current-task"}`,
    type: "run_submit",
    storyPath,
    trigger,
    note
  });
}

function queueTesterHandoff(
  state,
  storyPath,
  trigger = "coder_complete_requires_tester",
  chainId = null,
  note = "Coder completed. Route to tester for required validation handoff."
) {
  const normalizedChainId = normalizeWorkflowChainId(chainId);
  upsertPendingAction(state, {
    id: `run-tester:${storyPath || "current-task"}`,
    type: "run_tester",
    phase: "tester",
    storyPath,
    chain_id: normalizedChainId,
    workflow_chain_id: normalizedChainId,
    trigger,
    note
  });
}

function clearTesterHandoff(state, storyPath, chainId = null) {
  removePendingActions(
    state,
    (item) =>
      item.type === "run_tester" &&
      matchesStoryScope(item.storyPath, storyPath) &&
      workflowChainMatches(chainId, item.chain_id || item.workflow_chain_id)
  );
}

function hasPendingTesterHandoff(state, storyPath, chainId = null) {
  if (!storyPath) {
    return state.pendingActions.some(
      (item) => item.type === "run_tester" && workflowChainMatches(chainId, item.chain_id || item.workflow_chain_id)
    );
  }

  return state.pendingActions.some(
    (item) =>
      item.type === "run_tester" &&
      matchesStoryScope(item.storyPath, storyPath) &&
      workflowChainMatches(chainId, item.chain_id || item.workflow_chain_id)
  );
}

function recordMissingTesterWorkflowBreak(state, storyPath, source, note) {
  upsertPendingAction(state, {
    id: `blocked-review:tester-required:${source}:${storyPath || "current-task"}`,
    type: "blocked_review",
    phase: "tester",
    storyPath,
    note
  });

  upsertAideReview(state, {
    issueKey: `tester-required:${source}:${storyPath || "current-task"}`,
    storyPath,
    sourceRole: source,
    capability: "investigation",
    severity: "L3",
    issueType: "workflow_break",
    routeTarget: "/Aide investigate",
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

  if (role === "coder") {
    return false;
  }

  if (role === "tester") {
    return shouldQueueByPolicy(deliveryPolicy, "tester_complete_without_qc");
  }

  return submitLooksReady(profile, message) && shouldQueueByPolicy(deliveryPolicy, "task_settled_without_qc");
}

function shouldQueueSubmitAfterQc(state, storyPath, profile, message, deliveryPolicy, workflow) {
  if (!isSubmitEnabled(profile, deliveryPolicy)) {
    return false;
  }

  if (hasRequiredTesterHandoff(state, storyPath, workflow)) {
    return false;
  }

  const phase = resolveQcPhaseForMetrics(state, message, storyPath);
  if (phase === "coder") {
    return false;
  }

  if (phase === "tester") {
    return shouldQueueByPolicy(deliveryPolicy, "qc_pass_after_tester");
  }

  return submitLooksReady(profile, message) && shouldQueueByPolicy(deliveryPolicy, "task_settled_after_qc");
}

function maybeQueueSubmitForSettledTask(state, storyPath, profile, message, deliveryPolicy, workflow) {
  if (!isSubmitEnabled(profile, deliveryPolicy)) {
    return;
  }

  if (hasRequiredTesterHandoff(state, storyPath, workflow)) {
    return;
  }

  if (isQcEnabled(profile) && !detectQcPass(message)) {
    return;
  }

  const trigger = detectQcPass(message) ? "task_settled_after_qc" : "task_settled_without_qc";
  if (!shouldQueueByPolicy(deliveryPolicy, trigger)) {
    return;
  }

  queueSubmit(state, storyPath, "Task is settled and ready for governed delivery. Run /submit.", trigger);
}

function shouldBlockSettlementForMissingTester(state, storyPath, message, workflow) {
  if (!hasRequiredTesterHandoff(state, storyPath, workflow)) {
    return false;
  }

  return detectTaskCompletionMessage(message);
}

function blockSettlementForMissingTester(state, storyPath, source, workflow) {
  removePendingActions(
    state,
    (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
  );
  markWorkflowRequiresTesterHandoff(
    workflow,
    storyPath || workflow.required_handoff_story_path || null,
    "settlement_blocked",
    "Settlement is blocked until required tester handoff completes."
  );
  recordMissingTesterWorkflowBreak(
    state,
    storyPath,
    source,
    "Coder already ran, but task settlement was attempted before tester handoff. Main thread cannot replace tester."
  );
}

function processQcOutcome(state, storyPath, profile, message, deliveryPolicy, workflow) {
  if (detectQcPass(message)) {
    recordQcMetrics(state, storyPath, message, "pass");

    if (hasRequiredTesterHandoff(state, storyPath, workflow)) {
      removePendingActions(
        state,
        (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
      );
      markWorkflowRequiresTesterHandoff(
        workflow,
        storyPath || workflow.required_handoff_story_path || null,
        "qc",
        "QC cannot replace required tester handoff after coder completion."
      );
      recordMissingTesterWorkflowBreak(
        state,
        storyPath,
        "qc",
        "QC completed before required tester handoff. QC is optional and cannot replace tester after coder."
      );
      return;
    }

    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesStoryScope(item.storyPath, storyPath)
    );
    removePendingActions(
      state,
      (item) => item.type === "blocked_review" && item.scope !== "ambiguous" && matchesStoryScope(item.storyPath, storyPath)
    );

    if (shouldQueueSubmitAfterQc(state, storyPath, profile, message, deliveryPolicy, workflow)) {
      const phase = resolveQcPhaseForMetrics(state, message, storyPath);
      queueSubmit(
        state,
        storyPath,
        "QC passed for a deliverable handoff. Run /submit.",
        phase === "tester" ? "qc_pass_after_tester" : "task_settled_after_qc"
      );
    }

    if (storyPath) {
      const queuedForStory = state.learningQueue.filter(
        (item) => item.status === "queued" && (item.source || "unknown") === storyPath
      );

      if (queuedForStory.length > 0 && isLongRunningProfile(profile)) {
        upsertSessionRetrospective(state, storyPath, {
          trigger: "qc_pass_after_retries",
          categories: Array.from(new Set(queuedForStory.map((item) => item.category))),
          note: `QC passed for ${basenameLabel(storyPath)}, but queued lesson candidates remain. Decide in the retrospective which ones should route through /Aide.`
        });
      }
    }
  }

  if (detectQcFail(message)) {
    const categories = detectFailureCategories(message);
    const escalatedCategories = [];
    recordQcMetrics(state, storyPath, message, "fail", categories);

    if (hasRequiredTesterHandoff(state, storyPath, workflow)) {
      markWorkflowRequiresTesterHandoff(
        workflow,
        storyPath || workflow.required_handoff_story_path || null,
        "qc",
        "QC failed before required tester handoff completed."
      );
      recordMissingTesterWorkflowBreak(
        state,
        storyPath,
        "qc",
        "QC failed before required tester handoff. QC cannot replace tester after coder."
      );
    }

    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesStoryScope(item.storyPath, storyPath)
    );
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
    );

    if (storyPath) {
      for (const category of categories) {
        const key = `${storyPath}::${category}`;
        const existing = state.failurePatterns[key] || {
          source: storyPath,
          category,
          count: 0,
          firstSeenAt: new Date().toISOString()
        };

        existing.count += 1;
        existing.lastSeenAt = new Date().toISOString();
        state.failurePatterns[key] = existing;

        if (existing.count >= 2) {
          escalatedCategories.push({
            category,
            triggerCount: existing.count
          });
          upsertLearningQueueItem(state, {
            id: toLessonId(storyPath, category),
            source: storyPath,
            category,
            triggerCount: existing.count,
            suggestedRoute: suggestedRoutesForCategory(category),
            lesson: lessonForCategory(category),
            status: "queued"
          });
        }
      }

      if (escalatedCategories.length > 0) {
        upsertAideReview(state, {
          issueKey: `qc-pattern:${storyPath || "current-task"}`,
          storyPath,
          sourceRole: "qc",
          capability: "audit",
          severity: highestGovernanceSeverity(
            escalatedCategories.map((item) => governanceSeverityForRetryCount(item.triggerCount)),
            "L3"
          ),
          issueType: "workflow_break",
          routeTarget: "/Aide audit",
          note: `Repeated QC failure categories detected: ${escalatedCategories
            .map((item) => `${item.category} x${item.triggerCount}`)
            .join(", ")}. Review shared prompts and handoff rules instead of only patching the latest output.`
        });
      }

      if (categories.length > 0 && isLongRunningProfile(profile)) {
        upsertSessionRetrospective(state, storyPath, {
          trigger: "qc_failure",
          categories,
          note: `QC failure categories detected for ${basenameLabel(storyPath)}. Capture the wrong assumption, the corrective decision, and whether any lesson is durable enough for /Aide.`
        });
      }
    }
  }
}

function processSubmitOutcome(state, storyPath, profile, message, status, workflow) {
  if (status === "complete") {
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
    );
    removePendingActions(
      state,
      (item) => item.type === "blocked_review" && item.phase === "submit" && matchesStoryScope(item.storyPath, storyPath)
    );

    if (shouldCompressCompletedTask(profile, state, storyPath, message)) {
      clearHotTaskState(state, storyPath, profile, message, workflow);
    }
    return;
  }

  if (status === "blocked") {
    upsertPendingAction(state, {
      id: `blocked-review:submit:${storyPath || "current-task"}`,
      type: "blocked_review",
      phase: "submit",
      storyPath,
      note: "Governed delivery blocked. Review the submit report before continuing."
    });

    upsertAideReview(state, {
      issueKey: `blocked:submit:${storyPath || "current-task"}`,
      storyPath,
      sourceRole: "submit",
      capability: "investigation",
      severity: "L2",
      issueType: "workflow_break",
      routeTarget: "/Aide investigate",
      note: "A submit step blocked the delivery flow. Review branch policy, remotes, permissions, or delivery configuration."
    });
  }
}

function recordSubagentResult(input, state, activeStories, projectDir, profile, deliveryPolicy, workflow) {
  const message = normalizeMessage(input);
  const role = normalizeRole(input, message);
  const status = normalizeStatus(input, role, message);
  let contractStructured = null;
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;
  const ambiguousStoryScope = isAmbiguousStoryScope(activeStories, storyPath);
  const isAmbiguousBlockedScope = (role === "tester" || role === "coder") && ambiguousStoryScope && status === "blocked";
  const canResolveAmbiguousSignals =
    (role === "tester" || role === "coder") &&
    Boolean(storyPath) &&
    (status === "complete" || status === "blocked") &&
    hasAmbiguousBlockedSignals(state, role);

  const activeWorkflowChainId = normalizeWorkflowChainId(workflow?.chain_id);

  state.recentSubagentEvents.push({
    timestamp: new Date().toISOString(),
    agentType: role,
    status,
    storyPath,
    chainId: activeWorkflowChainId,
    summary: compactText(message, 120)
  });

  if (canResolveAmbiguousSignals) {
    clearAmbiguousBlockedSignals(state, role);
  }

  if (role === "tester" || role === "coder") {
    const contract = validateStructuredResultContract(role, message);
    if (!contract.ok) {
      removePendingActions(
        state,
        (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
      );
      upsertPendingAction(state, {
        id: `blocked-review:${role}:structured:${storyPath || "current-task"}`,
        type: "blocked_review",
        phase: role,
        storyPath,
        note: `${contract.reason} Do not continue this handoff until the role returns a valid structured footer.`
      });

      upsertAideReview(state, {
        issueKey: `invalid-structured:${role}:${storyPath || "current-task"}`,
        storyPath,
        sourceRole: role,
        capability: "investigation",
        severity: "L3",
        issueType: "workflow_break",
        routeTarget: "/Aide investigate",
        note: `${contract.reason} Runtime rejected the handoff to prevent silent workflow break.`
      });
      return;
    }

    contractStructured = contract.structured;
  }

  const incomingChainId = resolveWorkflowChainId(input, message, contractStructured);

  if ((role === "tester" || role === "coder") && ambiguousStoryScope && status !== "blocked") {
    return;
  }

  if ((role === "tester" || role === "coder") && status === "complete") {
    removePendingActions(
      state,
      (item) =>
        item.type === "blocked_review" &&
        item.phase === role &&
        item.scope !== "ambiguous" &&
        matchesStoryScope(item.storyPath, storyPath)
    );
  }

  if (role === "coder" && status === "complete") {
    const activeChainId = incomingChainId || generateWorkflowChainId(storyPath);
    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesStoryScope(item.storyPath, storyPath)
    );
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
    );
    queueTesterHandoff(state, storyPath, "coder_complete_requires_tester", activeChainId);
    markWorkflowRequiresTesterHandoff(
      workflow,
      storyPath,
      "coder",
      "Coder completion requires tester handoff before settlement.",
      {
        phase: "coder",
        chainId: activeChainId
      }
    );
    syncWorkflowExpectedNextStep(state, storyPath, workflow);
  }

  if (role === "tester" && status === "complete") {
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
      const scopedStoryPath = storyPath || workflow.required_handoff_story_path || null;
      const mismatchReason = missingRequiredChainId
        ? "Tester handoff omitted workflow_chain_id for an active guarded chain. Re-run tester for the current chain."
        : "Tester handoff chain_id mismatched the active workflow chain. Re-run tester for the current chain.";
      const mismatchReviewNote = missingRequiredChainId
        ? "Tester handoff omitted workflow_chain_id while the active chain required it. Required tester handoff remains pending."
        : "Tester handoff workflow_chain_id mismatched active chain_id. Required tester handoff remains pending.";
      const mismatchBlockedId = missingRequiredChainId ? "chain-missing" : "chain-mismatch";

      queueTesterHandoff(
        state,
        scopedStoryPath,
        missingRequiredChainId ? "tester_chain_missing" : "tester_chain_mismatch",
        activeWorkflowChainId,
        mismatchReason
      );
      markWorkflowRequiresTesterHandoff(
        workflow,
        scopedStoryPath,
        "tester_blocked",
        mismatchReviewNote,
        {
          phase: "tester",
          chainId: activeWorkflowChainId
        }
      );
      upsertPendingAction(state, {
        id: `blocked-review:tester:${mismatchBlockedId}:${scopedStoryPath || "current-task"}`,
        type: "blocked_review",
        phase: "tester",
        storyPath: scopedStoryPath,
        note: mismatchReason
      });
      upsertAideReview(state, {
        issueKey: `tester-${mismatchBlockedId}:${scopedStoryPath || "current-task"}`,
        storyPath: scopedStoryPath,
        sourceRole: "tester",
        capability: "investigation",
        severity: "L3",
        issueType: "workflow_break",
        routeTarget: "/Aide investigate",
        note: mismatchReviewNote
      });
      syncWorkflowExpectedNextStep(state, scopedStoryPath, workflow);
      return;
    }

    clearTesterHandoff(state, storyPath, incomingChainId || activeWorkflowChainId);
    markWorkflowTesterHandoffCompleted(workflow, profile, deliveryPolicy, {
      chainId: incomingChainId || activeWorkflowChainId
    });

    if (isQcEnabled(profile)) {
      upsertPendingAction(state, {
        id: `run-qc:${role}:${storyPath || "current-task"}`,
        type: "run_qc",
        phase: role,
        storyPath,
        note: `Recent ${role} completion detected. Run /qc --phase=${role}.`
      });
    } else {
      removePendingActions(
        state,
        (item) => item.type === "run_qc" && item.phase === role && matchesStoryScope(item.storyPath, storyPath)
      );
      if (shouldQueueSubmitAfterCompletion(role, profile, message, deliveryPolicy)) {
        queueSubmit(
          state,
          storyPath,
          `Recent ${role} completion detected. Run /submit.`,
          "tester_complete_without_qc"
        );
      }
    }

    syncWorkflowExpectedNextStep(state, storyPath, workflow);
  }

  if ((role === "tester" || role === "coder") && status === "blocked") {
    const blockedScopeLabel = isAmbiguousBlockedScope ? "ambiguous-story-scope" : storyPath || "current-task";
    const blockedNote = isAmbiguousBlockedScope
      ? `Recent ${role} blockage detected, but the active story is ambiguous. Resolve story ownership (cwd/worktree/branch or story_path) before resuming.`
      : `Recent ${role} blockage detected. Review structured handoff before continuing.`;
    const reviewNote = isAmbiguousBlockedScope
      ? `A ${role} handoff blocked while multiple active stories were unresolved. Investigate story ownership first, then route fixes to the correct plan.`
      : `A ${role} handoff blocked the workflow. Investigate whether the issue comes from routing, role boundaries, or missing shared guidance.`;

    upsertPendingAction(state, {
      id: `blocked-review:${role}:${blockedScopeLabel}`,
      type: "blocked_review",
      phase: role,
      storyPath,
      scope: isAmbiguousBlockedScope ? "ambiguous" : undefined,
      note: blockedNote
    });
    if (storyPath && isLongRunningProfile(profile)) {
      upsertSessionRetrospective(state, storyPath, {
        trigger: "blocked",
        phase: role,
        note: `Before pausing ${basenameLabel(storyPath)}, capture attempted fixes, the broken assumption, and whether shared workflow docs need updates.`
      });
    }

    upsertAideReview(state, {
      issueKey: `blocked:${role}:${blockedScopeLabel}`,
      storyPath,
      scope: isAmbiguousBlockedScope ? "ambiguous" : undefined,
      sourceRole: role,
      capability: "investigation",
      severity: "L3",
      issueType: "workflow_break",
      routeTarget: "/Aide investigate",
      note: reviewNote
    });

    if (role === "tester" && workflow.required_handoff === "tester") {
      markWorkflowRequiresTesterHandoff(
        workflow,
        storyPath || workflow.required_handoff_story_path || null,
        "tester_blocked",
        "Tester handoff remains required before settlement.",
        {
          phase: "tester"
        }
      );
      syncWorkflowExpectedNextStep(state, storyPath, workflow);
    }
  }

  if (role === "product_assistant" && (status === "complete" || status === "blocked")) {
    recordProductAssistantReview(state, storyPath, status, message);
  }

  if (role === "architect" && status === "complete") {
    recordArchitectRetrospective(state, storyPath, message);
  }

  if (role === "qc") {
    processQcOutcome(state, storyPath, profile, message, deliveryPolicy, workflow);
    syncWorkflowExpectedNextStep(state, storyPath, workflow);
  }

  if (role === "submit") {
    processSubmitOutcome(state, storyPath, profile, message, status, workflow);
    syncWorkflowExpectedNextStep(state, storyPath, workflow);
  }
}

function recordSessionEnd(input, state, activeStories, projectDir, profile, deliveryPolicy, workflow) {
  const message = normalizeMessage(input);
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;

  if (shouldBlockSettlementForMissingTester(state, storyPath, message, workflow)) {
    blockSettlementForMissingTester(state, storyPath, "session_end", workflow);
    syncWorkflowExpectedNextStep(state, storyPath, workflow);
    return;
  }

  if (storyPath && isLongRunningProfile(profile)) {
    upsertSessionRetrospective(state, storyPath, {
      trigger: "session_close",
      note: `Session paused around ${basenameLabel(storyPath)}. Capture key decisions, broken assumptions, and whether any queued lesson should write back through /Aide.`
    });
  }

  syncWorkflowExpectedNextStep(state, storyPath, workflow);
}

function recordTaskSettled(input, state, activeStories, projectDir, profile, deliveryPolicy, workflow) {
  const message = normalizeMessage(input) || `Task status: ${String(input.task_status || input.status || "done")}`;
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;

  if (hasRequiredTesterHandoff(state, storyPath, workflow)) {
    blockSettlementForMissingTester(state, storyPath, "task_settled", workflow);
    syncWorkflowExpectedNextStep(state, storyPath, workflow);
    return;
  }

  if (storyPath && isLongRunningProfile(profile)) {
    upsertSessionRetrospective(state, storyPath, {
      trigger: "task_settled",
      note: `Task settled for ${basenameLabel(storyPath)}. Before archival, capture durable decisions, wrong assumptions, and whether any lesson should route through /Aide.`
    });
  }

  processQcOutcome(state, storyPath, profile, message, deliveryPolicy, workflow);
  maybeQueueSubmitForSettledTask(state, storyPath, profile, message, deliveryPolicy, workflow);
  syncWorkflowExpectedNextStep(state, storyPath, workflow);

  if (shouldCompressCompletedTask(profile, state, storyPath, message)) {
    clearHotTaskState(state, storyPath, profile, message, workflow);
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
    const activeStories = parseActiveStories(progressPath);
    const state = loadRuntimeState(projectDir);
    const taskContextPath = path.join(projectDir, ".codex", "state", "task-context.json");
    const hasTaskContextFile = fs.existsSync(taskContextPath);
    const taskContext = loadTaskContext(projectDir);
    const workflow = normalizeTaskWorkflowState(taskContext?.task?.workflow);
    const workflowBaseline = JSON.stringify(workflow);
    const profile = loadProjectProfileState(projectDir);
    const deliveryPolicy = loadDeliveryPolicy(projectDir);

    if (eventName === "subagent_result") {
      recordSubagentResult(input, state, activeStories, projectDir, profile, deliveryPolicy, workflow);
    } else if (eventName === "session_end") {
      recordSessionEnd(input, state, activeStories, projectDir, profile, deliveryPolicy, workflow);
    } else if (eventName === "task_settled") {
      recordTaskSettled(input, state, activeStories, projectDir, profile, deliveryPolicy, workflow);
    }

    trimRuntimeState(state);
    saveRuntimeState(projectDir, state);
    if (JSON.stringify(workflow) !== workflowBaseline) {
      saveTaskContext(projectDir, buildTaskContextWorkflowPatch(profile, workflow, hasTaskContextFile));
    }
    syncTaskRegistry(projectDir, {
      profile,
      runtimeState: state,
      progressPath
    });
    syncProgressFromState(progressPath, activeStories, state);
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
