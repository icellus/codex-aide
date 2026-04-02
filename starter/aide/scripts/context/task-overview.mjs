#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { isTerminalTaskStatus, readTaskContext } from "../shared/task-context.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function compactText(value, maxLength = 80) {
  const normalized = normalizeText(value).replace(/\n+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function readProfileField(text, label) {
  const prefix = `- ${label}:`;
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix));
  if (!line) {
    return "";
  }

  return line.slice(prefix.length).trim();
}

function loadCurrentTask(projectDir) {
  const taskContext = readTaskContext(projectDir);
  const task = taskContext?.task && typeof taskContext.task === "object" ? taskContext.task : null;
  const title = normalizeText(task?.current_task);
  if (!title) {
    return {
      currentTask: loadTaskFromProfile(projectDir),
      recentTasks: Array.isArray(taskContext?.recent_tasks) ? taskContext.recent_tasks : []
    };
  }

  return {
    currentTask: {
      title,
      status: normalizeText(task.status) || "unknown",
      deliveryMode: normalizeText(task.delivery_mode) || "",
      routeRationale: normalizeText(task.route_rationale) || "",
      checkpoint: normalizeText(task.checkpoint) || "",
      nextStep: normalizeText(task.next_step) || "",
      nextOwner: normalizeText(task.next_owner) || "",
      stickyOwner: normalizeText(task.sticky_owner) || "",
      stickyReason: normalizeText(task.sticky_reason) || "",
      waitingOn: normalizeText(task.waiting_on) || "",
      blockedReason: normalizeText(task.blocked_reason) || "",
      completionReason: normalizeText(task.completion_reason) || "",
      interruptedAt: normalizeText(task.interrupted_at) || "",
      openQuestions: Array.isArray(task.open_questions)
        ? task.open_questions.map((item) => normalizeText(item)).filter(Boolean)
        : []
    },
    recentTasks: Array.isArray(taskContext?.recent_tasks) ? taskContext.recent_tasks : []
  };
}

function loadTaskFromProfile(projectDir) {
  const profilePath = path.join(projectDir, ".codex", "aide", "context", "project-profile.md");
  if (!fs.existsSync(profilePath)) {
    return null;
  }

  const profileText = fs.readFileSync(profilePath, "utf8");
  const title = normalizeText(readProfileField(profileText, "Current task")).replace(/^`|`$/g, "");
  if (!title) {
    return null;
  }

  return {
    title,
    status: normalizeText(readProfileField(profileText, "Task status")).replace(/^`|`$/g, "") || "unknown",
    deliveryMode:
      normalizeText(readProfileField(profileText, "Selected delivery mode")).replace(/^`|`$/g, "") || "",
    routeRationale: normalizeText(readProfileField(profileText, "Route rationale")),
    checkpoint: "",
    nextStep: "",
    nextOwner: "",
    stickyOwner: "",
    stickyReason: "",
    waitingOn: "",
    blockedReason: "",
    completionReason: "",
    openQuestions: normalizeText(readProfileField(profileText, "Open questions"))
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean)
  };
}

function formatTaskLine(prefix, task) {
  const parts = [];
  const status = String(task.status || "unknown").toLowerCase();
  parts.push(`${prefix}: ${task.title || "Untitled task"}`);
  parts.push(`[${status}]`);

  if (task.deliveryMode) {
    parts.push(`mode=${task.deliveryMode}`);
  }

  if (task.checkpoint) {
    parts.push(`checkpoint=${task.checkpoint}`);
  }

  if (task.nextOwner) {
    parts.push(`owner=${compactText(task.nextOwner, 40)}`);
  }

  if (task.stickyOwner && task.stickyOwner !== "Aide") {
    parts.push(`followup=${task.stickyOwner}`);
  }

  if (task.nextStep && !isTerminalTaskStatus(task.status)) {
    parts.push(`next=${compactText(task.nextStep, 80)}`);
  }

  if (task.waitingOn && task.waitingOn !== "none") {
    parts.push(`wait=${task.waitingOn}`);
  }

  if (task.interruptedAt && !isTerminalTaskStatus(task.status)) {
    parts.push(`interrupted=${task.interruptedAt}`);
    parts.push("review=resume-or-retire");
  }

  if (task.blockedReason && status === "blocked") {
    parts.push(`blocked=${compactText(task.blockedReason, 80)}`);
  } else if (task.retireReason && status === "paused") {
    parts.push(`paused=${compactText(task.retireReason, 80)}`);
  } else if (task.completionReason && isTerminalTaskStatus(task.status)) {
    parts.push(`result=${compactText(task.completionReason, 80)}`);
  } else if (task.routeRationale) {
    parts.push(`reason=${compactText(task.routeRationale, 80)}`);
  } else if (Array.isArray(task.openQuestions) && task.openQuestions.length > 0) {
    parts.push(`question=${compactText(task.openQuestions[0], 80)}`);
  }

  return `- ${parts.join(" ")}`;
}

