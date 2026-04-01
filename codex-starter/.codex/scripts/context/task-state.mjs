#!/usr/bin/env node

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import {
  RECENT_TASK_LIMIT,
  defaultTaskContext,
  defaultTaskProgressPath,
  defaultRecentTask,
  defaultTaskState,
  hasTrackedTask,
  isInterruptibleTaskStatus,
  isTerminalTaskStatus,
  normalizeRecentTask,
  normalizeStickyOwner,
  normalizeTaskStatus,
  normalizeWaitingOn,
  readTaskContext,
  slugifyTaskId,
  writeTaskContext
} from "../shared/task-context.mjs";
import { absolutizeProjectPath } from "../shared/project-context.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function timestampToken(timestamp) {
  return String(timestamp || new Date().toISOString()).replace(/[-:.TZ]/g, "").slice(0, 17) || "task";
}

function createGeneratedTaskId(title, timestamp) {
  const slug = slugifyTaskId(title) || "task";
  return `${timestampToken(timestamp)}-${slug}`;
}

function inferAction(input = {}) {
  const explicit = normalizeText(input.action).toLowerCase();
  if (explicit) {
    return explicit;
  }

  const hookEventName = normalizeText(input.hook_event_name).toLowerCase();
  if (hookEventName === "stop") {
    return "record-interruption";
  }

  return "noop";
}

function hasOwnField(value, fieldName) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, fieldName);
}

function readOptionalText(inputTask, ...fieldNames) {
  for (const fieldName of fieldNames) {
    if (hasOwnField(inputTask, fieldName)) {
      return normalizeText(inputTask[fieldName]);
    }
  }

  return undefined;
}

function readOptionalLowerText(inputTask, ...fieldNames) {
  const value = readOptionalText(inputTask, ...fieldNames);
  return value === undefined ? undefined : value.toLowerCase();
}

function readOptionalStringList(inputTask, ...fieldNames) {
  for (const fieldName of fieldNames) {
    if (hasOwnField(inputTask, fieldName)) {
      return normalizeStringList(inputTask[fieldName]);
    }
  }

  return undefined;
}

function absolutizeOptionalRuntimePath(projectDir, value) {
  if (value === undefined) {
    return undefined;
  }

  return value ? absolutizeProjectPath(projectDir, value) : "";
}

function normalizePatch(projectDir, inputTask = {}) {
  return {
    current_task: readOptionalText(inputTask, "current_task", "title"),
    task_id: readOptionalText(inputTask, "task_id"),
    status: readOptionalLowerText(inputTask, "status"),
    class: readOptionalText(inputTask, "class"),
    risk: readOptionalText(inputTask, "risk"),
    delivery_mode: readOptionalText(inputTask, "delivery_mode"),
    route_rationale: readOptionalText(inputTask, "route_rationale"),
    routing_overrides: readOptionalStringList(inputTask, "routing_overrides"),
    enabled_roles: readOptionalStringList(inputTask, "enabled_roles"),
    enabled_modules: readOptionalStringList(inputTask, "enabled_modules"),
    qc_policy: readOptionalText(inputTask, "qc_policy"),
    submit_policy: readOptionalText(inputTask, "submit_policy"),
    validation_profile_status: readOptionalText(inputTask, "validation_profile_status"),
    open_questions: readOptionalStringList(inputTask, "open_questions"),
    checkpoint: readOptionalText(inputTask, "checkpoint"),
    next_step: readOptionalText(inputTask, "next_step"),
    next_owner: readOptionalText(inputTask, "next_owner"),
    sticky_owner: readOptionalText(inputTask, "sticky_owner", "follow_up_owner"),
    sticky_reason: readOptionalText(inputTask, "sticky_reason"),
    waiting_on: readOptionalLowerText(inputTask, "waiting_on"),
    blocked_reason: readOptionalText(inputTask, "blocked_reason"),
    completion_reason: readOptionalText(inputTask, "completion_reason"),
    implementation_brief_path: absolutizeOptionalRuntimePath(projectDir, readOptionalText(inputTask, "implementation_brief_path")),
    progress_path: absolutizeOptionalRuntimePath(projectDir, readOptionalText(inputTask, "progress_path")),
    retire_current_as: readOptionalLowerText(inputTask, "retire_current_as"),
    retire_reason: readOptionalText(inputTask, "retire_reason"),
    replace_current: inputTask.replace_current && typeof inputTask.replace_current === "object" ? inputTask.replace_current : null
  };
}

