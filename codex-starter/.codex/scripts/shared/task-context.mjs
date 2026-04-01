import fs from "node:fs";
import path from "node:path";

import { ensureDir } from "./logging.mjs";
import { absolutizeProjectPath } from "./project-context.mjs";

const TASK_STATUS_VALUES = [
  "idle",
  "active",
  "handoff",
  "blocked",
  "waiting_user",
  "paused",
  "completed",
  "cancelled"
];

const WAITING_ON_VALUES = ["none", "user", "repo", "env", "external", "review", "unknown"];
const STICKY_OWNER_VALUES = ["", "Aide", "technical_manager", "product_manager", "product_assistant", "architect"];

const TERMINAL_TASK_STATUSES = new Set(["completed", "cancelled"]);
const INTERRUPTIBLE_TASK_STATUSES = new Set(["active", "handoff", "blocked"]);
const RECENT_TASK_LIMIT = 8;

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeTaskStatus(value, fallback = "idle") {
  const normalized = normalizeText(value).toLowerCase();
  return TASK_STATUS_VALUES.includes(normalized) ? normalized : fallback;
}

function normalizeWaitingOn(value, fallback = "none") {
  const normalized = normalizeText(value).toLowerCase();
  return WAITING_ON_VALUES.includes(normalized) ? normalized : fallback;
}

function normalizeStickyOwner(value, fallback = "") {
  const normalized = normalizeText(value);
  return STICKY_OWNER_VALUES.includes(normalized) ? normalized : fallback;
}

function normalizeTimestamp(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeRuntimePath(projectDir, value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  if (!projectDir) {
    return normalized;
  }

  return absolutizeProjectPath(projectDir, normalized);
}

function slugifyTaskId(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "";
}

function defaultTaskProgressPath(projectDir, taskId, deliveryMode) {
  if (normalizeText(deliveryMode) !== "long-running") {
    return "";
  }

  const normalizedTaskId = slugifyTaskId(taskId);
  if (!normalizedTaskId) {
    return "";
  }

  return projectDir
    ? path.join(projectDir, ".codex", "progress", "active", normalizedTaskId, "current.md")
    : path.join(".codex", "progress", "active", normalizedTaskId, "current.md");
}

function defaultTaskState() {
  return {
    current_task: "",
    task_id: "",
    status: "idle",
    class: "unknown",
    risk: "unknown",
    delivery_mode: "lightweight",
    route_rationale: "",
    routing_overrides: [],
    enabled_roles: ["Aide", "main agent"],
    enabled_modules: ["intake triage", "direct answer or routed delivery"],
    qc_policy: "disabled",
    submit_policy: "enabled",
    validation_profile_status: "not-set",
    open_questions: [],
    checkpoint: "none",
    next_step: "",
    next_owner: "",
    sticky_owner: "",
    sticky_reason: "",
    sticky_since: null,
    waiting_on: "none",
    blocked_reason: "",
    completion_reason: "",
    implementation_brief_path: "",
    progress_path: "",
    created_at: null,
    started_at: null,
    updated_at: null,
    paused_at: null,
    interrupted_at: null,
    finished_at: null,
    last_event: "none",
    last_actor: ""
  };
}

function defaultRecentTask() {
  return {
    task_id: "",
    current_task: "",
    status: "cancelled",
    class: "unknown",
    delivery_mode: "lightweight",
    checkpoint: "none",
    next_step: "",
    next_owner: "",
    sticky_owner: "",
    sticky_reason: "",
    sticky_since: null,
    waiting_on: "none",
    blocked_reason: "",
    completion_reason: "",
    implementation_brief_path: "",
    progress_path: "",
    created_at: null,
    started_at: null,
    updated_at: null,
    paused_at: null,
    interrupted_at: null,
    finished_at: null,
    retired_at: null,
    retire_reason: "",
    replacement_task_id: "",
    last_event: "none",
    last_actor: ""
  };
}

function defaultTaskContext() {
  return {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: false
    },
    task: defaultTaskState(),
    recent_tasks: []
  };
}

function normalizeTask(task = {}, projectDir = "") {
  const defaults = defaultTaskState();

  return {
    ...defaults,
    current_task: normalizeText(task.current_task),
    task_id: normalizeText(task.task_id),
    status: normalizeTaskStatus(task.status, defaults.status),
    class: normalizeText(task.class) || defaults.class,
    risk: normalizeText(task.risk) || defaults.risk,
    delivery_mode: normalizeText(task.delivery_mode) || defaults.delivery_mode,
    route_rationale: normalizeText(task.route_rationale),
    routing_overrides: normalizeStringList(task.routing_overrides),
    enabled_roles: normalizeStringList(task.enabled_roles).length > 0 ? normalizeStringList(task.enabled_roles) : defaults.enabled_roles,
    enabled_modules:
      normalizeStringList(task.enabled_modules).length > 0 ? normalizeStringList(task.enabled_modules) : defaults.enabled_modules,
    qc_policy: normalizeText(task.qc_policy) || defaults.qc_policy,
    submit_policy: normalizeText(task.submit_policy) || defaults.submit_policy,
    validation_profile_status: normalizeText(task.validation_profile_status) || defaults.validation_profile_status,
    open_questions: normalizeStringList(task.open_questions),
    checkpoint: normalizeText(task.checkpoint) || defaults.checkpoint,
    next_step: normalizeText(task.next_step),
    next_owner: normalizeText(task.next_owner),
    sticky_owner: normalizeStickyOwner(task.sticky_owner, defaults.sticky_owner),
    sticky_reason: normalizeText(task.sticky_reason),
    sticky_since: normalizeTimestamp(task.sticky_since),
    waiting_on: normalizeWaitingOn(task.waiting_on, defaults.waiting_on),
    blocked_reason: normalizeText(task.blocked_reason),
    completion_reason: normalizeText(task.completion_reason),
    implementation_brief_path: normalizeRuntimePath(projectDir, task.implementation_brief_path),
    progress_path: normalizeRuntimePath(projectDir, task.progress_path),
    created_at: normalizeTimestamp(task.created_at),
    started_at: normalizeTimestamp(task.started_at),
    updated_at: normalizeTimestamp(task.updated_at),
    paused_at: normalizeTimestamp(task.paused_at),
    interrupted_at: normalizeTimestamp(task.interrupted_at),
    finished_at: normalizeTimestamp(task.finished_at),
    last_event: normalizeText(task.last_event) || defaults.last_event,
    last_actor: normalizeText(task.last_actor)
  };
}

