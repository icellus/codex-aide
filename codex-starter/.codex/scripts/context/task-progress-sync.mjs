#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { defaultTaskProgressPath, hasTrackedTask, readTaskContext } from "../shared/task-context.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function readBulletField(text, label) {
  const prefix = `- ${label}:`;
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix));
  if (!line) {
    return "";
  }

  return line.slice(prefix.length).trim().replace(/^`|`$/g, "");
}

function resolveProgressPath(projectDir, task) {
  const configured = normalizeText(task.progress_path);
  if (configured) {
    return path.isAbsolute(configured) ? path.resolve(configured) : path.join(projectDir, configured);
  }

  return defaultTaskProgressPath(projectDir, task.task_id, task.delivery_mode, task.status);
}

function parseProgressSnapshot(progressPath) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return null;
  }

  const text = fs.readFileSync(progressPath, "utf8");
  return {
    taskId: readBulletField(text, "Task ID"),
    deliveryMode: readBulletField(text, "Delivery Mode"),
    status: readBulletField(text, "Status"),
    checkpoint: readBulletField(text, "Current Checkpoint"),
    nextStep: readBulletField(text, "Next Step"),
    nextOwner: readBulletField(text, "Next Owner"),
    briefPath: readBulletField(text, "Implementation Brief")
  };
}

function mismatchLines(task, progress) {
  const checks = [
    ["Task ID", normalizeText(task.task_id), progress.taskId],
    ["Delivery Mode", normalizeText(task.delivery_mode), progress.deliveryMode],
    ["Status", normalizeText(task.status), progress.status],
    ["Current Checkpoint", normalizeText(task.checkpoint), progress.checkpoint],
    ["Next Step", normalizeText(task.next_step), progress.nextStep],
    ["Next Owner", normalizeText(task.next_owner), progress.nextOwner]
  ];

  return checks
    .filter(([, hotValue, progressValue]) => hotValue && progressValue && hotValue !== progressValue)
    .map(([label, hotValue, progressValue]) => `- ${label}: task-context=${hotValue} progress=${progressValue}`);
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "context/task-progress-sync.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const taskContext = readTaskContext(projectDir);
    const task = taskContext.task || null;

    if (!task || !hasTrackedTask(task) || normalizeText(task.delivery_mode) !== "long-running") {
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "not-long-running"
        }
      });
      return;
    }

    const progressPath = resolveProgressPath(projectDir, task);
    if (!progressPath) {
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "missing-progress-path",
          taskId: task.task_id || null
        }
      });
      return;
    }

    const progress = parseProgressSnapshot(progressPath);
    if (!progress) {
      const lines = [
        "Task progress sync:",
        `- Current task: ${normalizeText(task.current_task)}`,
        `- Progress file missing: ${path.relative(projectDir, progressPath) || progressPath}`
      ];
      process.stdout.write(`${lines.join("\n")}\n`);
      logger.finalize({
        status: "ok",
        metadata: {
          mismatch: "missing-progress-file"
        }
      });
      return;
    }

    const mismatches = mismatchLines(task, progress);
    if (mismatches.length === 0) {
      logger.finalize({
        status: "ok",
        metadata: {
          mismatchCount: 0
        }
      });
      return;
    }

    const lines = [
      "Task progress sync:",
      `- Current task: ${normalizeText(task.current_task)}`,
      `- Progress file: ${path.relative(projectDir, progressPath) || progressPath}`,
      ...mismatches
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
    logger.finalize({
      status: "ok",
      metadata: {
        mismatchCount: mismatches.length
      }
    });
  } catch (error) {
    process.stderr.write(`context/task-progress-sync error: ${error instanceof Error ? error.message : String(error)}\n`);
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
