#!/usr/bin/env node

import {
  basenameLabel,
  compactText,
  findProgressFile,
  getCurrentTaskRecord,
  getProjectDir,
  listTaskRegistryTasks,
  loadProjectProfileState,
  loadRuntimeState,
  parseProgressTasks,
  readJsonStdin,
  syncTaskRegistry
} from "./runtime-utils.mjs";

function formatTaskLine(prefix, task) {
  const parts = [];
  const status = String(task.status || "unknown").toLowerCase();
  parts.push(`${prefix}: ${task.title || "Untitled task"}`);
  parts.push(`[${status}]`);

  if (task.deliveryMode) {
    parts.push(`mode=${task.deliveryMode}`);
  }

  if (task.storyPath) {
    parts.push(`story=${basenameLabel(task.storyPath)}`);
  }

  if (task.nextStep) {
    parts.push(`next=${compactText(task.nextStep, 80)}`);
  } else if (task.reason) {
    parts.push(`reason=${compactText(task.reason, 80)}`);
  } else if (task.summary) {
    parts.push(`summary=${compactText(task.summary, 80)}`);
  }

  return `- ${parts.join(" ")}`;
}

function taskStatus(task) {
  return String(task?.status || "").toLowerCase();
}

async function main() {
  const input = await readJsonStdin();
  const projectDir = getProjectDir(input);
  const progressPath = findProgressFile(input.cwd || projectDir) || findProgressFile(projectDir);
  const progressTasks = parseProgressTasks(progressPath);
  const profile = loadProjectProfileState(projectDir);
  const runtimeState = loadRuntimeState(projectDir);
  const registry = syncTaskRegistry(projectDir, {
    profile,
    runtimeState,
    progressPath,
    progressTasks
  });

  const requestedStatus = String(input.status || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(20, Number.parseInt(String(input.limit || "5"), 10) || 5));
  const currentTask = getCurrentTaskRecord(registry);

  if (requestedStatus === "done" || requestedStatus === "completed") {
    const completed = listTaskRegistryTasks(
      registry,
      (task) => taskStatus(task) === "done" || taskStatus(task) === "cancelled"
    );

    const lines = ["Task history:"];

    if (completed.length === 0) {
      lines.push("- Completed tasks: none recorded");
    } else {
      lines.push(`- Completed tasks: ${completed.length}`);
      completed.slice(0, limit).forEach((task) => {
        lines.push(formatTaskLine("Completed", task));
      });
    }

    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  const unfinished = listTaskRegistryTasks(
    registry,
    (task) =>
      (taskStatus(task) === "active" ||
        taskStatus(task) === "parked" ||
        taskStatus(task) === "blocked" ||
        taskStatus(task) === "queued") &&
      task.id !== currentTask?.id
  );

  const lines = ["Task overview:"];

  if (currentTask) {
    lines.push(formatTaskLine("Current task", currentTask));
  } else {
    lines.push("- Current task: none");
  }

  if (unfinished.length === 0) {
    lines.push("- Historical unfinished tasks: none");
  } else {
    lines.push(`- Historical unfinished tasks: ${unfinished.length}`);
    unfinished.slice(0, limit).forEach((task) => {
      lines.push(formatTaskLine("Unfinished", task));
    });
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

await main();