function inferLastEvent({ explicitEvent, action, previousStatus, nextStatus, isNewTask, briefChanged, ownerChanged }) {
  const normalizedEvent = normalizeText(explicitEvent);
  if (normalizedEvent) {
    return normalizedEvent;
  }

  if (action === "record-interruption") {
    return "session-stop";
  }

  if (isNewTask) {
    return "new-task";
  }

  if (previousStatus === "paused" && nextStatus !== "paused") {
    return "resume";
  }

  if (briefChanged) {
    return "brief-refresh";
  }

  if (ownerChanged && nextStatus === "handoff") {
    return "handoff-switch";
  }

  if (nextStatus === "blocked") {
    return "blocked";
  }

  if (nextStatus === "waiting_user") {
    return "waiting-user";
  }

  if (nextStatus === "completed" || nextStatus === "cancelled") {
    return "settled";
  }

  return "checkpoint";
}

function summarizeTask(task = {}) {
  return {
    task_id: normalizeText(task.task_id),
    current_task: normalizeText(task.current_task),
    status: normalizeTaskStatus(task.status, "idle"),
    checkpoint: normalizeText(task.checkpoint) || "none",
    next_step: normalizeText(task.next_step),
    next_owner: normalizeText(task.next_owner),
    sticky_owner: normalizeStickyOwner(task.sticky_owner, ""),
    waiting_on: normalizeWaitingOn(task.waiting_on, "none"),
    interrupted_at: normalizeText(task.interrupted_at) || null,
    finished_at: normalizeText(task.finished_at) || null
  };
}

const TECHNICAL_CHAIN_ROLES = new Set(["technical_manager", "coder", "tester", "qc", "submit"]);
const PRODUCT_CHAIN_ROLES = new Set(["product_manager", "architect"]);
const NON_CODE_CHAIN_ROLES = new Set(["product_assistant"]);

function inferStickyOwner({ patch, previousTask, newIdentity }) {
  const explicitStickyOwner = normalizeStickyOwner(patch.sticky_owner, "");
  if (explicitStickyOwner) {
    return explicitStickyOwner;
  }

  const enabledRoles = Array.isArray(patch.enabled_roles) ? patch.enabled_roles : [];
  const nextOwner = normalizeText(patch.next_owner);

  if (TECHNICAL_CHAIN_ROLES.has(nextOwner) || enabledRoles.some((role) => TECHNICAL_CHAIN_ROLES.has(role))) {
    return "technical_manager";
  }

  if (NON_CODE_CHAIN_ROLES.has(nextOwner) || enabledRoles.some((role) => NON_CODE_CHAIN_ROLES.has(role))) {
    return "product_assistant";
  }

  if (PRODUCT_CHAIN_ROLES.has(nextOwner) || enabledRoles.some((role) => PRODUCT_CHAIN_ROLES.has(role))) {
    return "product_manager";
  }

  if (!newIdentity) {
    return normalizeStickyOwner(previousTask.sticky_owner, "Aide") || "Aide";
  }

  return "Aide";
}

