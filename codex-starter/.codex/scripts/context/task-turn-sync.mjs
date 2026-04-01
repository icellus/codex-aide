#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { ensureDir, startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { defaultTaskState, hasTrackedTask, normalizeTaskStatus, readTaskContext } from "../shared/task-context.mjs";
import { collectTurnEntries, latestAssistantMessage, latestStructuredResult, readTranscriptLines } from "../shared/transcript.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function hasOwnField(value, fieldName) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, fieldName);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function latestJsonObjectFromStdout(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return null;
}

function runTaskState(projectDir, input) {
  const scriptPath = path.join(projectDir, ".codex", "scripts", "context", "task-state.mjs");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectDir,
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: projectDir
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8"
  });

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    parsed: latestJsonObjectFromStdout(result.stdout || "")
  };
}

function lifecycleLogPath(projectDir, timestamp) {
  const day = String(timestamp || new Date().toISOString()).slice(0, 10) || "unknown-date";
  const logDir = path.join(projectDir, ".codex", "logs", "task-lifecycle");
  ensureDir(logDir);
  return path.join(logDir, `${day}.jsonl`);
}

function appendLifecycleLog(projectDir, entry) {
  const timestamp = normalizeText(entry?.timestamp) || new Date().toISOString();
  fs.appendFileSync(lifecycleLogPath(projectDir, timestamp), `${JSON.stringify({ ...entry, timestamp })}\n`, "utf8");
}

function readTurnSnapshot(transcriptPath, turnId) {
  const lines = readTranscriptLines(transcriptPath);
  const turnLines = collectTurnEntries(lines, turnId);
  const structured = latestStructuredResult(turnLines, { preferPhase: "final_answer" }) || latestStructuredResult(turnLines);
  const assistant = latestAssistantMessage(turnLines, { preferPhase: "final_answer" }) || latestAssistantMessage(turnLines);

  return {
    turnLines,
    structuredResult: structured?.structured || null,
    structuredPhase: structured?.phase || "",
    messageText: structured?.messageText || assistant?.messageText || ""
  };
}

function normalizeTaskUpdate(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const taskUpdate = {
    sync: value.sync === true
  };

  if (!taskUpdate.sync) {
    return taskUpdate;
  }

  if (hasOwnField(value, "status")) {
    taskUpdate.status = normalizeText(value.status).toLowerCase();
  }
  if (hasOwnField(value, "checkpoint")) {
    taskUpdate.checkpoint = normalizeText(value.checkpoint);
  }
  if (hasOwnField(value, "next_step")) {
    taskUpdate.next_step = normalizeText(value.next_step);
  }
  if (hasOwnField(value, "next_owner")) {
    taskUpdate.next_owner = normalizeText(value.next_owner);
  }
  if (hasOwnField(value, "waiting_on")) {
    taskUpdate.waiting_on = normalizeText(value.waiting_on).toLowerCase();
  }
  if (hasOwnField(value, "blocked_reason")) {
    taskUpdate.blocked_reason = normalizeText(value.blocked_reason);
  }
  if (hasOwnField(value, "completion_reason")) {
    taskUpdate.completion_reason = normalizeText(value.completion_reason);
  }
  if (hasOwnField(value, "enabled_roles")) {
    taskUpdate.enabled_roles = normalizeStringList(value.enabled_roles);
  }
  if (hasOwnField(value, "enabled_modules")) {
    taskUpdate.enabled_modules = normalizeStringList(value.enabled_modules);
  }
  if (hasOwnField(value, "event")) {
    taskUpdate.event = normalizeText(value.event);
  }

  return taskUpdate;
}

function buildTaskPatch(currentTask, taskUpdate) {
  const patch = {
    current_task: normalizeText(currentTask.current_task),
    task_id: normalizeText(currentTask.task_id)
  };

  for (const fieldName of [
    "status",
    "checkpoint",
    "next_step",
    "next_owner",
    "waiting_on",
    "blocked_reason",
    "completion_reason",
    "enabled_roles",
    "enabled_modules"
  ]) {
    if (hasOwnField(taskUpdate, fieldName)) {
      patch[fieldName] = taskUpdate[fieldName];
    }
  }

  return patch;
}

function hasTaskUpdateOverrides(taskUpdate) {
  if (!taskUpdate || typeof taskUpdate !== "object") {
    return false;
  }

  return [
    "status",
    "checkpoint",
    "next_step",
    "next_owner",
    "waiting_on",
    "blocked_reason",
    "completion_reason",
    "enabled_roles",
    "enabled_modules",
    "event"
  ].some((fieldName) => hasOwnField(taskUpdate, fieldName));
}

