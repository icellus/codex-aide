#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";

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

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function loadCurrentTask(projectDir) {
  const runtimePath = path.join(projectDir, ".codex", "state", "task-context.json");
  const runtimeState = readJsonFile(runtimePath);

  if (!runtimeState) {
    return null;
  }

  const task = runtimeState?.task && typeof runtimeState.task === "object" ? runtimeState.task : null;
  if (!task) {
    return null;
  }

  const title = normalizeText(task.current_task);
  if (!title) {
    return null;
  }

  return {
    title,
    status: normalizeText(task.status) || "unknown",
    deliveryMode: normalizeText(task.delivery_mode) || "",
    routeRationale: normalizeText(task.route_rationale) || "",
    openQuestions: Array.isArray(task.open_questions)
      ? task.open_questions.map((item) => normalizeText(item)).filter(Boolean)
      : []
  };
}

function formatTaskLine(task) {
  const parts = [];
  const status = String(task.status || "unknown").toLowerCase();
  parts.push(`Current task: ${task.title || "Untitled task"}`);
  parts.push(`[${status}]`);

  if (task.deliveryMode) {
    parts.push(`mode=${task.deliveryMode}`);
  }

  if (task.routeRationale) {
    parts.push(`reason=${compactText(task.routeRationale, 80)}`);
  } else if (Array.isArray(task.openQuestions) && task.openQuestions.length > 0) {
    parts.push(`question=${compactText(task.openQuestions[0], 80)}`);
  }

  return `- ${parts.join(" ")}`;
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
    const currentTask = loadCurrentTask(projectDir);

    if (requestedStatus === "done" || requestedStatus === "completed") {
      const lines = [
        "Task history:",
        "- Historical task registry is not maintained by the shipped scripts."
      ];

      process.stdout.write(`${lines.join("\n")}\n`);
      logger.finalize({
        status: "ok",
        metadata: {
          mode: "completed"
        }
      });
      return;
    }

    const lines = ["Task overview:"];

    if (currentTask) {
      lines.push(formatTaskLine(currentTask));
    } else {
      lines.push("- Current task: none");
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
