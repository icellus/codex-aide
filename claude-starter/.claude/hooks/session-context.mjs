#!/usr/bin/env node

import {
  basenameLabel,
  findProgressFile,
  getProjectDir,
  loadRuntimeState,
  parseActiveStories,
  resolveActiveStory,
  readJsonStdin
} from "./hook-utils.mjs";

function summarizePendingQCActions(state) {
  return state.pendingActions.filter((item) => item.type === "run_qc");
}

function summarizeQueuedLessons(state) {
  return state.learningQueue.filter((item) => item.status === "queued");
}

function summarizeRetrospectiveActions(state, activeStories) {
  const activeStoryPath = activeStories[0]?.storyPath || null;
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
  const input = await readJsonStdin();
  const projectDir = getProjectDir(input);
  const progressPath = findProgressFile(input.cwd || projectDir) || findProgressFile(projectDir);
  const activeStories = parseActiveStories(progressPath);
  const currentStory = resolveActiveStory(activeStories, input, projectDir);
  const state = loadRuntimeState(projectDir);

  const lines = [];
  let hasReminder = false;

  if (currentStory) {
    const activePlan = currentStory;
    lines.push("Runtime state reminder:");
    hasReminder = true;
    lines.push(`- Active plan: ${activePlan.title}${activePlan.storyPath ? ` (${basenameLabel(activePlan.storyPath)})` : ""}`);
  } else if (activeStories.length > 1) {
    lines.push("Runtime state reminder:");
    hasReminder = true;
    lines.push(`- Active plans: ${activeStories.length} (current plan unresolved from cwd/worktree)`);
  }

  const pendingQC = summarizePendingQCActions(state);
  for (const item of pendingQC.slice(-2)) {
    if (!hasReminder) {
      lines.push("Runtime state reminder:");
      hasReminder = true;
    }
    lines.push(
      `- Pending QC: run /qc --phase=${item.phase}${item.storyPath ? ` for ${basenameLabel(item.storyPath)}` : ""}`
    );
  }

  const retrospectiveActions = summarizeRetrospectiveActions(state, activeStories);
  for (const item of retrospectiveActions) {
    if (!hasReminder) {
      lines.push("Runtime state reminder:");
      hasReminder = true;
    }
    lines.push(
      `- Retrospective pending${item.storyPath ? ` for ${basenameLabel(item.storyPath)}` : ""}: capture decisions, broken assumptions, and writeback candidates before resuming or closing.`
    );
    if (Array.isArray(item.categories) && item.categories.length > 0) {
      lines.push(`- Retrospective focus: ${item.categories.join(", ")}`);
    }
  }

  const queuedLessons = summarizeQueuedLessons(state);
  if (queuedLessons.length > 0) {
    if (!hasReminder) {
      lines.push("Runtime state reminder:");
      hasReminder = true;
    }
    const preview = queuedLessons
      .slice(-3)
      .map((item) => `${item.category} x${item.triggerCount}`)
      .join(", ");
    lines.push(`- Candidate lessons: ${queuedLessons.length} queued for retrospective (${preview})`);
    lines.push("- Decide in the retrospective whether each candidate becomes /Aide guidance or is dismissed as plan-local noise.");
  }

  if (lines.length > 0) {
    process.stdout.write(`${lines.join("\n")}\n`);
  }
}

await main();
