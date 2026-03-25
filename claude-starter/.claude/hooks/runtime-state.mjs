#!/usr/bin/env node

import {
  basenameLabel,
  compactText,
  detectFailureCategories,
  detectQcFail,
  detectQcPass,
  detectSubagentStatus,
  findProgressFile,
  getProjectDir,
  lessonForCategory,
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
} from "./hook-utils.mjs";

function upsertSessionRetrospective(state, storyPath, details = {}) {
  upsertPendingAction(state, {
    id: `session-retrospective:${storyPath || "unknown"}`,
    type: "session_retrospective",
    storyPath,
    ...details
  });
}

function recordSubagentStop(input, state, activeStories, projectDir) {
  const agentType = String(input.agent_type || "").toLowerCase();
  const message = String(input.last_assistant_message || "");
  const status = detectSubagentStatus(agentType, message);
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;

  state.recentSubagentEvents.push({
    timestamp: new Date().toISOString(),
    agentType,
    status,
    storyPath,
    summary: compactText(message)
  });

  if ((agentType === "tester" || agentType === "coder") && status === "complete" && storyPath) {
    upsertPendingAction(state, {
      id: `run-qc:${agentType}:${storyPath || "unknown"}`,
      type: "run_qc",
      phase: agentType,
      storyPath,
      note: `Recent ${agentType} completion detected. Run /qc --phase=${agentType}.`
    });
  }

  if ((agentType === "tester" || agentType === "coder") && status === "blocked" && storyPath) {
    upsertPendingAction(state, {
      id: `blocked-review:${agentType}:${storyPath || "unknown"}`,
      type: "blocked_review",
      phase: agentType,
      storyPath,
      note: `Recent ${agentType} blockage detected. Review structured handoff before continuing.`
    });
    upsertSessionRetrospective(state, storyPath, {
      trigger: "blocked",
      phase: agentType,
      note: `Before pausing ${basenameLabel(storyPath)}, capture attempted fixes, the broken assumption, and whether shared workflow docs need updates.`
    });
  }

}

function recordStop(input, state, activeStories, projectDir) {
  const message = String(input.last_assistant_message || "");
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;

  if (storyPath) {
    upsertSessionRetrospective(state, storyPath, {
      trigger: "session_close",
      note: `Session paused around ${basenameLabel(storyPath)}. Capture key decisions, broken assumptions, and whether any queued lesson should write back through /Aide.`
    });
  }

  if (storyPath && detectQcPass(message)) {
    removePendingActions(
      state,
      (item) => item.type === "run_qc" && (!item.storyPath || item.storyPath === storyPath)
    );

    const queuedForStory = state.learningQueue.filter(
      (item) => item.status === "queued" && (item.source || "unknown") === storyPath
    );

    if (queuedForStory.length > 0) {
      upsertSessionRetrospective(state, storyPath, {
        trigger: "qc_pass_after_retries",
        categories: Array.from(new Set(queuedForStory.map((item) => item.category))),
        note: `QC passed for ${basenameLabel(storyPath)}, but queued lesson candidates remain. Decide in the retrospective which ones should route through /Aide.`
      });
    }
  }

  if (storyPath && detectQcFail(message)) {
    const categories = detectFailureCategories(message);

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

    if (categories.length > 0) {
      upsertSessionRetrospective(state, storyPath, {
        trigger: "qc_failure",
        categories,
        note: `QC failure categories detected for ${basenameLabel(storyPath)}. Capture the wrong assumption, the corrective decision, and whether any lesson is durable enough for /Aide.`
      });
    }
  }
}

async function main() {
  try {
    const input = await readJsonStdin();
    const projectDir = getProjectDir(input);
    const progressPath = findProgressFile(input.cwd || projectDir) || findProgressFile(projectDir);
    const activeStories = parseActiveStories(progressPath);
    const state = loadRuntimeState(projectDir);
    const eventName = input.hook_event_name;

    if (eventName === "SubagentStop") {
      recordSubagentStop(input, state, activeStories, projectDir);
    } else if (eventName === "Stop") {
      recordStop(input, state, activeStories, projectDir);
    }

    trimRuntimeState(state);
    saveRuntimeState(projectDir, state);
    syncProgressFromState(progressPath, activeStories, state);
  } catch (error) {
    process.stderr.write(`runtime-state hook error: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

await main();
