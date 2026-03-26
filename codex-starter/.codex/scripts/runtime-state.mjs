#!/usr/bin/env node

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
  getProjectDir,
  isOrchestratedProfile,
  isQcEnabled,
  isTaskSettled,
  lessonForCategory,
  loadProjectProfileState,
  loadRuntimeState,
  parseActiveStories,
  readJsonStdin,
  removePendingActions,
  resolveActiveStory,
  saveRuntimeState,
  suggestedRoutesForCategory,
  syncProgressFromState,
  toLessonId,
  trimRuntimeState,
  upsertLearningQueueItem,
  upsertPendingAction
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

  return raw;
}

function normalizeRole(input = {}, message = "") {
  const structured = extractStructuredResult(message);
  const raw = String(input.role || input.agent_type || structured?.role || "").trim().toLowerCase();

  if (raw === "qc_reviewer") {
    return "qc";
  }

  if (raw === "follow_worker") {
    return "follow";
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

function upsertSessionRetrospective(state, storyPath, details = {}) {
  upsertPendingAction(state, {
    id: `session-retrospective:${storyPath || "unknown"}`,
    type: "session_retrospective",
    storyPath,
    ...details
  });
}

function currentTaskLabel(profile, storyPath) {
  return String(profile.task || "").trim() || (storyPath ? basenameLabel(storyPath) : "current-task");
}

function hasHotTaskState(state, storyPath) {
  const hasPending = state.pendingActions.some((item) => {
    if (item.type !== "run_qc" && item.type !== "blocked_review" && item.type !== "session_retrospective") {
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
    if (item.type !== "run_qc" && item.type !== "blocked_review") {
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

function clearHotTaskState(state, storyPath, profile, message) {
  removePendingActions(state, (item) => {
    if (item.type !== "run_qc" && item.type !== "blocked_review" && item.type !== "session_retrospective") {
      return false;
    }

    if (storyPath) {
      return item.storyPath === storyPath;
    }

    return !item.storyPath;
  });

  state.sessionContext.lastReminderText = "";

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

function processQcOutcome(state, storyPath, profile, message) {
  if (detectQcPass(message)) {
    recordQcMetrics(state, storyPath, message, "pass");

    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesStoryScope(item.storyPath, storyPath)
    );
    removePendingActions(
      state,
      (item) => item.type === "blocked_review" && matchesStoryScope(item.storyPath, storyPath)
    );

    if (storyPath) {
      const queuedForStory = state.learningQueue.filter(
        (item) => item.status === "queued" && (item.source || "unknown") === storyPath
      );

      if (queuedForStory.length > 0 && isOrchestratedProfile(profile)) {
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
    recordQcMetrics(state, storyPath, message, "fail", categories);

    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesStoryScope(item.storyPath, storyPath)
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

      if (categories.length > 0 && isOrchestratedProfile(profile)) {
        upsertSessionRetrospective(state, storyPath, {
          trigger: "qc_failure",
          categories,
          note: `QC failure categories detected for ${basenameLabel(storyPath)}. Capture the wrong assumption, the corrective decision, and whether any lesson is durable enough for /Aide.`
        });
      }
    }
  }
}

function recordSubagentResult(input, state, activeStories, projectDir, profile) {
  const message = normalizeMessage(input);
  const role = normalizeRole(input, message);
  const status = normalizeStatus(input, role, message);
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;

  state.recentSubagentEvents.push({
    timestamp: new Date().toISOString(),
    agentType: role,
    status,
    storyPath,
    summary: compactText(message, 120)
  });

  if ((role === "tester" || role === "coder") && status === "complete" && isQcEnabled(profile)) {
    upsertPendingAction(state, {
      id: `run-qc:${role}:${storyPath || "current-task"}`,
      type: "run_qc",
      phase: role,
      storyPath,
      note: `Recent ${role} completion detected. Run /qc --phase=${role}.`
    });
  }

  if ((role === "tester" || role === "coder") && status === "complete") {
    removePendingActions(
      state,
      (item) => item.type === "blocked_review" && item.phase === role && matchesStoryScope(item.storyPath, storyPath)
    );
  }

  if ((role === "tester" || role === "coder") && status === "complete" && !isQcEnabled(profile)) {
    removePendingActions(
      state,
      (item) => item.type === "run_qc" && item.phase === role && matchesStoryScope(item.storyPath, storyPath)
    );
  }

  if ((role === "tester" || role === "coder") && status === "blocked") {
    upsertPendingAction(state, {
      id: `blocked-review:${role}:${storyPath || "current-task"}`,
      type: "blocked_review",
      phase: role,
      storyPath,
      note: `Recent ${role} blockage detected. Review structured handoff before continuing.`
    });
    if (storyPath && isOrchestratedProfile(profile)) {
      upsertSessionRetrospective(state, storyPath, {
        trigger: "blocked",
        phase: role,
        note: `Before pausing ${basenameLabel(storyPath)}, capture attempted fixes, the broken assumption, and whether shared workflow docs need updates.`
      });
    }
  }

  if (role === "qc") {
    processQcOutcome(state, storyPath, profile, message);
  }
}

function recordSessionEnd(input, state, activeStories, projectDir, profile) {
  const message = normalizeMessage(input);
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;

  if (storyPath && isOrchestratedProfile(profile)) {
    upsertSessionRetrospective(state, storyPath, {
      trigger: "session_close",
      note: `Session paused around ${basenameLabel(storyPath)}. Capture key decisions, broken assumptions, and whether any queued lesson should write back through /Aide.`
    });
  }

  processQcOutcome(state, storyPath, profile, message);

  if (shouldCompressCompletedTask(profile, state, storyPath, message)) {
    clearHotTaskState(state, storyPath, profile, message);
  }
}

async function main() {
  try {
    const input = await readJsonStdin();
    const projectDir = getProjectDir(input);
    const progressPath = findProgressFile(input.cwd || projectDir) || findProgressFile(projectDir);
    const activeStories = parseActiveStories(progressPath);
    const state = loadRuntimeState(projectDir);
    const profile = loadProjectProfileState(projectDir);
    const eventName = normalizeEventName(input);

    if (eventName === "subagent_result") {
      recordSubagentResult(input, state, activeStories, projectDir, profile);
    } else if (eventName === "session_end") {
      recordSessionEnd(input, state, activeStories, projectDir, profile);
    }

    trimRuntimeState(state);
    saveRuntimeState(projectDir, state);
    syncProgressFromState(progressPath, activeStories, state);
  } catch (error) {
    process.stderr.write(`runtime-state error: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

await main();