function normalizeRecentTask(task = {}, projectDir = "") {
  const defaults = defaultRecentTask();

  return {
    ...defaults,
    task_id: normalizeText(task.task_id),
    current_task: normalizeText(task.current_task),
    status: normalizeTaskStatus(task.status, defaults.status),
    class: normalizeText(task.class) || defaults.class,
    delivery_mode: normalizeText(task.delivery_mode) || defaults.delivery_mode,
    checkpoint: normalizeText(task.checkpoint) || defaults.checkpoint,
    next_step: normalizeText(task.next_step),
    next_owner: normalizeText(task.next_owner),
    sticky_owner: normalizeStickyOwner(task.sticky_owner, defaults.sticky_owner),
    sticky_reason: normalizeText(task.sticky_reason),
    sticky_since: normalizeTimestamp(task.sticky_since),
    waiting_on: normalizeWaitingOn(task.waiting_on, defaults.waiting_on),
    blocked_reason: normalizeText(task.blocked_reason),
    completion_reason: normalizeText(task.completion_reason),
    implementation_brief_path: normalizeRuntimePath(projectDir, task.implementation_brief_path),
    progress_path: normalizeRuntimePath(projectDir, task.progress_path),
    created_at: normalizeTimestamp(task.created_at),
    started_at: normalizeTimestamp(task.started_at),
    updated_at: normalizeTimestamp(task.updated_at),
    paused_at: normalizeTimestamp(task.paused_at),
    interrupted_at: normalizeTimestamp(task.interrupted_at),
    finished_at: normalizeTimestamp(task.finished_at),
    retired_at: normalizeTimestamp(task.retired_at),
    retire_reason: normalizeText(task.retire_reason),
    replacement_task_id: normalizeText(task.replacement_task_id),
    last_event: normalizeText(task.last_event) || defaults.last_event,
    last_actor: normalizeText(task.last_actor)
  };
}

function normalizeCollaboration(collaboration = {}) {
  const defaults = defaultTaskContext().collaboration;
  return {
    preferred_address: normalizeText(collaboration.preferred_address) || defaults.preferred_address,
    greeting_style: normalizeText(collaboration.greeting_style) || defaults.greeting_style,
    first_startup_greeting_completed: Boolean(collaboration.first_startup_greeting_completed)
  };
}

function normalizeTaskContext(value = {}, projectDir = "") {
  const defaults = defaultTaskContext();
  return {
    version: Number.isFinite(value?.version) ? value.version : defaults.version,
    updated_at: normalizeTimestamp(value?.updated_at),
    collaboration: normalizeCollaboration(value?.collaboration),
    task: normalizeTask(value?.task, projectDir),
    recent_tasks: Array.isArray(value?.recent_tasks)
      ? value.recent_tasks.map((item) => normalizeRecentTask(item, projectDir)).slice(0, RECENT_TASK_LIMIT)
      : []
  };
}

function taskContextPath(projectDir) {
  return path.join(projectDir, ".codex", "state", "task-context.json");
}

function readTaskContext(projectDir) {
  const filePath = taskContextPath(projectDir);
  if (!fs.existsSync(filePath)) {
    return defaultTaskContext();
  }

  try {
    return normalizeTaskContext(JSON.parse(fs.readFileSync(filePath, "utf8")), projectDir);
  } catch {
    return defaultTaskContext();
  }
}

function writeTaskContext(projectDir, state) {
  const filePath = taskContextPath(projectDir);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(normalizeTaskContext(state, projectDir), null, 2)}\n`, "utf8");
}

function hasTrackedTask(task = {}) {
  return Boolean(normalizeText(task.current_task));
}

function isTerminalTaskStatus(status) {
  return TERMINAL_TASK_STATUSES.has(normalizeTaskStatus(status));
}

function isInterruptibleTaskStatus(status) {
  return INTERRUPTIBLE_TASK_STATUSES.has(normalizeTaskStatus(status));
}

export {
  RECENT_TASK_LIMIT,
  TASK_STATUS_VALUES,
  WAITING_ON_VALUES,
  STICKY_OWNER_VALUES,
  defaultTaskContext,
  defaultTaskProgressPath,
  defaultRecentTask,
  defaultTaskState,
  hasTrackedTask,
  isInterruptibleTaskStatus,
  isTerminalTaskStatus,
  normalizeRecentTask,
  normalizeStickyOwner,
  normalizeTask,
  normalizeTaskContext,
  normalizeTaskStatus,
  normalizeWaitingOn,
  readTaskContext,
  slugifyTaskId,
  taskContextPath,
  writeTaskContext
};