function defaultStickyReason(stickyOwner) {
  if (stickyOwner === "technical_manager") {
    return "same-task source-code follow-up stays on the technical delivery owner";
  }

  if (stickyOwner === "product_manager") {
    return "same-task scope follow-up stays on the product definition owner";
  }

  if (stickyOwner === "product_assistant") {
    return "same-task non-code follow-up stays on the delivery owner";
  }

  if (stickyOwner === "architect") {
    return "same-task architecture follow-up stays on the architecture owner";
  }

  return "same-task follow-up stays with the current front-line owner";
}

function normalizeRetireStatus(value, fallback = "cancelled") {
  const normalized = normalizeTaskStatus(value, fallback);
  if (normalized === "paused" || normalized === "completed" || normalized === "cancelled") {
    return normalized;
  }

  return fallback;
}

function pushRecentTask(state, task, { retireStatus, retireReason, retiredAt, replacementTaskId = "", actor = "" }) {
  const entry = normalizeRecentTask({
    ...defaultRecentTask(),
    ...task,
    status: normalizeRetireStatus(retireStatus, normalizeTaskStatus(task.status, "cancelled")),
    finished_at: normalizeRetireStatus(retireStatus, "cancelled") === "paused" ? null : retiredAt,
    retired_at: retiredAt,
    retire_reason: normalizeText(retireReason),
    replacement_task_id: normalizeText(replacementTaskId),
    last_actor: normalizeText(actor) || normalizeText(task.last_actor)
  });

  const remaining = Array.isArray(state.recent_tasks)
    ? state.recent_tasks.filter((item) => normalizeText(item.task_id) !== entry.task_id)
    : [];

  state.recent_tasks = [entry, ...remaining].slice(0, RECENT_TASK_LIMIT);
}

function archiveCurrentTask(state, task, options) {
  if (!hasTrackedTask(task)) {
    return;
  }

  pushRecentTask(state, task, options);
}

function requestedRetireStatus(rawValue, fallback = "paused") {
  const raw = normalizeText(rawValue).toLowerCase();
  if (!raw) {
    return fallback;
  }

  return normalizeRetireStatus(raw, "");
}

function deriveWaitingOn({ patch, previousTask, nextStatus }) {
  const explicitWaitingOn = patch.waiting_on === undefined ? undefined : normalizeWaitingOn(patch.waiting_on, "none");

  if (nextStatus === "waiting_user") {
    if (explicitWaitingOn && explicitWaitingOn !== "none") {
      return explicitWaitingOn;
    }

    return "user";
  }

  if (nextStatus === "blocked") {
    if (explicitWaitingOn !== undefined) {
      return explicitWaitingOn;
    }

    const previousWaitingOn = normalizeWaitingOn(previousTask.waiting_on, "none");
    return previousWaitingOn === "none" || previousWaitingOn === "user" ? "unknown" : previousWaitingOn;
  }

  if (explicitWaitingOn !== undefined) {
    return explicitWaitingOn;
  }

  return "none";
}