function decideSync({ currentTask, transcriptPath, turnId }) {
  if (!hasTrackedTask(currentTask)) {
    return {
      action: "noop",
      reason: "no-current-task",
      snapshot: null,
      role: ""
    };
  }

  const currentStatus = normalizeTaskStatus(currentTask.status, "idle");
  if (!transcriptPath || !turnId) {
    return {
      action: currentStatus === "completed" || currentStatus === "cancelled" ? "noop" : "record-interruption",
      reason: "missing-turn-context",
      snapshot: null,
      role: ""
    };
  }

  const snapshot = readTurnSnapshot(transcriptPath, turnId);
  const structuredResult = snapshot.structuredResult;
  const role = normalizeText(structuredResult?.role);
  const taskUpdate = normalizeTaskUpdate(structuredResult?.task_update);
  const hasOverrides = hasTaskUpdateOverrides(taskUpdate);

  if (currentStatus === "completed" || currentStatus === "cancelled") {
    if (taskUpdate?.sync && hasOverrides) {
      return {
        action: "sync-task-state",
        reason: "task-update",
        snapshot,
        structuredResult,
        taskUpdate,
        role
      };
    }

    return {
      action: "noop",
      reason: taskUpdate?.sync ? "terminal-task-sync-noop" : structuredResult ? "terminal-task-no-task-update" : "terminal-task",
      snapshot,
      structuredResult,
      role
    };
  }

  if (taskUpdate?.sync) {
    return {
      action: "sync-task-state",
      reason: "task-update",
      snapshot,
      structuredResult,
      taskUpdate,
      role
    };
  }

  return {
    action: "record-interruption",
    reason: structuredResult ? "missing-task-update" : "missing-structured-result",
    snapshot,
    structuredResult,
    role
  };
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "context/task-turn-sync.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    if (envelope.parseError) {
      throw envelope.parseError;
    }

    const stateBefore = readTaskContext(projectDir);
    const currentTask = stateBefore.task || defaultTaskState();
    const transcriptPath = normalizeText(input.transcript_path);
    const turnId = normalizeText(input.turn_id || input.turnId);
    const decision = decideSync({
      currentTask,
      transcriptPath,
      turnId
    });

    let invocation = {
      status: 0,
      stdout: "",
      stderr: "",
      parsed: null
    };

    if (decision.action === "sync-task-state") {
      const taskPatch = buildTaskPatch(currentTask, decision.taskUpdate || {});
      const taskStateInput = {
        action: "set",
        actor: decision.role || "runtime-hook",
        task: taskPatch
      };

      if (decision.taskUpdate?.event) {
        taskStateInput.event = decision.taskUpdate.event;
      }

      invocation = runTaskState(projectDir, taskStateInput);
    } else if (decision.action === "record-interruption") {
      invocation = runTaskState(projectDir, {
        action: "record-interruption"
      });
    }

    if ((invocation.status ?? 0) !== 0) {
      process.stderr.write(invocation.stderr || "task-turn-sync: delegated task-state failed\n");
      logger.finalize({
        status: "error",
        metadata: {
          decision: decision.action,
          reason: decision.reason,
          delegatedStatus: invocation.status
        }
      });
      process.exit(invocation.status ?? 1);
    }

    const stateAfter = readTaskContext(projectDir);
    const afterTask = stateAfter.task || defaultTaskState();
    const structuredStatus = normalizeText(decision.structuredResult?.status);
    const timestamp = new Date().toISOString();

    appendLifecycleLog(projectDir, {
      timestamp,
      session_id: normalizeText(input.session_id),
      turn_id: turnId || null,
      transcript_path: transcriptPath || null,
      hook_event_name: normalizeText(input.hook_event_name),
      decision: decision.action,
      reason: decision.reason,
      role: decision.role || null,
      structured_status: structuredStatus || null,
      status_before: normalizeTaskStatus(currentTask.status, "idle"),
      status_after: normalizeTaskStatus(afterTask.status, "idle"),
      task_id: normalizeText(afterTask.task_id || currentTask.task_id) || null,
      task_update: decision.taskUpdate || null,
      delegated_action: normalizeText(invocation.parsed?.action) || null,
      delegated_changed: Boolean(invocation.parsed?.changed)
    });

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        decision: decision.action,
        reason: decision.reason,
        role: decision.role || "",
        structured_status: structuredStatus || "",
        task: {
          task_id: afterTask.task_id,
          status: afterTask.status,
          waiting_on: afterTask.waiting_on,
          next_step: afterTask.next_step,
          next_owner: afterTask.next_owner,
          interrupted_at: afterTask.interrupted_at,
          finished_at: afterTask.finished_at
        }
      })}\n`
    );

    logger.finalize({
      status: "ok",
      metadata: {
        decision: decision.action,
        reason: decision.reason,
        role: decision.role || "",
        structuredStatus: structuredStatus || "",
        taskStatus: afterTask.status
      }
    });
  } catch (error) {
    process.stderr.write(`context/task-turn-sync error: ${error instanceof Error ? error.message : String(error)}\n`);
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
