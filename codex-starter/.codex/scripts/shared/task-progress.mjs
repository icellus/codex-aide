import fs from "node:fs";
import path from "node:path";

import { ensureDir } from "./logging.mjs";
import {
  defaultTaskProgressPath,
  hasTrackedTask,
  isManagedTaskProgressPath,
  isTerminalTaskStatus,
  normalizeTaskStatus,
  slugifyTaskId
} from "./task-context.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeTaskRecord(task = {}) {
  return {
    current_task: normalizeText(task.current_task),
    task_id: normalizeText(task.task_id),
    status: normalizeTaskStatus(task.status, "idle"),
    class: normalizeText(task.class) || "unknown",
    delivery_mode: normalizeText(task.delivery_mode),
    checkpoint: normalizeText(task.checkpoint) || "none",
    next_step: normalizeText(task.next_step),
    next_owner: normalizeText(task.next_owner),
    sticky_owner: normalizeText(task.sticky_owner),
    waiting_on: normalizeText(task.waiting_on) || "none",
    blocked_reason: normalizeText(task.blocked_reason),
    completion_reason: normalizeText(task.completion_reason),
    retire_reason: normalizeText(task.retire_reason),
    implementation_brief_path: normalizeText(task.implementation_brief_path),
    progress_path: normalizeText(task.progress_path),
    route_rationale: normalizeText(task.route_rationale),
    enabled_roles: normalizeStringList(task.enabled_roles),
    enabled_modules: normalizeStringList(task.enabled_modules),
    created_at: normalizeText(task.created_at),
    started_at: normalizeText(task.started_at),
    updated_at: normalizeText(task.updated_at),
    paused_at: normalizeText(task.paused_at),
    interrupted_at: normalizeText(task.interrupted_at),
    finished_at: normalizeText(task.finished_at),
    retired_at: normalizeText(task.retired_at),
    last_event: normalizeText(task.last_event),
    last_actor: normalizeText(task.last_actor)
  };
}

function isLongRunningTask(task = {}) {
  return hasTrackedTask(task) && normalizeText(task.delivery_mode) === "long-running" && Boolean(slugifyTaskId(task.task_id));
}

function normalizeComparableTask(task = {}) {
  const normalized = normalizeTaskRecord(task);
  return {
    current_task: normalized.current_task,
    task_id: normalized.task_id,
    status: normalized.status,
    class: normalized.class,
    delivery_mode: normalized.delivery_mode,
    checkpoint: normalized.checkpoint,
    next_step: normalized.next_step,
    next_owner: normalized.next_owner,
    sticky_owner: normalized.sticky_owner,
    waiting_on: normalized.waiting_on,
    blocked_reason: normalized.blocked_reason,
    completion_reason: normalized.completion_reason,
    retire_reason: normalized.retire_reason,
    implementation_brief_path: normalized.implementation_brief_path,
    progress_path: normalized.progress_path,
    route_rationale: normalized.route_rationale,
    enabled_roles: normalized.enabled_roles,
    enabled_modules: normalized.enabled_modules,
    updated_at: normalized.updated_at,
    paused_at: normalized.paused_at,
    interrupted_at: normalized.interrupted_at,
    finished_at: normalized.finished_at,
    retired_at: normalized.retired_at,
    last_event: normalized.last_event,
    last_actor: normalized.last_actor
  };
}

function currentPathForTask(projectDir, task) {
  const configured = normalizeText(task.progress_path);
  if (configured) {
    return path.isAbsolute(configured) ? path.resolve(configured) : path.join(projectDir, configured);
  }

  return defaultTaskProgressPath(projectDir, task.task_id, task.delivery_mode, task.status);
}

function activeCurrentPath(projectDir, task) {
  return defaultTaskProgressPath(projectDir, task.task_id, task.delivery_mode, "active");
}

function archiveCurrentPath(projectDir, task) {
  return defaultTaskProgressPath(projectDir, task.task_id, task.delivery_mode, "completed");
}

function progressEvent(task) {
  const status = normalizeTaskStatus(task.status, "idle");
  if (status === "completed") {
    return "completed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "paused") {
    return "paused";
  }
  if (status === "blocked") {
    return "blocked";
  }
  if (status === "waiting_user") {
    return "waiting-user";
  }

  const lastEvent = normalizeText(task.last_event);
  if (lastEvent === "new-task" || lastEvent === "brief-refresh" || lastEvent === "handoff-switch" || lastEvent === "resume") {
    return lastEvent;
  }

  return "checkpoint";
}