function applySetTask({ projectDir, state, patch, timestamp, actor, explicitEvent }) {
  const next = defaultTaskContext();
  next.collaboration = state.collaboration;
  next.updated_at = timestamp;
  next.recent_tasks = Array.isArray(state.recent_tasks) ? [...state.recent_tasks] : [];

  const previousTask = state.task || defaultTaskState();
  const incomingTitle = patch.current_task === undefined ? previousTask.current_task : patch.current_task;
  const explicitTaskId = patch.task_id;
  const titleChanged = Boolean(incomingTitle) && incomingTitle !== previousTask.current_task;
  const incomingTaskId =
    explicitTaskId ||
    (titleChanged ? createGeneratedTaskId(incomingTitle, timestamp) : previousTask.task_id || createGeneratedTaskId(incomingTitle, timestamp));
  const newIdentity =
    Boolean(incomingTitle) && (titleChanged || (Boolean(explicitTaskId) && explicitTaskId !== previousTask.task_id));
  const currentTracked = hasTrackedTask(previousTask);
  const currentTerminal = isTerminalTaskStatus(previousTask.status);

  if (newIdentity && currentTracked && !currentTerminal) {
    const retireCurrentAs = requestedRetireStatus(patch.retire_current_as || patch.replace_current?.retire_current_as, "paused");
    const retireReason = patch.retire_reason || patch.replace_current?.retire_reason || "";

    if (!retireCurrentAs) {
      return {
        error: {
          code: "invalid-retire-status",
          message: "retire_current_as must be paused|completed|cancelled when provided",
          current_task: summarizeTask(previousTask)
        }
      };
    }

    archiveCurrentTask(next, previousTask, {
      retireStatus: retireCurrentAs,
      retireReason: retireReason || defaultRetireReason(retireCurrentAs, incomingTaskId),
      retiredAt: timestamp,
      replacementTaskId: incomingTaskId,
      actor
    });
  } else if (newIdentity && currentTracked && currentTerminal) {
    archiveCurrentTask(next, previousTask, {
      retireStatus: normalizeTaskStatus(previousTask.status, "completed"),
      retireReason: previousTask.completion_reason || "replaced by a newer task after settlement",
      retiredAt: previousTask.finished_at || timestamp,
      replacementTaskId: incomingTaskId,
      actor
    });
  }

  const nextTask = newIdentity ? defaultTaskState() : { ...previousTask };
  const previousStickyOwner = normalizeStickyOwner(previousTask.sticky_owner, "");

  nextTask.current_task = incomingTitle;
  nextTask.task_id = incomingTaskId;

  const previousStatus = normalizeTaskStatus(previousTask.status, "idle");
  const statusFallback = newIdentity ? "idle" : previousStatus;
  let nextStatus = patch.status ? normalizeTaskStatus(patch.status, statusFallback) : statusFallback;

  if (!nextTask.current_task && nextStatus !== "idle") {
    nextStatus = "idle";
  }

  if (nextTask.current_task && nextStatus === "idle") {
    nextStatus = newIdentity ? "active" : previousStatus === "idle" ? "active" : previousStatus;
  }

  if (patch.class) {
    nextTask.class = patch.class;
  }
  if (patch.risk) {
    nextTask.risk = patch.risk;
  }
  if (patch.delivery_mode) {
    nextTask.delivery_mode = patch.delivery_mode;
  }
  if (patch.route_rationale !== undefined) {
    nextTask.route_rationale = patch.route_rationale;
  }
  if (patch.routing_overrides !== undefined) {
    nextTask.routing_overrides = patch.routing_overrides;
  }
  if (patch.enabled_roles !== undefined) {
    nextTask.enabled_roles = patch.enabled_roles;
  }
  if (patch.enabled_modules !== undefined) {
    nextTask.enabled_modules = patch.enabled_modules;
  }
  if (patch.qc_policy !== undefined) {
    nextTask.qc_policy = patch.qc_policy;
  }
  if (patch.submit_policy !== undefined) {
    nextTask.submit_policy = patch.submit_policy;
  }
  if (patch.validation_profile_status !== undefined) {
    nextTask.validation_profile_status = patch.validation_profile_status;
  }
  if (patch.open_questions !== undefined) {
    nextTask.open_questions = patch.open_questions;
  }
  if (patch.checkpoint !== undefined) {
    nextTask.checkpoint = patch.checkpoint || "none";
  }
  if (patch.next_step !== undefined) {
    nextTask.next_step = patch.next_step;
  }
  if (patch.next_owner !== undefined) {
    nextTask.next_owner = patch.next_owner;
  }
  const stickyOwner = inferStickyOwner({ patch, previousTask, newIdentity });
  nextTask.sticky_owner = stickyOwner;
  nextTask.sticky_reason = patch.sticky_reason || previousTask.sticky_reason || defaultStickyReason(stickyOwner);
  nextTask.sticky_since =
    stickyOwner && stickyOwner !== previousStickyOwner ? timestamp : previousTask.sticky_since || (stickyOwner ? timestamp : null);
  if (patch.blocked_reason !== undefined) {
    nextTask.blocked_reason = patch.blocked_reason;
  }
  if (patch.completion_reason !== undefined) {
    nextTask.completion_reason = patch.completion_reason;
  }
  if (patch.implementation_brief_path !== undefined) {
    nextTask.implementation_brief_path = patch.implementation_brief_path;
  }
  if (patch.progress_path !== undefined) {
    nextTask.progress_path = patch.progress_path;
  }
  if (!nextTask.progress_path) {
    nextTask.progress_path = defaultTaskProgressPath(projectDir, nextTask.task_id, nextTask.delivery_mode);
  }
  nextTask.interrupted_at = null;
  nextTask.waiting_on = deriveWaitingOn({ patch, previousTask, nextStatus });

  if (nextStatus !== "blocked" && patch.blocked_reason === undefined) {
    nextTask.blocked_reason = "";
  }

  if (!isTerminalTaskStatus(nextStatus) && patch.completion_reason === undefined) {
    nextTask.completion_reason = "";
  }

  if (nextStatus === "idle") {
    next.task = defaultTaskState();
    return { state: next, changed: JSON.stringify(state.task) !== JSON.stringify(next.task) };
  }

  if (!nextTask.created_at) {
    nextTask.created_at = timestamp;
  }

  if ((nextStatus === "active" || nextStatus === "handoff" || nextStatus === "blocked" || nextStatus === "waiting_user" || nextStatus === "paused") && !nextTask.started_at) {
    nextTask.started_at = timestamp;
  }

  if (nextStatus === "paused") {
    nextTask.paused_at = timestamp;
  } else if (previousStatus === "paused") {
    nextTask.paused_at = null;
  }

  if (isTerminalTaskStatus(nextStatus)) {
    nextTask.finished_at = timestamp;
    nextTask.paused_at = null;
  } else {
    nextTask.finished_at = null;
  }

  const briefChanged = patch.implementation_brief_path && patch.implementation_brief_path !== previousTask.implementation_brief_path;
  const ownerChanged = patch.next_owner && patch.next_owner !== previousTask.next_owner;

  nextTask.status = nextStatus;
  nextTask.updated_at = timestamp;
  nextTask.last_event = inferLastEvent({
    explicitEvent,
    action: "set",
    previousStatus,
    nextStatus,
    isNewTask: newIdentity,
    briefChanged,
    ownerChanged
  });
  nextTask.last_actor = actor;
  next.task = nextTask;

  return { state: next, changed: JSON.stringify(state.task) !== JSON.stringify(nextTask) };
}

