#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { hasTrackedTask, normalizeTaskStatus, readTaskContext } from "../shared/task-context.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function gitStatusSummary(projectDir) {
  const result = spawnSync("git", ["status", "--porcelain", "--branch"], {
    cwd: projectDir,
    encoding: "utf8"
  });

  if (result.error || result.status !== 0) {
    return {
      available: false,
      clean: null,
      ahead: 0,
      behind: 0
    };
  }

  const lines = String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const branchLine = lines[0] || "";
  const dirtyLines = lines.slice(1);
  const aheadMatch = branchLine.match(/ahead (\d+)/i);
  const behindMatch = branchLine.match(/behind (\d+)/i);

  return {
    available: true,
    clean: dirtyLines.length === 0,
    ahead: aheadMatch ? Number.parseInt(aheadMatch[1], 10) || 0 : 0,
    behind: behindMatch ? Number.parseInt(behindMatch[1], 10) || 0 : 0
  };
}

function reconcileSuggestion(task, git) {
  const status = normalizeTaskStatus(task.status, "idle");
  const checkpoint = normalizeText(task.checkpoint);
  const nextOwner = normalizeText(task.next_owner);
  const waitingOn = normalizeText(task.waiting_on);

  if (!normalizeText(task.interrupted_at)) {
    return null;
  }

  if (status === "waiting_user" || waitingOn === "user") {
    return {
      action: "keep-waiting-user",
      reason: "current task already waits on explicit user clarification"
    };
  }

  if (status === "blocked") {
    return {
      action: "re-check-blocker",
      reason: "task was interrupted while blocked; confirm the blocker still applies before continuing"
    };
  }

  if (git.available && git.clean && (checkpoint === "validate" || checkpoint === "handoff" || checkpoint === "close" || nextOwner === "submit")) {
    return {
      action: "review-if-completed",
      reason: "worktree is clean and the task was interrupted near validation or delivery closeout"
    };
  }

  if (git.available && !git.clean) {
    return {
      action: "resume-current-task",
      reason: "dirty worktree suggests there is unfinished local work to continue"
    };
  }

  return {
    action: "resume-current-task",
    reason: "task was interrupted before settlement and still needs an explicit continue-or-settle decision"
  };
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "context/task-reconcile.mjs",
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
    if (!task || !hasTrackedTask(task)) {
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "no-current-task"
        }
      });
      return;
    }

    const suggestion = reconcileSuggestion(task, gitStatusSummary(projectDir));
    if (!suggestion) {
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "no-reconcile-needed",
          status: task.status
        }
      });
      return;
    }

    const git = gitStatusSummary(projectDir);
    const gitSummary = !git.available
      ? "unavailable"
      : git.clean
        ? `clean ahead=${git.ahead} behind=${git.behind}`
        : `dirty ahead=${git.ahead} behind=${git.behind}`;

    const lines = [
      "Task reconcile:",
      `- Current task: ${normalizeText(task.current_task)} [${normalizeTaskStatus(task.status, "idle")}]`,
      `- Interrupted at: ${normalizeText(task.interrupted_at)}`,
      `- Git state: ${gitSummary}`,
      `- Suggested next action: ${suggestion.action}`,
      `- Why: ${suggestion.reason}`
    ];

    process.stdout.write(`${lines.join("\n")}\n`);
    logger.finalize({
      status: "ok",
      metadata: {
        action: suggestion.action
      }
    });
  } catch (error) {
    process.stderr.write(`context/task-reconcile error: ${error instanceof Error ? error.message : String(error)}\n`);
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