function eventTimestamp(task) {
  return (
    normalizeText(task.retired_at) ||
    normalizeText(task.finished_at) ||
    normalizeText(task.paused_at) ||
    normalizeText(task.updated_at) ||
    normalizeText(task.started_at) ||
    normalizeText(task.created_at) ||
    new Date().toISOString()
  );
}

function timestampToken(value) {
  return String(value || new Date().toISOString()).replace(/[-:.TZ]/g, "").slice(0, 17) || "progress";
}

function historyFilePath(currentPath, task) {
  const event = progressEvent(task);
  const token = timestampToken(eventTimestamp(task));
  return path.join(path.dirname(currentPath), "history", `${token}-${event}.md`);
}

function relativeFromProject(projectDir, targetPath) {
  return path.relative(projectDir, targetPath).replace(/\\/g, "/") || ".";
}

function formatList(values, fallback = "N/A") {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : fallback;
}

function currentSummary(task) {
  if (task.status === "blocked") {
    return task.blocked_reason || task.next_step || "Blocked and waiting for internal resolution.";
  }
  if (task.status === "waiting_user") {
    return task.next_step || task.route_rationale || "Waiting for explicit user clarification.";
  }
  if (isTerminalTaskStatus(task.status)) {
    return task.completion_reason || task.retire_reason || "Task settled.";
  }
  if (task.status === "paused") {
    return task.retire_reason || task.next_step || "Task paused for later follow-up.";
  }
  return task.route_rationale || task.next_step || "Progress synchronized from task-context.";
}

function riskLine(task) {
  if (task.status === "blocked" && task.blocked_reason) {
    return task.blocked_reason;
  }
  if (task.status === "waiting_user") {
    return task.next_step || "Waiting for user input.";
  }
  if (task.status === "paused") {
    return task.retire_reason || "Paused.";
  }
  if (isTerminalTaskStatus(task.status)) {
    return task.completion_reason || task.retire_reason || "Settled.";
  }
  if (task.waiting_on && task.waiting_on !== "none") {
    return `waiting_on=${task.waiting_on}`;
  }
  return "none";
}

function renderCurrentSnapshot({ projectDir, task, currentPath, historyPath }) {
  const taskId = task.task_id;
  const historyRelative = relativeFromProject(projectDir, historyPath);
  const briefValue = task.implementation_brief_path ? `\`${relativeFromProject(projectDir, task.implementation_brief_path)}\`` : "N/A";

  return [
    "# Task Progress (Current Snapshot)",
    "",
    `**Last Synced**: ${eventTimestamp(task)}`,
    `**Latest Event**: \`${progressEvent(task)}\``,
    `**Latest History Entry**: \`${historyRelative}\``,
    "",
    "## Task Identity",
    "",
    `- Task ID: \`${taskId}\``,
    `- Work Item: ${task.current_task || "N/A"}`,
    `- Task Class: \`${task.class || "unknown"}\``,
    `- Delivery Mode: \`${task.delivery_mode || "lightweight"}\``,
    `- Status: \`${task.status}\``,
    `- Current Checkpoint: \`${task.checkpoint || "none"}\``,
    `- Owner: \`${task.sticky_owner || task.next_owner || "technical_manager"}\``,
    `- Active Roles / Modules: ${formatList(task.enabled_roles)}`,
    "",
    "## Scope and Brief",
    "",
    `- Implementation Brief: ${briefValue}`,
    `- Scope: ${formatList(task.enabled_modules, "N/A")}`,
    `- Key Decisions: ${task.route_rationale || "N/A"}`,
    "",
    "## Current State",
    "",
    `- Summary: ${currentSummary(task)}`,
    `- Next Step: ${task.next_step || "N/A"}`,
    `- Next Owner: ${task.next_owner || "N/A"}`,
    `- Risks, Blockers, or Waiting User Note: ${riskLine(task)}`,
    "",
    "## Validation",
    "",
    "- Last Verification: N/A",
    "- Pending Verification: N/A",
    "",
    "## History Sync",
    "",
    `- History Directory: \`${relativeFromProject(projectDir, path.join(path.dirname(currentPath), "history"))}/\``,
    `- Latest History Entry: \`${historyRelative}\``,
    `- Sync Result: \`synced\``
  ].join("\n");
}