function defaultRetireReason(status, replacementTaskId) {
  if (status === "paused") {
    return replacementTaskId ? `switched to ${replacementTaskId}` : "switched to another task";
  }
  if (status === "completed") {
    return "settled before switching tasks";
  }
  return replacementTaskId ? `superseded by ${replacementTaskId}` : "superseded";
}

function applyClearTask({ state, timestamp, actor }) {
  const next = defaultTaskContext();
  next.collaboration = state.collaboration;
  next.updated_at = timestamp;
  next.recent_tasks = Array.isArray(state.recent_tasks) ? [...state.recent_tasks] : [];
  const currentTask = state.task || defaultTaskState();
  if (hasTrackedTask(currentTask)) {
    const retireStatus = normalizeRetireStatus(currentTask.status, isTerminalTaskStatus(currentTask.status) ? currentTask.status : "cancelled");
    archiveCurrentTask(next, currentTask, {
      retireStatus,
      retireReason:
        currentTask.completion_reason ||
        currentTask.blocked_reason ||
        (retireStatus === "completed" ? "cleared after settlement" : "cleared from hot task slot"),
      retiredAt: currentTask.finished_at || timestamp,
      actor
    });
  }
  next.task.last_event = "cleared";
  next.task.last_actor = actor;
  return { state: next, changed: JSON.stringify(state.task) !== JSON.stringify(next.task) };
}

