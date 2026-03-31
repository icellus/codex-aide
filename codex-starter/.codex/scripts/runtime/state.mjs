#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  compactText,
  findProgressFile,
  getProjectContext,
  isLongRunningProfile,
  isQcEnabled,
  loadDeliveryPolicy,
  loadProjectProfileState,
  loadRuntimeState,
  loadTaskContext,
  normalizeTaskWorkflowState,
  parseActivePlans,
  readJsonStdinEnvelope,
  saveRuntimeState,
  saveTaskContext,
  startRuntimeInvocationLogging,
  syncProgressFromState,
  syncTaskRegistry,
  trimRuntimeState,
  validateStructuredResultContract
} from "./index.mjs";
import {
  blockSettlementForMissingTester,
  detectMissingTaskImplementationBrief,
  maybeQueueSubmitForSettledTask,
  processQcOutcome,
  processSubmitOutcome,
  shouldBlockSettlementForMissingTester,
  shouldQueueSubmitAfterCompletion
} from "./state-delivery.mjs";
import {
  generateWorkflowChainId,
  normalizeEventName,
  normalizeMessage,
  normalizeRole,
  normalizeStatus,
  normalizeWorkflowChainId,
  resolveWorkflowChainId
} from "./state-normalizers.mjs";
import {
  recordArchitectRetrospective,
  recordProductAssistantReview,
  upsertGovernanceReview,
  upsertSessionRetrospective
} from "./state-reviews.mjs";
import { removePendingActions, upsertPendingAction } from "./queue.mjs";
import {
  buildTaskContextWorkflowPatch,
  clearHotTaskState,
  clearAmbiguousBlockedSignals,
  clearExecutionContinuation,
  clearTesterHandoff,
  hasAmbiguousBlockedSignals,
  isAmbiguousTaskScope,
  markWorkflowRequiresTesterHandoff,
  markWorkflowTesterHandoffCompleted,
  matchesTaskScope,
  queueSubmit,
  queueTesterHandoff,
  resolveRuntimeTaskId,
  resolveWorkflowScopedTaskId,
  shouldCompressCompletedTask,
  syncWorkflowExpectedNextStep,
  updateWorkflowState
} from "./state-workflow.mjs";

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
      const mismatchScopedTaskId = taskId || workflow.required_handoff_task_id || null;
      const mismatchReason = missingRequiredChainId
        ? "Tester handoff omitted workflow_chain_id for an active guarded chain. Re-run tester for the current chain."
        : "Tester handoff chain_id mismatched the active workflow chain. Re-run tester for the current chain.";
      const mismatchReviewNote = missingRequiredChainId
        ? "Tester handoff omitted workflow_chain_id while the active chain required it. Required tester handoff remains pending."
        : "Tester handoff workflow_chain_id mismatched active chain_id. Required tester handoff remains pending.";
      const mismatchBlockedId = missingRequiredChainId ? "chain-missing" : "chain-mismatch";

      queueTesterHandoff(
        state,
        mismatchScopedTaskId,
        missingRequiredChainId ? "tester_chain_missing" : "tester_chain_mismatch",
        activeWorkflowChainId,
        mismatchReason
      );
      markWorkflowRequiresTesterHandoff(
        workflow,
        mismatchScopedTaskId,
        "tester_blocked",
        mismatchReviewNote,
        {
          phase: "tester",
          chainId: activeWorkflowChainId
        }
      );
      upsertPendingAction(state, {
        id: `blocked-review:tester:${mismatchBlockedId}:${mismatchScopedTaskId || "current-task"}`,
        type: "blocked_review",
        phase: "tester",
        taskId: mismatchScopedTaskId,
        note: mismatchReason
      });
      upsertGovernanceReview(state, {
        issueKey: `tester-${mismatchBlockedId}:${mismatchScopedTaskId || "current-task"}`,
        taskId: mismatchScopedTaskId,
        sourceRole: "tester",
        issue: "Tester handoff chain did not match the active guarded workflow chain.",
        level: "G3",
        impact: "Settlement remains blocked because the required tester handoff for the active chain is still unresolved.",
        authority_target: ".codex/skills/technical_manager/SKILL.md",
        recommended_action: "Route back through Aide and technical_manager, then re-run tester for the current guarded chain.",
        disposition: "ask-user",
        note: mismatchReviewNote
      });
      syncWorkflowExpectedNextStep(state, mismatchScopedTaskId, workflow);
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
        ? `Recent ${role} blockage detected: Implementation Brief is missing or unreadable. Stop downstream tester, qc, and submit progression and route back through technical_manager. If user clarification is needed, technical_manager should collect it via Aide -> user.`
        : `Recent ${role} blockage detected. Route back through technical_manager and review the structured handoff before continuing.`;
    const reviewNote = isAmbiguousBlockedScope
      ? `A ${role} handoff blocked while multiple active plans were unresolved. Investigate task ownership first, then route fixes to the correct task chain.`
      : missingImplementationBrief
        ? `A ${role} handoff was blocked because the Implementation Brief was missing or unreadable. Resume only after technical_manager refreshes the brief; if user clarification is required, route via technical_manager -> Aide -> user.`
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

function recordSessionEnd(input, state, taskRegistry, projectDir, profile, workflow) {
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

function recordTaskSettled(input, state, taskRegistry, projectDir, profile, deliveryPolicy, workflow) {
  const message = normalizeMessage(input) || `Task status: ${String(input.task_status || input.status || "done")}`;
  const taskId = resolveRuntimeTaskId(taskRegistry, input, projectDir);

  if (shouldBlockSettlementForMissingTester(state, taskId, message, workflow)) {
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
    scriptName: "runtime/state.mjs",
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
      recordSessionEnd(input, state, taskRegistry, projectDir, profile, workflow);
    } else if (eventName === "task_settled") {
      recordTaskSettled(input, state, taskRegistry, projectDir, profile, deliveryPolicy, workflow);
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
    syncProgressFromState(progressPath, state, syncedTaskRegistry);
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
