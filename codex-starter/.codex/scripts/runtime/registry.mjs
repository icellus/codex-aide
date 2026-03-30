import path from "node:path";

import { loadProjectProfileState, loadTaskRegistry, saveTaskRegistry } from "./store.mjs";
import {
  currentGitBranch,
  findProgressFile,
  parseProgressTasks,
  pathContains,
  resolveWorkflowPath
} from "./progress.mjs";
import { normalizeText } from "./structured.mjs";

function slugifyTaskValue(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task";
}

function createTaskMatchKey(entry = {}) {
  const titleKey = slugifyTaskValue(entry.title || entry.task || entry.currentTask || "untitled-task");
  const branchKey = normalizeText(entry.branch).toLowerCase();
  const worktreeKey = normalizeText(entry.worktree).toLowerCase();
  return `task:${titleKey}|branch:${branchKey || "none"}|worktree:${worktreeKey || "none"}`;
}

function createTaskId(matchKey, sequence) {
  const base = slugifyTaskValue(matchKey.replace(/^[^:]+:/, ""));
  return `${base}-${sequence}`;
}

function normalizeTaskStatus(value, fallback = "active") {
  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === "done" || normalized === "completed" || normalized === "complete") {
    return "done";
  }

  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (normalized === "parked") {
    return "parked";
  }

  if (normalized === "queued" || normalized === "not-started") {
    return "queued";
  }

  if (normalized === "active" || normalized === "in-progress" || normalized === "in progress") {
    return "active";
  }

  if (normalized === "idle") {
    return "done";
  }

  return fallback;
}

function isOpenTaskStatus(status) {
  return status === "active" || status === "parked" || status === "blocked" || status === "queued";
}

function hasUnsettledStatus(task = {}) {
  return isOpenTaskStatus(normalizeTaskStatus(task.status, "active"));
}

function compareTaskTimestamps(left, right) {
  const leftTime = new Date(left?.updatedAt || left?.lastSeenAt || left?.createdAt || 0).getTime();
  const rightTime = new Date(right?.updatedAt || right?.lastSeenAt || right?.createdAt || 0).getTime();
  return rightTime - leftTime;
}

function nextTaskSequence(registry, matchKey) {
  return registry.tasks.filter((item) => item.matchKey === matchKey).length + 1;
}

