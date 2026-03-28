#!/usr/bin/env node

import {
  basenameLabel,
  compareGovernanceSeverity,
  findProgressFile,
  getProjectContext,
  isTaskSettled,
  loadProjectProfileState,
  loadRuntimeState,
  parseActiveStories,
  readJsonStdinEnvelope,
  resolveActiveStory,
  saveRuntimeState,
  startRuntimeInvocationLogging
} from "./runtime-utils.mjs";
function summarizePendingQCActions(state) {
  return state.pendingActions.filter((item) => item.type === "run_qc");
}

function summarizePendingSubmitActions(state) {
  return state.pendingActions.filter((item) => item.type === "run_submit");
}

function summarizeBlockedActions(state) {
  return state.pendingActions.filter((item) => item.type === "blocked_review");
}

function summarizeQueuedLessons(state) {
  return state.learningQueue.filter((item) => item.status === "queued");
}

function summarizeAideReviews(state, currentStory) {
  const activeStoryPath = currentStory?.storyPath || null;
  const items = state.pendingActions.filter((item) => item.type === "aide_review");

  if (activeStoryPath) {
    const matching = items.filter((item) => item.storyPath === activeStoryPath || !item.storyPath);
    if (matching.length > 0) {
      return matching.sort((left, right) => compareGovernanceSeverity(left.severity, right.severity)).slice(0, 2);
    }
  }

  return items.sort((left, right) => compareGovernanceSeverity(left.severity, right.severity)).slice(0, 2);
}

function summarizeRetrospectiveActions(state, currentStory) {
  const activeStoryPath = currentStory?.storyPath || null;
  const items = state.pendingActions.filter((item) => item.type === "session_retrospective");

  if (activeStoryPath) {
    const matching = items.filter((item) => item.storyPath === activeStoryPath);
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
    scriptName: "session-context.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const progressPath = findProgressFile(input.cwd || projectDir) || findProgressFile(projectDir);
    const activeStories = parseActiveStories(progressPath);
    const currentStory = resolveActiveStory(activeStories, input, projectDir);
    const profile = loadProjectProfileState(projectDir);
    const state = loadRuntimeState(projectDir);

    const blockedActions = summarizeBlockedActions(state);
    const blockedForCurrent = currentStory
      ? blockedActions.filter((item) => item.storyPath === currentStory.storyPath)
      : [];
    const pendingQC = summarizePendingQCActions(state);
    const pendingQcForCurrent = currentStory
      ? pendingQC.filter((item) => item.storyPath === currentStory.storyPath)
      : [];
    const pendingSubmit = summarizePendingSubmitActions(state);
    const pendingSubmitForCurrent = currentStory
      ? pendingSubmit.filter((item) => item.storyPath === currentStory.storyPath)
      : [];
    const blockedPool = currentStory ? blockedForCurrent : blockedActions;
    const pendingQcPool = currentStory ? pendingQcForCurrent : pendingQC;
    const pendingSubmitPool = currentStory ? pendingSubmitForCurrent : pendingSubmit;
    const retrospectiveActions = summarizeRetrospectiveActions(state, currentStory);
    const queuedLessons = summarizeQueuedLessons(state);
    const aideReviews = summarizeAideReviews(state, currentStory);

    if (
      isTaskSettled(profile) &&
      blockedPool.length === 0 &&
      pendingQcPool.length === 0 &&
      pendingSubmitPool.length === 0 &&
      retrospectiveActions.length === 0 &&
      queuedLessons.length === 0 &&
      aideReviews.length === 0
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
      pushReminder(
        100,
        `- Blocked handoff${item.storyPath ? ` for ${basenameLabel(item.storyPath)}` : ""}: review the structured blockage before resuming ${item.phase || "work"}.`
      );
    }

    if (currentStory) {
      const activePlan = currentStory;
      pushReminder(
        60,
        `- Active plan: ${activePlan.title}${activePlan.storyPath ? ` (${basenameLabel(activePlan.storyPath)})` : ""}`
      );
    } else if (activeStories.length > 1) {
      pushReminder(55, `- Active plans: ${activeStories.length} (current plan unresolved from cwd/worktree)`);
    }

    for (const item of pendingQcPool.slice(-1)) {
      pushReminder(
        90,
        `- Pending QC: run /qc --phase=${item.phase}${item.storyPath ? ` for ${basenameLabel(item.storyPath)}` : ""}`
      );
    }

    for (const item of pendingSubmitPool.slice(-1)) {
      pushReminder(
        85,
        `- Pending submit${item.storyPath ? ` for ${basenameLabel(item.storyPath)}` : ""}: run /submit`
      );
    }

    if (retrospectiveActions.length > 0 || queuedLessons.length > 0) {
      for (const item of retrospectiveActions) {
        pushReminder(
          40,
          `- Retrospective pending${item.storyPath ? ` for ${basenameLabel(item.storyPath)}` : ""}: capture decisions and writeback candidates before closing the long-running task.`
        );
        if (Array.isArray(item.categories) && item.categories.length > 0) {
          pushReminder(35, `- Retrospective focus: ${item.categories.join(", ")}`);
        }
      }

      if (queuedLessons.length > 0) {
        const preview = queuedLessons
          .slice(-3)
          .map((item) => `${item.category} x${item.triggerCount}`)
          .join(", ");
        pushReminder(30, `- Candidate lessons: ${queuedLessons.length} queued for retrospective (${preview})`);
      }
    }

    for (const item of aideReviews) {
      pushReminder(
        80,
        `- /Aide review pending [${String(item.severity || "L2").toUpperCase()} ${item.capability || "investigation"}]${
          item.storyPath ? ` for ${basenameLabel(item.storyPath)}` : ""
        }: ${item.note || "review the shared workflow and decide on writeback."}`
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
