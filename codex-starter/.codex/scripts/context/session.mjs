#!/usr/bin/env node

import {
  basenameLabel,
  compareGovernanceLevel,
  findProgressFile,
  getProjectContext,
  isTaskSettled,
  loadProjectProfileState,
  loadRuntimeState,
  parseActivePlans,
  readJsonStdinEnvelope,
  resolveActivePlan,
  resolveActiveTask,
  saveRuntimeState,
  syncTaskRegistry,
  startRuntimeInvocationLogging
} from "../runtime/index.mjs";
function summarizePendingQCActions(state) {
  return state.pendingActions.filter((item) => item.type === "run_qc");
}

function summarizePendingTesterActions(state) {
  return state.pendingActions.filter((item) => item.type === "run_tester");
}

function summarizePendingSubmitActions(state) {
  return state.pendingActions.filter((item) => item.type === "run_submit");
}

function summarizeBlockedActions(state) {
  return state.pendingActions.filter((item) => item.type === "blocked_review");
}

function summarizeGovernanceQueue(state) {
  return state.governanceQueue.filter((item) => item.status === "queued");
}

function summarizeGovernanceReviews(state, currentTask) {
  const activeTaskId = currentTask?.id || null;
  const items = state.pendingActions.filter((item) => item.type === "governance_review");

  if (activeTaskId) {
    const matching = items.filter((item) => item.taskId === activeTaskId || !item.taskId);
    if (matching.length > 0) {
      return matching.sort((left, right) => compareGovernanceLevel(left.level, right.level)).slice(0, 2);
    }
  }

  return items.sort((left, right) => compareGovernanceLevel(left.level, right.level)).slice(0, 2);
}

