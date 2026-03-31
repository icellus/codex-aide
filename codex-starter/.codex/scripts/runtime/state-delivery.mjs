import { isLongRunningProfile, isQcEnabled, isSubmitEnabled, isTaskSettled } from "./store.mjs";
import {
  detectFailureCategories,
  detectQcFail,
  detectQcPass,
  detectTaskCompletionMessage,
  highestGovernanceLevel,
  recommendedActionForCategory,
  suggestedRoutesForCategory,
  toGovernanceItemId
} from "./structured.mjs";
import { defaultGovernanceDisposition, governanceLevelForRetryCount, upsertGovernanceReview, upsertSessionRetrospective } from "./state-reviews.mjs";
import {
  clearHotTaskState,
  hasRequiredTesterHandoff,
  markWorkflowRequiresTesterHandoff,
  matchesTaskScope,
  queueSubmit,
  queueTesterHandoff,
  recordQcMetrics,
  resolveQcPhaseForMetrics,
  resolveWorkflowScopedTaskId,
  shouldCompressCompletedTask
} from "./state-workflow.mjs";
import { removePendingActions, upsertGovernanceQueueItem, upsertPendingAction } from "./queue.mjs";

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

export function detectMissingTaskImplementationBrief(role, message, structured = null) {
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
  const mentionsBrief = /implementation brief|execution brief|execution input|brief_path|brief path/i.test(text);
  const missingSignal = /missing|not found|unreadable|cannot read|unable to read|not provided|empty|blank/i.test(text);

  return mentionsBrief && missingSignal;
}

export function recordMissingTesterWorkflowBreak(state, taskId, source, note) {
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

export function shouldQueueSubmitAfterCompletion(role, profile, message, deliveryPolicy) {
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

export function maybeQueueSubmitForSettledTask(state, taskId, profile, message, deliveryPolicy, workflow) {
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

export function shouldBlockSettlementForMissingTester(state, taskId, message, workflow) {
  if (!hasRequiredTesterHandoff(state, taskId, workflow)) {
    return false;
  }

  return detectTaskCompletionMessage(message);
}

export function blockSettlementForMissingTester(state, taskId, source, workflow) {
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

export function processQcOutcome(state, taskId, profile, message, deliveryPolicy, workflow) {
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

export function processSubmitOutcome(state, taskId, profile, message, status, workflow) {
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
      disposition: defaultGovernanceDisposition("G3"),
      note: "A submit step blocked the delivery flow. Review branch policy, remotes, permissions, or delivery configuration."
    });
  }
}
