import {
  isQcEnabled,
  isSubmitEnabled,
  isTaskSettled,
  normalizeTaskWorkflowState
} from "./store.mjs";
import { resolveActiveTask } from "./registry.mjs";
import { compactText, detectQcPhase, detectTaskCompletionMessage } from "./structured.mjs";
import { normalizeWorkflowChainId, normalizeWorkflowPhase, workflowChainMatches } from "./state-normalizers.mjs";
import { removePendingActions, upsertPendingAction } from "./state.mjs";

function currentTaskLabel(profile, taskId) {
  return String(profile.task || "").trim() || (taskId || "current-task");
}

export function buildTaskContextWorkflowPatch(profile, workflow, hasTaskContextFile) {
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

export function resolveWorkflowScopedTaskId(taskId, workflow) {
  return normalizeWorkflowTaskId(taskId) || normalizeWorkflowTaskId(workflow?.required_handoff_task_id) || null;
}

export function resolveRuntimeTaskId(taskRegistry, input, projectDir) {
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

export function updateWorkflowState(workflow, patch = {}) {
  const next = normalizeTaskWorkflowState({
    ...(workflow || {}),
    ...(patch || {}),
    updated_at: new Date().toISOString()
  });
  Object.assign(workflow, next);
}

export function markWorkflowRequiresTesterHandoff(workflow, taskId, chain, reason, options = {}) {
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

export function markWorkflowTesterHandoffCompleted(workflow, profile, deliveryPolicy, options = {}) {
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

export function queueSubmit(state, taskId, note, trigger) {
  upsertPendingAction(state, {
    id: `run-submit:${taskId || "current-task"}`,
    type: "run_submit",
    taskId,
    trigger,
    note
  });
}

export function queueTesterHandoff(
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

export function clearExecutionContinuation(state, taskId) {
  removePendingActions(
    state,
    (item) =>
      (item.type === "run_tester" || item.type === "run_qc" || item.type === "run_submit") &&
      matchesTaskScope(item.taskId, taskId)
  );
}

export function clearTesterHandoff(state, taskId, chainId = null) {
  removePendingActions(
    state,
    (item) =>
      item.type === "run_tester" &&
      matchesTaskScope(item.taskId, taskId) &&
      workflowChainMatches(chainId, item.chain_id || item.workflow_chain_id)
  );
}

export function hasPendingTesterHandoff(state, taskId, chainId = null) {
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

export function hasRequiredTesterHandoff(state, taskId, workflow) {
  return (
    hasPendingTesterHandoff(state, taskId, workflow?.chain_id) ||
    workflowRequiresTesterHandoff(workflow, taskId)
  );
}

export function syncWorkflowExpectedNextStep(state, taskId, workflow) {
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

export function clearHotTaskState(state, taskId, profile, message, workflow) {
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

export function shouldCompressCompletedTask(profile, state, taskId, message) {
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

export function resolveQcPhaseForMetrics(state, message, taskId) {
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

export function recordQcMetrics(state, taskId, message, verdict, categories = []) {
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

export function matchesTaskScope(itemTaskId, taskId) {
  if (taskId) {
    return !itemTaskId || itemTaskId === taskId;
  }

  return !itemTaskId;
}

export function isAmbiguousTaskScope(activePlans, taskId) {
  return Array.isArray(activePlans) && activePlans.length > 1 && !taskId;
}

export function clearAmbiguousBlockedSignals(state, role) {
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

export function hasAmbiguousBlockedSignals(state, role) {
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