function applyRecordInterruption({ state, timestamp }) {
  const next = defaultTaskContext();
  next.collaboration = state.collaboration;
  next.updated_at = state.updated_at;
  next.recent_tasks = Array.isArray(state.recent_tasks) ? [...state.recent_tasks] : [];
  next.task = { ...(state.task || defaultTaskState()) };

  if (!hasTrackedTask(next.task) || isTerminalTaskStatus(next.task.status) || !isInterruptibleTaskStatus(next.task.status)) {
    return { state, changed: false };
  }

  next.updated_at = timestamp;
  next.task.updated_at = timestamp;
  next.task.interrupted_at = timestamp;
  next.task.last_event = "session-stop";
  next.task.last_actor = "runtime-hook";

  return { state: next, changed: true };
}

function normalizeResumeStatus(value) {
  const normalized = normalizeTaskStatus(value, "");
  if (!normalized) {
    return {
      ok: true,
      status: "active"
    };
  }

  if (["active", "handoff", "blocked", "waiting_user"].includes(normalized)) {
    return {
      ok: true,
      status: normalized
    };
  }

  return {
    ok: false,
    error: {
      code: "invalid-resume-status",
      message: "resume-task status must be active|handoff|blocked|waiting_user when provided"
    }
  };
}

function applyResumeTask({ projectDir, state, timestamp, actor, taskId, explicitStatus, options = {} }) {
  const targetTaskId = normalizeText(taskId);
  if (!targetTaskId) {
    return {
      error: {
        code: "missing-task-id",
        message: "resume-task requires task_id"
      }
    };
  }

  const resumeStatus = normalizeResumeStatus(explicitStatus);
  if (!resumeStatus.ok) {
    return {
      error: resumeStatus.error
    };
  }

  const next = defaultTaskContext();
  next.collaboration = state.collaboration;
  next.updated_at = timestamp;
  next.recent_tasks = Array.isArray(state.recent_tasks) ? [...state.recent_tasks] : [];

  const currentTask = state.task || defaultTaskState();
  const currentTracked = hasTrackedTask(currentTask);
  if (currentTracked && !isTerminalTaskStatus(currentTask.status)) {
    const retireStatus = requestedRetireStatus(options.retire_current_as, "paused");
    const retireReason = normalizeText(options.retire_reason);

    if (!retireStatus) {
      return {
        error: {
          code: "invalid-retire-status",
          message: "retire_current_as must be paused|completed|cancelled when provided",
          current_task: summarizeTask(currentTask)
        }
      };
    }
  }

  const recentTasks = Array.isArray(state.recent_tasks) ? [...state.recent_tasks] : [];
  const targetIndex = recentTasks.findIndex((item) => normalizeText(item.task_id) === targetTaskId);
  if (targetIndex < 0) {
    return {
      error: {
        code: "task-not-found",
        message: `no parked task found for task_id=${targetTaskId}`
      }
    };
  }

  const target = recentTasks[targetIndex];
  if (normalizeTaskStatus(target.status, "paused") !== "paused") {
    return {
      error: {
        code: "task-not-resumable",
        message: `task_id=${targetTaskId} is not parked as paused`,
        task: summarizeTask(target)
      }
    };
  }

  next.recent_tasks = recentTasks.filter((_, index) => index !== targetIndex);

  if (currentTracked && !isTerminalTaskStatus(currentTask.status)) {
    archiveCurrentTask(next, currentTask, {
      retireStatus: normalizeRetireStatus(options.retire_current_as, "paused"),
      retireReason: normalizeText(options.retire_reason) || defaultRetireReason(normalizeRetireStatus(options.retire_current_as, "paused"), targetTaskId),
      retiredAt: timestamp,
      replacementTaskId: targetTaskId,
      actor
    });
  } else if (currentTracked && isTerminalTaskStatus(currentTask.status)) {
    archiveCurrentTask(next, currentTask, {
      retireStatus: normalizeTaskStatus(currentTask.status, "completed"),
      retireReason: currentTask.completion_reason || "replaced while already settled",
      retiredAt: currentTask.finished_at || timestamp,
      replacementTaskId: targetTaskId,
      actor
    });
  }

  next.task = {
    ...defaultTaskState(),
    ...target,
    status: resumeStatus.status,
    updated_at: timestamp,
    paused_at: null,
    interrupted_at: null,
    finished_at: null,
    completion_reason: "",
    last_event: "resume",
    last_actor: actor
  };
  next.task.sticky_owner = normalizeStickyOwner(target.sticky_owner, "Aide") || "Aide";
  next.task.sticky_reason = normalizeText(target.sticky_reason) || defaultStickyReason(next.task.sticky_owner);
  next.task.sticky_since = target.sticky_since || timestamp;
  if (!next.task.progress_path) {
    next.task.progress_path = defaultTaskProgressPath(projectDir, next.task.task_id, next.task.delivery_mode);
  }

  if (!next.task.started_at) {
    next.task.started_at = timestamp;
  }

  next.task.waiting_on = deriveWaitingOn({
    patch: { waiting_on: undefined },
    previousTask: target,
    nextStatus: next.task.status
  });

  if (next.task.status !== "blocked") {
    next.task.blocked_reason = "";
  }

  return { state: next, changed: true };
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "context/task-state.mjs",
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

    const action = inferAction(input);
    const timestamp = new Date().toISOString();
    const actor = normalizeText(input.actor || input.source_role || input.hook_event_name || "main");
    const state = readTaskContext(projectDir);
    let result = { state, changed: false };

    if (action === "set") {
      result = applySetTask({
        projectDir,
        state,
        patch: normalizePatch(projectDir, input.task),
        timestamp,
        actor,
        explicitEvent: input.event
      });
    } else if (action === "clear") {
      result = applyClearTask({ state, timestamp, actor });
    } else if (action === "record-interruption") {
      result = applyRecordInterruption({ state, timestamp });
    } else if (action === "resume-task") {
      result = applyResumeTask({
        projectDir,
        state,
        timestamp,
        actor,
        taskId: input.task_id || input.taskId,
        explicitStatus: input.status,
        options: {
          retire_current_as: input.retire_current_as,
          retire_reason: input.retire_reason
        }
      });
    }

    if (result.error) {
      process.stderr.write(`${result.error.code}: ${result.error.message}\n`);
      process.stdout.write(`${JSON.stringify({ ok: false, action, ...result.error })}\n`);
      logger.finalize({
        status: "error",
        metadata: {
          action,
          errorCode: result.error.code
        }
      });
      process.exit(2);
    }

    if (result.changed) {
      writeTaskContext(projectDir, result.state);
    }

    const currentTask = result.state.task || defaultTaskState();
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        action,
        changed: result.changed,
        task: {
          current_task: currentTask.current_task,
          task_id: currentTask.task_id,
          status: currentTask.status,
          checkpoint: currentTask.checkpoint,
          next_step: currentTask.next_step,
          next_owner: currentTask.next_owner,
          sticky_owner: currentTask.sticky_owner,
          waiting_on: currentTask.waiting_on,
          interrupted_at: currentTask.interrupted_at,
          finished_at: currentTask.finished_at
        },
        recent_tasks: Array.isArray(result.state.recent_tasks)
          ? result.state.recent_tasks.map((item) => summarizeTask(item))
          : []
      })}\n`
    );

    logger.finalize({
      status: "ok",
      metadata: {
        action,
        changed: result.changed,
        status: currentTask.status
      }
    });
  } catch (error) {
    process.stderr.write(`context/task-state error: ${error instanceof Error ? error.message : String(error)}\n`);
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