function findLatestTaskIndex(registry, matchKey, preferOpen) {
  let bestIndex = -1;
  let bestTask = null;

  registry.tasks.forEach((task, index) => {
    if (task.matchKey !== matchKey) {
      return;
    }

    if (preferOpen && !hasUnsettledStatus(task)) {
      return;
    }

    if (!bestTask || compareTaskTimestamps(task, bestTask) < 0) {
      bestTask = task;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function writeTaskField(target, key, value) {
  if (value === undefined) {
    return;
  }

  if (typeof value === "string") {
    target[key] = normalizeText(value) || null;
    return;
  }

  target[key] = value ?? null;
}

function sortAndTrimRegistry(registry) {
  registry.tasks.sort(compareTaskTimestamps);
  registry.tasks = registry.tasks.slice(0, 200);
}

export function upsertTaskRegistryTask(registry, entry = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const title = normalizeText(entry.title || entry.task || entry.currentTask || "") || "Untitled task";
  const matchKey = normalizeText(entry.matchKey) || createTaskMatchKey({ ...entry, title });
  const status = normalizeTaskStatus(entry.status, "active");

  let index = -1;

  if (entry.id) {
    index = registry.tasks.findIndex((task) => task.id === entry.id);
  }

  if (index < 0 && options.preferCurrentTaskId && registry.currentTaskId) {
    index = registry.tasks.findIndex((task) => task.id === registry.currentTaskId);
  }

  if (index < 0 && matchKey) {
    index = findLatestTaskIndex(registry, matchKey, true);
  }

  if (index < 0 && matchKey && options.allowSettledUpdate) {
    index = findLatestTaskIndex(registry, matchKey, false);
  }

  const existing =
    index >= 0
      ? registry.tasks[index]
      : {
          id: createTaskId(matchKey, nextTaskSequence(registry, matchKey)),
          matchKey,
          title,
          status,
          createdAt: entry.createdAt || now,
          updatedAt: now,
          startedAt: isOpenTaskStatus(status) ? entry.startedAt || now : null,
          completedAt: status === "done" || status === "cancelled" ? entry.completedAt || now : null
        };

  const next = {
    ...existing,
    title,
    matchKey,
    status,
    updatedAt: now,
    lastSeenAt: entry.lastSeenAt || now
  };

  if (!next.createdAt) {
    next.createdAt = entry.createdAt || now;
  }

  if (isOpenTaskStatus(status)) {
    next.startedAt = next.startedAt || entry.startedAt || now;
    next.completedAt = null;
  }

  if (status === "done" || status === "cancelled") {
    next.completedAt = entry.completedAt || next.completedAt || now;
  }

  writeTaskField(next, "taskClass", entry.taskClass);
  writeTaskField(next, "deliveryMode", entry.deliveryMode);
  writeTaskField(next, "risk", entry.risk);
  writeTaskField(next, "routeRationale", entry.routeRationale);
  writeTaskField(next, "planPath", entry.planPath);
  writeTaskField(next, "summaryPath", entry.summaryPath);
  writeTaskField(next, "branch", entry.branch);
  writeTaskField(next, "worktree", entry.worktree);
  writeTaskField(next, "checkpoint", entry.checkpoint);
  writeTaskField(next, "nextStep", entry.nextStep);
  writeTaskField(next, "reason", entry.reason);
  writeTaskField(next, "owner", entry.owner);
  writeTaskField(next, "summary", entry.summary);
  writeTaskField(next, "validation", entry.validation);
  writeTaskField(next, "source", entry.source || existing.source || null);

  if (index >= 0) {
    registry.tasks[index] = next;
  } else {
    registry.tasks.push(next);
  }

  if (options.setCurrent && hasUnsettledStatus(next)) {
    registry.currentTaskId = next.id;
  }

  if ((status === "done" || status === "cancelled") && registry.currentTaskId === next.id) {
    registry.currentTaskId = null;
  }

  sortAndTrimRegistry(registry);

  return next;
}

function parkTaskIfNeeded(registry, taskId, reason, now) {
  if (!taskId) {
    return null;
  }

  const index = registry.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) {
    return null;
  }

  const task = registry.tasks[index];
  if (!hasUnsettledStatus(task) || normalizeTaskStatus(task.status, "active") !== "active") {
    return task;
  }

  registry.tasks[index] = {
    ...task,
    status: "parked",
    reason: task.reason || reason,
    updatedAt: now,
    lastSeenAt: now
  };

  sortAndTrimRegistry(registry);
  return registry.tasks[index];
}

export function getCurrentTaskRecord(registry) {
  if (!registry?.currentTaskId) {
    return null;
  }

  return registry.tasks.find((task) => task.id === registry.currentTaskId) || null;
}

export function listTaskRegistryTasks(registry, predicate = null) {
  const tasks = Array.isArray(registry?.tasks) ? [...registry.tasks] : [];
  const filtered = predicate ? tasks.filter(predicate) : tasks;
  return filtered.sort(compareTaskTimestamps);
}

function normalizeTaskId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function resolveActiveTask(registry, input = {}, projectDir = process.cwd()) {
  const tasks = listTaskRegistryTasks(registry, (task) => hasUnsettledStatus(task));
  const explicitTaskId = [input.task_id, input.taskId, input.current_task_id, input.currentTaskId]
    .map((value) => normalizeTaskId(value))
    .find(Boolean);

  if (explicitTaskId) {
    const explicitMatch = (Array.isArray(registry?.tasks) ? registry.tasks : []).find((task) => task.id === explicitTaskId);
    if (explicitMatch) {
      return explicitMatch;
    }
  }

  const currentTask = getCurrentTaskRecord(registry);
  if (currentTask && hasUnsettledStatus(currentTask)) {
    return currentTask;
  }

  const cwd = input.cwd ? path.resolve(String(input.cwd)) : null;
  if (cwd) {
    const worktreeMatches = tasks.filter((task) => {
      const worktreePath = resolveWorkflowPath(projectDir, task.worktree);
      return worktreePath ? pathContains(worktreePath, cwd) : false;
    });

    if (worktreeMatches.length === 1) {
      return worktreeMatches[0];
    }

    const branch = currentGitBranch(cwd);
    if (branch) {
      const branchMatches = tasks.filter((task) => task.branch === branch);
      if (branchMatches.length === 1) {
        return branchMatches[0];
      }
    }
  }

  return tasks.length === 1 ? tasks[0] : null;
}

export function syncTaskRegistry(projectDir, input = {}) {
  const now = input.now || new Date().toISOString();
  const persist = input.persist !== false;
  const profile = input.profile || loadProjectProfileState(projectDir);
  const runtimeState = input.runtimeState || null;
  const registry = input.registry || loadTaskRegistry(projectDir);
  const progressPath =
    input.progressPath === undefined ? findProgressFile(projectDir) : input.progressPath;
  const progressTasks = input.progressTasks || parseProgressTasks(progressPath);

  const previousCurrentId = registry.currentTaskId || null;
  let nextCurrentId = null;
  let currentMatchKey = null;

  if (profile.task) {
    const profileStatus = normalizeTaskStatus(profile.taskStatus, "active");
    const currentTask = upsertTaskRegistryTask(
      registry,
      {
        title: profile.task,
        status: profileStatus,
        taskClass: profile.taskClass,
        deliveryMode: profile.deliveryMode,
        risk: profile.riskLevel,
        routeRationale: profile.routeRationale,
        source: "task-context"
      },
      {
        now,
        allowSettledUpdate: profileStatus === "done"
      }
    );

    currentMatchKey = currentTask.matchKey;
    if (hasUnsettledStatus(currentTask)) {
      nextCurrentId = currentTask.id;
    }
  }

  progressTasks.current.forEach((item, index) => {
    const entryMatchKey = createTaskMatchKey(item);
    const shouldBeCurrent =
      currentMatchKey
        ? entryMatchKey === currentMatchKey
        : progressTasks.current.length === 1 && index === 0;
    const normalizedStatus = shouldBeCurrent ? "active" : "parked";
    const task = upsertTaskRegistryTask(
      registry,
      {
        ...item,
        status: normalizedStatus,
        reason: shouldBeCurrent ? undefined : "Tracked in PROGRESS but not selected as the current hot task.",
        source: "progress"
      },
      {
        now
      }
    );

    if (!nextCurrentId && shouldBeCurrent && hasUnsettledStatus(task)) {
      nextCurrentId = task.id;
      currentMatchKey = task.matchKey;
    }
  });

  progressTasks.parked.forEach((item) => {
    upsertTaskRegistryTask(
      registry,
      {
        ...item,
        status: normalizeTaskStatus(item.status, "blocked"),
        source: "progress"
      },
      {
        now
      }
    );
  });

  progressTasks.completed.forEach((item) => {
    upsertTaskRegistryTask(
      registry,
      {
        ...item,
        status: "done",
        source: "progress"
      },
      {
        now,
        allowSettledUpdate: true
      }
    );
  });

  if (Array.isArray(runtimeState?.completedTasks)) {
    runtimeState.completedTasks.forEach((item) => {
      upsertTaskRegistryTask(
        registry,
        {
          id: item.taskId,
          title: item.task,
          planPath: item.planPath,
          deliveryMode: item.deliveryMode,
          summary: item.summary,
          status: "done",
          completedAt: item.completedAt,
          source: "runtime-state"
        },
        {
          now,
          allowSettledUpdate: true
        }
      );
    });
  }

  if (nextCurrentId) {
    const nextCurrentTask = registry.tasks.find((task) => task.id === nextCurrentId);
    if (!nextCurrentTask || !hasUnsettledStatus(nextCurrentTask)) {
      nextCurrentId = null;
    }
  }

  if (previousCurrentId && nextCurrentId && previousCurrentId !== nextCurrentId) {
    parkTaskIfNeeded(registry, previousCurrentId, "Superseded by a newer active task before normal closure.", now);
  } else if (previousCurrentId && !nextCurrentId) {
    parkTaskIfNeeded(registry, previousCurrentId, "Hot task cleared without explicit closure.", now);
  }

  registry.currentTaskId = nextCurrentId;
  registry.updatedAt = now;
  sortAndTrimRegistry(registry);
  if (persist) {
    saveTaskRegistry(projectDir, registry);
  }
  return registry;
}