function summarizeRetrospectiveActions(state, currentTask) {
  const activeTaskId = currentTask?.id || null;
  const items = state.pendingActions.filter((item) => item.type === "session_retrospective");

  if (activeTaskId) {
    const matching = items.filter((item) => item.taskId === activeTaskId);
    if (matching.length > 0) {
      return matching.slice(-1);
    }
  }

  return items.slice(-1);
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "context/session.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const progressPath = findProgressFile(input.cwd || projectDir) || findProgressFile(projectDir);
    const activePlans = parseActivePlans(progressPath);
    const currentPlan = resolveActivePlan(activePlans, input, projectDir);
    const profile = loadProjectProfileState(projectDir);
    const state = loadRuntimeState(projectDir);
    const taskRegistry = syncTaskRegistry(projectDir, {
      profile,
      runtimeState: state,
      progressPath,
      persist: false
    });
    const currentTask = resolveActiveTask(taskRegistry, input, projectDir);

    const blockedActions = summarizeBlockedActions(state);
    const blockedForCurrent = currentTask
      ? blockedActions.filter((item) => item.taskId === currentTask.id)
      : [];
    const pendingTester = summarizePendingTesterActions(state);
    const pendingTesterForCurrent = currentTask
      ? pendingTester.filter((item) => item.taskId === currentTask.id)
      : [];
    const pendingQC = summarizePendingQCActions(state);
    const pendingQcForCurrent = currentTask
      ? pendingQC.filter((item) => item.taskId === currentTask.id)
      : [];
    const pendingSubmit = summarizePendingSubmitActions(state);
    const pendingSubmitForCurrent = currentTask
      ? pendingSubmit.filter((item) => item.taskId === currentTask.id)
      : [];
    const blockedPool = currentTask ? blockedForCurrent : blockedActions;
    const pendingTesterPool = currentTask ? pendingTesterForCurrent : pendingTester;
    const pendingQcPool = currentTask ? pendingQcForCurrent : pendingQC;
    const pendingSubmitPool = currentTask ? pendingSubmitForCurrent : pendingSubmit;
    const retrospectiveActions = summarizeRetrospectiveActions(state, currentTask);
    const governanceQueue = summarizeGovernanceQueue(state);
    const governanceReviews = summarizeGovernanceReviews(state, currentTask);

    if (
      isTaskSettled(profile) &&
      blockedPool.length === 0 &&
      pendingTesterPool.length === 0 &&
      pendingQcPool.length === 0 &&
      pendingSubmitPool.length === 0 &&
      retrospectiveActions.length === 0 &&
      governanceQueue.length === 0 &&
      governanceReviews.length === 0
    ) {
      const changed = Boolean(state.sessionContext.lastReminderText);
      if (state.sessionContext.lastReminderText) {
        state.sessionContext.lastReminderText = "";
        saveRuntimeState(projectDir, state);
      }
      logger.finalize({
        status: "ok",
        metadata: {
          reminderCount: 0,
          changed
        }
      });
      return;
    }

    const reminders = [];

    const pushReminder = (priority, text) => {
      if (!text) {
        return;
      }
      reminders.push({ priority, text });
    };

    const blocked = blockedPool.slice(-1);
    for (const item of blocked) {
      const missingImplementationBrief = /Implementation Brief|任务实施说明/i.test(String(item.note || ""));
      const phase = String(item.phase || "").trim().toLowerCase();
      pushReminder(
        100,
        phase === "product_assistant"
          ? `- Blocked handoff${item.taskId ? ` for ${item.taskId}` : ""}: product_assistant reported blockage. Route back through Aide for re-triage across product_manager, technical_manager, and product_assistant lines.`
          : missingImplementationBrief
          ? `- Blocked handoff${item.taskId ? ` for ${item.taskId}` : ""}: Implementation Brief (任务实施说明) is missing/unreadable. Stop tester, qc, and submit continuation; technical_manager should refresh the brief and gather user clarification via Aide if needed.`
          : `- Blocked handoff${item.taskId ? ` for ${item.taskId}` : ""}: route back through technical_manager, review the structured blockage, then resume ${item.phase || "work"}.`
      );
    }

    if (currentPlan) {
      const activePlan = currentPlan;
      pushReminder(
        60,
        `- Active plan: ${activePlan.title}${activePlan.planPath ? ` (${basenameLabel(activePlan.planPath)})` : ""}`
      );
    } else if (activePlans.length > 1) {
      pushReminder(55, `- Active plans: ${activePlans.length} (current plan unresolved from currentTaskId/cwd/worktree)`);
    }

    for (const item of pendingQcPool.slice(-1)) {
      pushReminder(
        90,
        `- Pending QC decision${item.taskId ? ` for ${item.taskId}` : ""}: route through technical_manager, then enter the qc review path for phase=${item.phase} if approved`
      );
    }

    for (const item of pendingTesterPool.slice(-1)) {
      pushReminder(
        95,
        `- Pending tester handoff${item.taskId ? ` for ${item.taskId}` : ""}: route through technical_manager to tester before QC, submit, or settlement`
      );
    }

    for (const item of pendingSubmitPool.slice(-1)) {
      pushReminder(
        85,
        `- Pending submit${item.taskId ? ` for ${item.taskId}` : ""}: enter the submit path`
      );
    }

    if (retrospectiveActions.length > 0 || governanceQueue.length > 0) {
      for (const item of retrospectiveActions) {
        pushReminder(
          40,
          `- Retrospective pending${item.taskId ? ` for ${item.taskId}` : ""}: capture decisions and writeback candidates before closing the long-running task.`
        );
        if (Array.isArray(item.categories) && item.categories.length > 0) {
          pushReminder(35, `- Retrospective focus: ${item.categories.join(", ")}`);
        }
      }

      if (governanceQueue.length > 0) {
        const preview = governanceQueue
          .slice(-3)
          .map((item) => `${item.category} x${item.triggerCount}`)
          .join(", ");
        pushReminder(30, `- Governance queue: ${governanceQueue.length} item(s) pending review (${preview})`);
      }
    }

    for (const item of governanceReviews) {
      pushReminder(
        80,
        `- Governance review pending [${String(item.level || "G2").toUpperCase()}]${
          item.taskId ? ` for ${item.taskId}` : ""
        }: ${item.issue || item.note || "review the shared workflow and decide next step."}`
      );
    }

    const selected = reminders
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 2)
      .map((item) => item.text);

    const lines = selected.length > 0 ? ["Runtime state reminder:", ...selected] : [];
    const reminderText = lines.join("\n");
    const changed = state.sessionContext.lastReminderText !== reminderText;

    if (changed) {
      state.sessionContext.lastReminderText = reminderText;
      saveRuntimeState(projectDir, state);
    }

    if (changed && lines.length > 0 && reminderText) {
      process.stdout.write(`${reminderText}\n`);
    }

    logger.finalize({
      status: "ok",
      metadata: {
        reminderCount: lines.length > 0 ? selected.length : 0,
        changed
      }
    });
  } catch (error) {
    process.stderr.write(`session-context error: ${error instanceof Error ? error.message : String(error)}\n`);
    logger.finalize({
      status: "error",
      error
    });
    process.exit(1);
  } finally {
    restoreStreams();
  }
}

await main();