function formatPausedTaskLine(task) {
  return formatTaskLine("Paused task", {
    title: normalizeText(task.current_task),
    status: normalizeText(task.status) || "paused",
    deliveryMode: normalizeText(task.delivery_mode) || "",
    routeRationale: "",
    checkpoint: normalizeText(task.checkpoint) || "",
    nextStep: normalizeText(task.next_step) || "",
    nextOwner: normalizeText(task.next_owner) || "",
    stickyOwner: normalizeText(task.sticky_owner) || "",
    stickyReason: normalizeText(task.sticky_reason) || "",
    waitingOn: normalizeText(task.waiting_on) || "",
    blockedReason: normalizeText(task.blocked_reason) || "",
    completionReason: normalizeText(task.retire_reason || task.completion_reason) || "",
    retireReason: normalizeText(task.retire_reason) || "",
    interruptedAt: "",
    openQuestions: []
  });
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "context/task-overview.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const requestedStatus = String(input.status || "").trim().toLowerCase();
    const { currentTask, recentTasks } = loadCurrentTask(projectDir);
    const pausedTasks = recentTasks.filter((item) => String(item?.status || "").toLowerCase() === "paused");

    if (requestedStatus === "done" || requestedStatus === "completed") {
      const lines = ["Task history:"];
      if (currentTask && isTerminalTaskStatus(currentTask.status)) {
        lines.push(formatTaskLine("Latest settled task", currentTask));
      } else {
        const latestSettled = recentTasks.find((item) => isTerminalTaskStatus(item?.status));
        if (latestSettled) {
          lines.push(
            formatTaskLine("Latest settled task", {
              title: normalizeText(latestSettled.current_task),
              status: normalizeText(latestSettled.status),
              deliveryMode: normalizeText(latestSettled.delivery_mode),
              routeRationale: "",
              checkpoint: normalizeText(latestSettled.checkpoint),
              nextStep: "",
              nextOwner: "",
              stickyOwner: normalizeText(latestSettled.sticky_owner),
              stickyReason: normalizeText(latestSettled.sticky_reason),
              waitingOn: normalizeText(latestSettled.waiting_on),
              blockedReason: normalizeText(latestSettled.blocked_reason),
              completionReason: normalizeText(latestSettled.completion_reason || latestSettled.retire_reason),
              retireReason: "",
              interruptedAt: "",
              openQuestions: []
            })
          );
        }
      }
      lines.push("- Historical task registry is not maintained by the shipped scripts.");

      process.stdout.write(`${lines.join("\n")}\n`);
      logger.finalize({
        status: "ok",
        metadata: {
          mode: "completed"
        }
      });
      return;
    }

    if (requestedStatus === "paused") {
      const lines = ["Paused tasks:"];
      if (pausedTasks.length === 0) {
        lines.push("- Paused tasks: none");
      } else {
        lines.push(`- Paused tasks: ${pausedTasks.length}`);
        pausedTasks.slice(0, 3).forEach((task) => {
          lines.push(formatPausedTaskLine(task));
        });
      }

      process.stdout.write(`${lines.join("\n")}\n`);
      logger.finalize({
        status: "ok",
        metadata: {
          mode: "paused",
          resultCount: pausedTasks.length
        }
      });
      return;
    }

    const lines = ["Task overview:"];

    if (currentTask) {
      lines.push(formatTaskLine("Current task", currentTask));
    } else {
      lines.push("- Current task: none");
    }

    if (pausedTasks.length > 0) {
      lines.push(`- Paused tasks: ${pausedTasks.length}`);
      pausedTasks.slice(0, 2).forEach((task) => {
        lines.push(formatPausedTaskLine(task));
      });
    }

    process.stdout.write(`${lines.join("\n")}\n`);
    logger.finalize({
      status: "ok",
      metadata: {
        mode: "overview",
        hasCurrentTask: Boolean(currentTask)
      }
    });
  } catch (error) {
    process.stderr.write(`context/task-overview error: ${error instanceof Error ? error.message : String(error)}\n`);
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