function renderHistoryEntry({ projectDir, task, previousTask, currentPath, historyPath }) {
  const previousStatus = previousTask ? normalizeTaskStatus(previousTask.status, "idle") : "none";
  const previousCheckpoint = previousTask ? normalizeText(previousTask.checkpoint) || "none" : "none";
  const currentRelative = relativeFromProject(projectDir, currentPath);

  return [
    "# Task Progress History Entry",
    "",
    `**Timestamp**: ${eventTimestamp(task)}`,
    `**Task ID**: \`${task.task_id}\``,
    `**Event**: \`${progressEvent(task)}\``,
    `**Written By**: \`${task.last_actor || "technical_manager"}\``,
    "",
    "## Event Summary",
    "",
    `- Trigger: ${task.last_event || progressEvent(task)}`,
    `- Summary: ${currentSummary(task)}`,
    "",
    "## State Transition",
    "",
    `- Status: \`${previousStatus}\` -> \`${task.status}\``,
    `- Checkpoint: \`${previousCheckpoint}\` -> \`${task.checkpoint || "none"}\``,
    `- Active Roles / Modules: ${formatList(task.enabled_roles)}`,
    "",
    "## Brief and Ownership",
    "",
    `- Implementation Brief: ${task.implementation_brief_path ? `\`${relativeFromProject(projectDir, task.implementation_brief_path)}\`` : "N/A"}`,
    `- Handoff: ${task.next_owner || "N/A"}`,
    "",
    "## Evidence",
    "",
    `- Task State Timestamp: \`${eventTimestamp(task)}\``,
    `- Current File: \`${currentRelative}\``,
    "",
    "## Current Sync",
    "",
    `- Current File: \`${currentRelative}\``,
    `- Synced At: ${eventTimestamp(task)}`,
    "- Sync Result: `synced`",
    "",
    "## Next Step",
    "",
    `- Owner: ${task.next_owner || "N/A"}`,
    `- Action: ${task.next_step || "N/A"}`
  ].join("\n");
}

function moveActiveProgressToArchive(projectDir, task) {
  const activePath = activeCurrentPath(projectDir, task);
  const archivePath = archiveCurrentPath(projectDir, task);
  if (!activePath || !archivePath) {
    return;
  }

  const activeDir = path.dirname(activePath);
  const archiveDir = path.dirname(archivePath);

  if (!fs.existsSync(activeDir) || activeDir === archiveDir) {
    return;
  }

  ensureDir(path.dirname(archiveDir));
  fs.cpSync(activeDir, archiveDir, { recursive: true, force: true });
  fs.rmSync(activeDir, { recursive: true, force: true });
}

function syncTaskProgressRecord(projectDir, task, previousTask = null) {
  const normalized = normalizeTaskRecord(task);
  if (!isLongRunningTask(normalized)) {
    return null;
  }

  if (isTerminalTaskStatus(normalized.status)) {
    moveActiveProgressToArchive(projectDir, normalized);
  }

  const currentPath = currentPathForTask(projectDir, normalized);
  if (!currentPath) {
    return null;
  }

  if (
    !normalizeText(task.progress_path) ||
    isManagedTaskProgressPath(projectDir, task.progress_path, normalized.task_id, normalized.delivery_mode)
  ) {
    normalized.progress_path = currentPath;
  }

  const historyPath = historyFilePath(currentPath, normalized);
  ensureDir(path.dirname(historyPath));
  fs.writeFileSync(
    historyPath,
    `${renderHistoryEntry({
      projectDir,
      task: normalized,
      previousTask: previousTask ? normalizeTaskRecord(previousTask) : null,
      currentPath,
      historyPath
    })}\n`,
    "utf8"
  );
  fs.writeFileSync(currentPath, `${renderCurrentSnapshot({ projectDir, task: normalized, currentPath, historyPath })}\n`, "utf8");

  return {
    task_id: normalized.task_id,
    status: normalized.status,
    current_path: currentPath,
    history_path: historyPath
  };
}

function taskMapFromState(state = {}) {
  const tasks = new Map();
  const currentTask = state.task;
  if (isLongRunningTask(currentTask)) {
    tasks.set(normalizeText(currentTask.task_id), currentTask);
  }

  for (const item of Array.isArray(state.recent_tasks) ? state.recent_tasks : []) {
    if (isLongRunningTask(item)) {
      tasks.set(normalizeText(item.task_id), item);
    }
  }

  return tasks;
}

function syncTaskProgressArtifacts({ projectDir, previousState, nextState }) {
  const previousTasks = taskMapFromState(previousState);
  const nextTasks = taskMapFromState(nextState);
  const synced = [];

  for (const [taskId, task] of nextTasks.entries()) {
    const previousTask = previousTasks.get(taskId);
    const nextComparable = JSON.stringify(normalizeComparableTask(task));
    const previousComparable = previousTask ? JSON.stringify(normalizeComparableTask(previousTask)) : "";
    if (nextComparable === previousComparable) {
      continue;
    }

    const result = syncTaskProgressRecord(projectDir, task, previousTask || null);
    if (result) {
      synced.push(result);
    }
  }

  return synced;
}

export {
  isLongRunningTask,
  syncTaskProgressArtifacts
};
