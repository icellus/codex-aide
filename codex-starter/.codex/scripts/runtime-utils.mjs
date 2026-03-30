import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ensureDir,
  getProjectContext,
  logRuntimeFileWrite,
  readJsonStdin,
  readJsonStdinEnvelope,
  startRuntimeInvocationLogging
} from "./runtime-core.mjs";
import {
  createEmptyAideGovernancePolicy,
  createEmptyDeliveryPolicy,
  createEmptyGovernanceRegistry,
  createEmptyRepoContext,
  createEmptyState,
  createEmptyTaskContext,
  createEmptyTaskRegistry,
  createEmptyTaskWorkflowState,
  isLongRunningProfile,
  isQcEnabled,
  isSubmitEnabled,
  isTaskSettled,
  loadAideGovernancePolicy,
  loadDeliveryPolicy,
  loadGovernanceRegistry,
  loadProjectProfileState,
  loadRuntimeState,
  loadTaskContext,
  loadTaskRegistry,
  normalizeTaskWorkflowState,
  saveGovernanceRegistry,
  saveRepoContext,
  saveRuntimeState,
  saveTaskContext,
  saveTaskRegistry
} from "./runtime-store.mjs";

export {
  ensureDir,
  getProjectContext,
  logRuntimeFileWrite,
  readJsonStdin,
  readJsonStdinEnvelope,
  startRuntimeInvocationLogging
} from "./runtime-core.mjs";
export {
  createEmptyAideGovernancePolicy,
  createEmptyDeliveryPolicy,
  createEmptyGovernanceRegistry,
  createEmptyRepoContext,
  createEmptyState,
  createEmptyTaskContext,
  createEmptyTaskRegistry,
  createEmptyTaskWorkflowState,
  isLongRunningProfile,
  isQcEnabled,
  isSubmitEnabled,
  isTaskSettled,
  loadAideGovernancePolicy,
  loadDeliveryPolicy,
  loadGovernanceRegistry,
  loadProjectProfileState,
  loadRuntimeState,
  loadTaskContext,
  loadTaskRegistry,
  normalizeTaskWorkflowState,
  saveGovernanceRegistry,
  saveRepoContext,
  saveRuntimeState,
  saveTaskContext,
  saveTaskRegistry
} from "./runtime-store.mjs";

function normalizeArtifactField(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toUpperCase() === "N/A" || /^\[[^\]]+\]$/.test(raw)) {
    return null;
  }
  return raw;
}

function extractPlanPath(block) {
  return normalizeArtifactField(
    block.match(/\*\*Implementation Plan\*\*:\s*`([^`]+)`/)?.[1] ||
      block.match(/- Implementation Plan:\s*`([^`]+)`/)?.[1] ||
      null
  );
}

function extractSummaryPath(block) {
  return normalizeArtifactField(
    block.match(/- Plan Summary:\s*`([^`]+)`/)?.[1] ||
      block.match(/\*\*Plan Summary\*\*:\s*`([^`]+)`/)?.[1] ||
      null
  );
}

function stripHtmlComments(text) {
  return String(text || "").replace(/<!--[\s\S]*?-->/g, "");
}

export function findProgressFile(startDir) {
  let current = path.resolve(startDir || process.cwd());

  for (let i = 0; i < 5; i += 1) {
    const direct = path.join(current, "PROGRESS.md");
    if (fs.existsSync(direct)) {
      return direct;
    }

    const plans = path.join(current, "plans", "PROGRESS.md");
    if (fs.existsSync(plans)) {
      return plans;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

export function parseActivePlans(progressPath) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return [];
  }

  const text = fs.readFileSync(progressPath, "utf8");
  const sectionMatch = text.match(/## (?:Current|Active) Work([\s\S]*?)(?:\n---\s*\n\s*## |\n## |\n##$|$)/);
  if (!sectionMatch) {
    return [];
  }

  return stripHtmlComments(sectionMatch[1])
    .split(/\n(?=### )/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("### "))
    .map((block) => {
      const title = block.match(/^###\s+(.+)$/m)?.[1]?.trim() || "Unknown Plan";
      const planPath = extractPlanPath(block);
      const summaryPath = extractSummaryPath(block);
      const branch = normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null);
      const worktree = normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null);

      return {
        title,
        planPath,
        summaryPath,
        branch,
        worktree
      };
    })
    .filter((item) => item.planPath || item.branch || item.worktree);
}

function extractSectionBody(text, sectionNamePattern) {
  const match = String(text || "").match(
    new RegExp(`## ${sectionNamePattern}([\\s\\S]*?)(?:\\n---\\s*\\n\\s*## |\\n## |\\n##$|$)`)
  );
  return match?.[1] || "";
}

function splitProgressBlocks(sectionBody) {
  return stripHtmlComments(sectionBody)
    .split(/\n(?=### )/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("### "));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBulletField(block, label) {
  return normalizeArtifactField(block.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "m"))?.[1] || null);
}

function extractTitle(block) {
  return normalizeArtifactField(block.match(/^###\s+(.+)$/m)?.[1] || null);
}

function parseCurrentWorkItems(text) {
  return splitProgressBlocks(extractSectionBody(text, "(?:Current|Active) Work"))
    .map((block) => ({
      title: extractTitle(block),
      planPath: extractPlanPath(block),
      summaryPath: extractSummaryPath(block),
      branch: normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null),
      worktree: normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null),
      taskClass: extractBulletField(block, "Task Class"),
      deliveryMode: extractBulletField(block, "Delivery Mode"),
      status: extractBulletField(block, "Status") || "active",
      checkpoint: extractBulletField(block, "Current Checkpoint"),
      nextStep: extractBulletField(block, "Next Step")
    }))
    .filter((item) => item.title || item.planPath || item.branch || item.worktree);
}

function parseParkedWorkItems(text) {
  return splitProgressBlocks(extractSectionBody(text, "(?:Parked or Blocked|Blockers or Exceptions)"))
    .map((block) => ({
      title: extractTitle(block),
      planPath: extractPlanPath(block),
      summaryPath: extractSummaryPath(block),
      branch: normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null),
      worktree: normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null),
      status: extractBulletField(block, "Status") || "blocked",
      checkpoint: extractBulletField(block, "Current Checkpoint") || extractBulletField(block, "Checkpoint"),
      reason: extractBulletField(block, "Reason"),
      owner: extractBulletField(block, "Owner"),
      nextStep: extractBulletField(block, "Suggested Resume Point") || extractBulletField(block, "Unblock Action")
    }))
    .filter((item) => item.title || item.planPath || item.reason || item.nextStep);
}

function parseCompletedWorkItems(text) {
  return splitProgressBlocks(extractSectionBody(text, "(?:Completed|Completed Releases or Milestones)"))
    .map((block) => ({
      title: extractTitle(block),
      planPath: extractPlanPath(block),
      summaryPath: extractSummaryPath(block),
      completedAt: extractBulletField(block, "Completed"),
      summary: extractBulletField(block, "Outcome") || extractBulletField(block, "Summary"),
      validation: extractBulletField(block, "Validation"),
      nextStep: extractBulletField(block, "Follow-up")
    }))
    .filter((item) => item.title || item.planPath || item.summary);
}

export function parseProgressTasks(progressPath) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return {
      current: [],
      parked: [],
      completed: []
    };
  }

  const text = fs.readFileSync(progressPath, "utf8");
  return {
    current: parseCurrentWorkItems(text),
    parked: parseParkedWorkItems(text),
    completed: parseCompletedWorkItems(text)
  };
}

function normalizeComparablePath(value) {
  return path.resolve(String(value || "")).replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
}

function resolveWorkflowPath(projectDir, value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw || raw.toUpperCase() === "N/A") {
    return null;
  }

  if (path.isAbsolute(raw)) {
    return path.resolve(raw);
  }

  return path.resolve(projectDir, raw);
}

function pathContains(parentPath, childPath) {
  if (!parentPath || !childPath) {
    return false;
  }

  const parent = normalizeComparablePath(parentPath);
  const child = normalizeComparablePath(childPath);
  return child === parent || child.startsWith(`${parent}/`);
}

function currentGitBranch(cwd) {
  if (!cwd || !fs.existsSync(cwd)) {
    return null;
  }

  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

export function resolveActivePlan(activePlans, input = {}, projectDir) {
  if (!Array.isArray(activePlans) || activePlans.length === 0) {
    return null;
  }

  const explicitBrief = [input.brief_path, input.briefPath, input.brief]
    .map((value) => String(value || "").trim())
    .find(Boolean);

  if (explicitBrief) {
    const exact = activePlans.filter((item) => item.planPath === explicitBrief);
    if (exact.length === 1) {
      return exact[0];
    }

    const byBase = activePlans.filter(
      (item) => item.planPath && basenameLabel(item.planPath) === basenameLabel(explicitBrief)
    );
    if (byBase.length === 1) {
      return byBase[0];
    }
  }

  const cwd = input.cwd ? path.resolve(String(input.cwd)) : null;
  if (cwd) {
    const worktreeMatches = activePlans.filter((item) => {
      const worktreePath = resolveWorkflowPath(projectDir, item.worktree);
      return worktreePath ? pathContains(worktreePath, cwd) : false;
    });

    if (worktreeMatches.length === 1) {
      return worktreeMatches[0];
    }

    const branch = currentGitBranch(cwd);
    if (branch) {
      const branchMatches = activePlans.filter((item) => item.branch === branch);
      if (branchMatches.length === 1) {
        return branchMatches[0];
      }
    }
  }

  if (activePlans.length === 1) {
    return activePlans[0];
  }

  return null;
}

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
  return (
    registry.tasks.filter((item) => item.matchKey === matchKey).length + 1
  );
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

const GOVERNANCE_LEVEL_ORDER = {
  G1: 1,
  G2: 2,
  G3: 3
};

export function normalizeGovernanceLevel(value, fallback = "G2") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "G1" || normalized === "G2" || normalized === "G3") {
    return normalized;
  }
  return fallback;
}

export function compareGovernanceLevel(left, right) {
  return (
    (GOVERNANCE_LEVEL_ORDER[normalizeGovernanceLevel(right, "G1")] || 0) -
    (GOVERNANCE_LEVEL_ORDER[normalizeGovernanceLevel(left, "G1")] || 0)
  );
}

export function highestGovernanceLevel(values = [], fallback = "G2") {
  const normalized = Array.isArray(values)
    ? values.map((item) => normalizeGovernanceLevel(item, fallback))
    : [];

  if (normalized.length === 0) {
    return fallback;
  }

  return normalized.sort(compareGovernanceLevel)[0];
}

export function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

export function compactText(value, maxLength = 240) {
  const normalized = normalizeText(value).replace(/\n+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function extractStructuredResult(message) {
  const text = String(message || "");

  const previousNonEmptyLine = (source, position) => {
    if (!source) {
      return "";
    }
    const prefix = source.slice(0, Math.max(0, position));
    const lines = prefix.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = String(lines[index] || "").trim();
      if (line) {
        return line;
      }
    }
    return "";
  };

  const isExampleMarkerLine = (line) => {
    const normalized = String(line || "")
      .trim()
      .replace(/^[>*+\-\s]+/, "")
      .trim();
    if (!normalized) {
      return false;
    }

    if (
      /^(example(?:\s+output|\s+result)?|sample(?:\s+output|\s+result)?|for example|e\.g\.|示例(?:输出|结果)?|样例(?:输出|结果)?|例如|参考示例)\s*[:：]?$/i.test(
        normalized
      )
    ) {
      return true;
    }

    return /(?:example output|sample output|示例输出|样例输出|示例结果|样例结果)/i.test(normalized);
  };

  const parseCandidates = (candidates = []) => {
    const parsedCandidates = [];

    for (const candidate of candidates) {
      const block = candidate?.block;
      try {
        const parsedValue = JSON.parse(block);
        if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
          parsedCandidates.push({
            value: parsedValue,
            isExample: Boolean(candidate?.isExample)
          });
        }
      } catch {
        continue;
      }
    }

    if (parsedCandidates.length === 0) {
      return null;
    }

    const nonExample = parsedCandidates.filter((item) => !item.isExample);
    const pool = nonExample.length > 0 ? nonExample : parsedCandidates;
    return pool[pool.length - 1].value;
  };

  const structuredCandidates = [...text.matchAll(/## Structured Result[\s\S]*?```json\s*([\s\S]*?)```/gi)].map(
    (match) => {
      const position = Number.isFinite(match.index) ? match.index : 0;
      return {
        block: match[1],
        isExample: isExampleMarkerLine(previousNonEmptyLine(text, position))
      };
    }
  );
  const structuredParsed = parseCandidates(structuredCandidates);
  if (structuredParsed) {
    return structuredParsed;
  }

  const fallbackCandidates = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((match) => {
    const position = Number.isFinite(match.index) ? match.index : 0;
    return {
      block: match[1],
      isExample: isExampleMarkerLine(previousNonEmptyLine(text, position))
    };
  });
  return parseCandidates(fallbackCandidates);
}

function extractStructuredResultFromRequiredSection(message) {
  const text = String(message || "");
  const sectionMatch = text.match(/(^|\n)\s*##\s*Structured Result\b([\s\S]*?)(?=\n\s*##\s+[^\n]+|\s*$)/i);

  if (!sectionMatch) {
    return {
      hasSection: false,
      structured: null
    };
  }

  const sectionBody = String(sectionMatch[2] || "");
  const candidates = [...sectionBody.matchAll(/```json\s*([\s\S]*?)```/gi)].map((match) => match[1]);

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(candidates[index]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          hasSection: true,
          structured: parsed
        };
      }
    } catch {
      continue;
    }
  }

  return {
    hasSection: true,
    structured: null
  };
}

function normalizeStructuredRole(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  if (raw === "qc_reviewer") {
    return "qc";
  }

  if (raw === "submit_worker") {
    return "submit";
  }

  return raw;
}

function normalizeStructuredBriefPath(structured) {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return "";
  }

  for (const candidate of [structured.brief_path, structured.briefPath, structured.brief]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

export function validateStructuredResultContract(role, message) {
  const normalizedRole = normalizeStructuredRole(role);
  if (normalizedRole !== "coder" && normalizedRole !== "tester") {
    return {
      ok: true,
      code: "",
      reason: "",
      structured: null
    };
  }

  const strictStructured = extractStructuredResultFromRequiredSection(message);

  if (!strictStructured.hasSection) {
    return {
      ok: false,
      code: "missing_structured_result_section",
      reason: `${normalizedRole} handoff missing required "## Structured Result" section.`,
      structured: null
    };
  }

  const structured = strictStructured.structured;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return {
      ok: false,
      code: "invalid_structured_result_json",
      reason: `${normalizedRole} handoff has no valid JSON object in the structured result section.`,
      structured: null
    };
  }

  const structuredRole = normalizeStructuredRole(structured.role);
  if (!structuredRole) {
    return {
      ok: false,
      code: "missing_structured_result_role",
      reason: `${normalizedRole} structured result must include role.`,
      structured
    };
  }

  if (structuredRole !== normalizedRole) {
    return {
      ok: false,
      code: "structured_result_role_mismatch",
      reason: `${normalizedRole} structured result role mismatch: got "${structuredRole}".`,
      structured
    };
  }

  const status = String(structured.status || "").trim().toLowerCase();
  if (status !== "complete" && status !== "blocked") {
    return {
      ok: false,
      code: "invalid_structured_result_status",
      reason: `${normalizedRole} structured result status must be "complete" or "blocked".`,
      structured
    };
  }

  const legacyScopeKeys = ["story_path", "storyPath", "story"];
  const legacyScopeKey = legacyScopeKeys.find((key) => Object.prototype.hasOwnProperty.call(structured, key));
  if (legacyScopeKey) {
    return {
      ok: false,
      code: "legacy_structured_scope_key",
      reason: `${normalizedRole} structured result uses deprecated scope key "${legacyScopeKey}".`,
      structured
    };
  }

  if (structured.needs_qc !== true) {
    return {
      ok: false,
      code: "structured_result_needs_qc_not_true",
      reason: `${normalizedRole} structured result must set needs_qc: true.`,
      structured
    };
  }

  if (status === "complete" && !normalizeStructuredBriefPath(structured)) {
    return {
      ok: false,
      code: "missing_structured_result_brief_path",
      reason: `${normalizedRole} structured result must include a non-empty brief_path to the active Implementation Brief (任务实施说明).`,
      structured
    };
  }

  return {
    ok: true,
    code: "",
    reason: "",
    structured
  };
}

export function detectSubagentStatus(agentType, message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  const explicitStatus = String(structured?.status || "").toLowerCase();

  if (explicitStatus === "complete" || explicitStatus === "blocked" || explicitStatus === "other") {
    return explicitStatus;
  }

  if (/blocked|阻塞|需要帮助|human intervention/i.test(text)) {
    return "blocked";
  }

  if (
    /Implementation Complete|实现完成|tests written|testing complete|测试编写完成|已完成测试|Submit complete|delivery complete|交付完成|推送完成/i.test(text)
  ) {
    return "complete";
  }

  return "other";
}

export function detectQcPass(message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  const verdict = String(structured?.verdict || "").toUpperCase();
  if (verdict === "PASS" || verdict === "PASS WITH WARNINGS") {
    return true;
  }
  if (!/\bQC\b|Overall Verdict:/i.test(text)) {
    return false;
  }
  return /QC 检查通过|QC passed|QC pass|Overall Verdict:\s*PASS(?: WITH WARNINGS)?\b/i.test(text);
}

export function detectQcFail(message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  if (String(structured?.verdict || "").toUpperCase() === "FAIL") {
    return true;
  }
  if (!/\bQC\b|Overall Verdict:/i.test(text)) {
    return false;
  }
  return /QC 检查失败|QC failure|QC failed|QC fail|Overall Verdict:\s*FAIL\b/i.test(text);
}

export function detectQcPhase(message) {
  const structured = extractStructuredResult(message);
  const structuredPhase = String(structured?.phase || "").toLowerCase();
  if (structuredPhase === "tester" || structuredPhase === "coder") {
    return structuredPhase;
  }

  const text = normalizeText(message);
  const match = text.match(/(?:--phase=|phase\s*[:=]\s*|trigger phase\s*[:=]\s*)(tester|coder)/i);
  return match ? match[1].toLowerCase() : null;
}

export function detectTaskCompletionMessage(message) {
  const text = normalizeText(message);
  return /(?:task status:\s*done|final status:\s*done|task complete|task completed|completed the task|任务完成|已完成当前任务)/i.test(text);
}

export function detectFailureCategories(message) {
  const text = normalizeText(message);
  const keywordText = text
    .replace(/"[^"\n]*"/g, " ")
    .replace(/“[^”\n]*”/g, " ")
    .replace(/'[^'\n]*'/g, " ")
    .replace(/`[^`\n]*`/g, " ");
  const categories = new Set();
  const structured = extractStructuredResult(message);

  if (Array.isArray(structured?.categories)) {
    for (const category of structured.categories) {
      const normalized = String(category || "").trim();
      if (normalized) {
        categories.add(normalized);
      }
    }
  }

  if (/TODO|FIXME|placeholder/i.test(keywordText)) {
    categories.add("placeholder");
  }
  if (/假测试|FAKE TEST|fake test/i.test(keywordText)) {
    categories.add("fake-test");
  }
  if (/缺失测试|MISSING TEST/i.test(keywordText)) {
    categories.add("missing-test");
  }
  if (/未实现|NOT IMPLEMENTED|missing implementation/i.test(keywordText)) {
    categories.add("missing-implementation");
  }
  if (/Plan 对齐问题|plan mismatch|plan align|Implementation Plan mismatch/i.test(keywordText)) {
    categories.add("plan-mismatch");
  }
  if (/错误处理|error handling/i.test(keywordText)) {
    categories.add("error-handling");
  }
  if (/shared protocol|交接协议|interface between roles/i.test(keywordText)) {
    categories.add("shared-protocol");
  }
  if (/environment mismatch|connection refused|postgres service|CI missing/i.test(keywordText)) {
    categories.add("environment-mismatch");
  }

  return Array.from(categories);
}

export function suggestedRoutesForCategory(category) {
  switch (category) {
    case "placeholder":
      return [".codex/agents/coder.toml", ".codex/skills/qc/SKILL.md"];
    case "fake-test":
    case "missing-test":
      return [".codex/agents/tester.toml", ".codex/skills/qc/SKILL.md"];
    case "missing-implementation":
    case "plan-mismatch":
    case "error-handling":
      return [".codex/agents/coder.toml", ".codex/skills/qc/SKILL.md"];
    case "shared-protocol":
      return ["AGENTS.md", ".codex/templates/progress/current.md"];
    case "environment-mismatch":
      return [".codex/skills/submit/SKILL.md", "AGENTS.md"];
    default:
      return [".codex/skills/qc/SKILL.md"];
  }
}

export function recommendedActionForCategory(category) {
  switch (category) {
    case "placeholder":
      return "Placeholder comments must be treated as incomplete work and rejected before completion.";
    case "fake-test":
      return "Tests must verify behavior, not merely exercise code paths without meaningful assertions.";
    case "missing-test":
      return "Every requirement needs a real test before the testing phase is considered complete.";
    case "missing-implementation":
      return "Implementation claims must map to real behavior, not partial scaffolding.";
    case "plan-mismatch":
      return "QC should reject work that diverges from the implementation plan or acceptance criteria.";
    case "error-handling":
      return "Error handling must be explicit and verified, especially on edge and failure paths.";
    case "shared-protocol":
      return "When failures come from handoffs between roles, update shared workflow protocols, not only role docs.";
    case "environment-mismatch":
      return "Environment-specific failures should route to CI or deployment guidance before repeated coding retries.";
    default:
      return "Repeated QC failures should be captured as reusable governance guidance.";
  }
}

export function upsertPendingAction(state, action) {
  const index = state.pendingActions.findIndex((item) => item.id === action.id);
  if (index >= 0) {
    state.pendingActions[index] = {
      ...state.pendingActions[index],
      ...action,
      updatedAt: new Date().toISOString()
    };
    return;
  }

  state.pendingActions.push({
    ...action,
    createdAt: action.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function removePendingActions(state, predicate) {
  state.pendingActions = state.pendingActions.filter((item) => !predicate(item));
}

export function upsertGovernanceQueueItem(state, entry) {
  const index = state.governanceQueue.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    state.governanceQueue[index] = {
      ...state.governanceQueue[index],
      ...entry,
      updatedAt: new Date().toISOString()
    };
    return;
  }

  state.governanceQueue.push({
    ...entry,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function trimRuntimeState(state) {
  const failurePatternEntries = Object.entries(state.failurePatterns || {}).sort((left, right) => {
    const leftSeen = new Date(left[1]?.lastSeenAt || left[1]?.firstSeenAt || 0).getTime();
    const rightSeen = new Date(right[1]?.lastSeenAt || right[1]?.firstSeenAt || 0).getTime();
    return rightSeen - leftSeen;
  });

  state.recentSubagentEvents = state.recentSubagentEvents.slice(-15);
  state.pendingActions = state.pendingActions.slice(-12);
  state.governanceQueue = state.governanceQueue.slice(-12);
  state.completedTasks = state.completedTasks.slice(-12);
  state.qualityMetrics.recentQcRuns = state.qualityMetrics.recentQcRuns.slice(-15);
  state.failurePatterns = Object.fromEntries(failurePatternEntries.slice(0, 24));
  state.updatedAt = new Date().toISOString();
}

export function basenameLabel(value) {
  if (!value) {
    return "unknown";
  }
  return path.basename(value.replace(/\\/g, "/"));
}

export function toGovernanceItemId(source, category) {
  const raw = `${basenameLabel(source)}-${category}`.toLowerCase();
  return `governance-item-${raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function summarizeRetryPattern(state, taskId) {
  const sourceTaskId = taskId || "unknown-task";
  const items = Object.values(state.failurePatterns)
    .filter((item) => item.taskId === sourceTaskId)
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  if (items.length === 0) {
    return "None";
  }

  return items.map((item) => `${item.category} x${item.count}`).join(", ");
}

function resolveTaskIdFromProgressChunk(taskRegistry, chunk) {
  if (!taskRegistry || !Array.isArray(taskRegistry.tasks)) {
    return null;
  }

  const title = extractTitle(chunk);
  const branch = normalizeArtifactField(chunk.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null);
  const worktree = normalizeArtifactField(chunk.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null);
  const openTasks = taskRegistry.tasks.filter((task) => hasUnsettledStatus(task));

  if (worktree) {
    const byWorktree = openTasks.filter((task) => normalizeText(task.worktree) === worktree);
    if (byWorktree.length === 1) {
      return byWorktree[0].id;
    }
  }

  if (branch) {
    const byBranch = openTasks.filter((task) => normalizeText(task.branch) === branch);
    if (byBranch.length === 1) {
      return byBranch[0].id;
    }
  }

  if (title) {
    const normalizedTitle = normalizeText(title).toLowerCase();
    const byTitle = openTasks.filter((task) => normalizeText(task.title).toLowerCase() === normalizedTitle);
    if (byTitle.length === 1) {
      return byTitle[0].id;
    }
  }

  return null;
}

function updateQcRetryPatternLine(block, summary) {
  const line = `- QC retry pattern: ${summary}`;

  if (/^- QC retry pattern:.*$/m.test(block)) {
    return block.replace(/^- QC retry pattern:.*$/m, line);
  }

  if (/^- Next step:.*$/m.test(block)) {
    return block.replace(/^- Next step:.*$/m, `${line}\n$&`);
  }

  if (/\*\*Notes\*\*:\s*$/m.test(block)) {
    return block.replace(/\*\*Notes\*\*:\s*$/m, `**Notes**:\n${line}`);
  }

  return `${block.trimEnd()}\n\n**Notes**:\n${line}\n`;
}

function updateCurrentWorkSection(text, activePlans, state, taskRegistry = null) {
  const match = text.match(/(## (?:Current|Active) Work\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## Completed|\n## Completed|$)/);
  if (!match) {
    return text;
  }

  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];
  const segments = body.split(/(<!--[\s\S]*?-->)/g);

  const updatedBody = segments
    .map((segment) => {
      if (segment.startsWith("<!--")) {
        return segment;
      }

      return segment
        .split(/\n(?=### )/g)
        .map((chunk) => {
          if (!chunk.startsWith("### ")) {
            return chunk;
          }

          const taskId = resolveTaskIdFromProgressChunk(taskRegistry, chunk);
          if (!taskId) {
            return chunk;
          }

          const summary = summarizeRetryPattern(state, taskId);
          return updateQcRetryPatternLine(chunk, summary);
        })
        .join("\n");
    })
    .join("");

  return text.replace(match[0], `${prefix}${updatedBody}${suffix}`);
}

function buildGovernanceQueueBlock(entry) {
  const route = Array.isArray(entry.suggestedRoute)
    ? entry.suggestedRoute.join(", ")
    : String(entry.suggestedRoute || "");

  return [
    `### ${entry.id}`,
    `**Source**: \`${entry.source || "unknown"}\``,
    `**Category**: \`${entry.category}\``,
    `**Trigger Count**: ${entry.triggerCount}`,
    `**Suggested Route**: \`${route}\``,
    `**Recommended Action**: ${entry.recommended_action || entry.recommendedAction || ""}`,
    `**Status**: \`${entry.status || "queued"}\``
  ].join("\n");
}

function updateGovernanceQueueSection(text, state) {
  const match = text.match(/(## Governance Queue \(Optional\)\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## |\n## |\s*$)/);
  if (!match) {
    return text;
  }

  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];

  const chunks = body
    .split(/\n(?=### )/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const preamble = [];
  const blockMap = new Map();
  const order = [];

  for (const chunk of chunks) {
    if (!chunk.startsWith("### ")) {
      preamble.push(chunk);
      continue;
    }

    const id = chunk.match(/^###\s+(.+)$/m)?.[1]?.trim();
    if (!id) {
      continue;
    }

    order.push(id);
    blockMap.set(id, chunk);
  }

  for (const entry of state.governanceQueue) {
    const block = buildGovernanceQueueBlock(entry);
    if (!blockMap.has(entry.id)) {
      order.push(entry.id);
    }
    blockMap.set(entry.id, block);
  }

  if (state.governanceQueue.length > 0 && blockMap.has("[governance-item-id]")) {
    blockMap.delete("[governance-item-id]");
  }

  const renderedBlocks = order
    .filter((id, index) => order.indexOf(id) === index)
    .filter((id) => blockMap.has(id))
    .map((id) => blockMap.get(id));

  const parts = [...preamble, ...renderedBlocks].filter(Boolean);
  const bodyText = parts.length > 0 ? `${parts.join("\n\n")}\n\n` : "<!-- No queued governance items -->\n\n";

  return text.replace(match[0], `${prefix}${bodyText}${suffix}`);
}

function retrospectiveSlug(taskId) {
  const raw = String(taskId || "unknown-task").toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildRetrospectiveBlock(entry, blockId) {
  const categories =
    Array.isArray(entry.categories) && entry.categories.length > 0
      ? entry.categories.map((category) => `- \`${category}\``)
      : ["- `None`"];

  return [
    `### ${blockId}`,
    `**Task ID**: \`${entry.taskId || "unknown-task"}\``,
    `**Implementation Plan**: \`${entry.planPath || "N/A"}\``,
    `**Trigger**: \`${entry.trigger || "pending"}\``,
    "**Decisions Made**:",
    "- Pending capture during the next internal long-running handoff or session close.",
    "**Wrong Assumptions**:",
    `- Prompt: ${entry.note || "Capture the assumption that failed."}`,
    "**Governance Candidates**:",
    ...categories,
    "**Governance Disposition**: `pending retrospective`",
    `**Last Updated**: ${entry.updatedAt || entry.createdAt || "unknown"}`
  ].join("\n");
}

function parseRetrospectiveChunk(chunk) {
  return {
    id: chunk.match(/^###\s+(.+)$/m)?.[1]?.trim() || null,
    taskId: chunk.match(/\*\*Task ID\*\*:\s*`([^`]+)`/)?.[1] || null,
    governanceDisposition: chunk.match(/\*\*Governance Disposition\*\*:\s*`([^`]+)`/)?.[1] || null,
    chunk
  };
}

function isPendingAutoRetrospective(parsed) {
  return (
    parsed.governanceDisposition === "pending retrospective" &&
    parsed.chunk.includes("Pending capture during the next internal long-running handoff or session close.") &&
    parsed.chunk.includes("- Prompt:")
  );
}

function nextRetrospectiveId(taskId, existingIds) {
  const slug = retrospectiveSlug(taskId);
  const prefix = `retrospective-${slug}`;
  let next = 1;

  for (const id of existingIds) {
    if (id === prefix) {
      next = Math.max(next, 2);
      continue;
    }

    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      next = Math.max(next, Number(match[1]) + 1);
    }
  }

  return next === 1 ? prefix : `${prefix}-${next}`;
}

function updateSessionRetrospectiveSection(text, state) {
  const match = text.match(/(## Session Retrospective \(Optional\)\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## |\n## |\s*$)/);
  if (!match) {
    return text;
  }

  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];
  const retrospectiveEntries = state.pendingActions.filter((item) => item.type === "session_retrospective");

  const chunks = body
    .split(/\n(?=### )/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const preamble = [];
  const blockMap = new Map();
  const parsedBlocks = [];
  const order = [];

  for (const chunk of chunks) {
    if (!chunk.startsWith("### ")) {
      preamble.push(chunk);
      continue;
    }

    const parsed = parseRetrospectiveChunk(chunk);
    const id = parsed.id;
    if (!id) {
      continue;
    }

    order.push(id);
    blockMap.set(id, chunk);
    parsedBlocks.push(parsed);
  }

  for (const entry of retrospectiveEntries) {
    const entryTaskId = String(entry.taskId || "unknown-task");
    const related = parsedBlocks.filter((item) => item.taskId === entryTaskId);
    const updatable = related.find((item) => isPendingAutoRetrospective(item));
    const pendingManual = related.find(
      (item) => item.governanceDisposition === "pending retrospective" && !isPendingAutoRetrospective(item)
    );

    if (pendingManual) {
      continue;
    }

    const id = updatable?.id || nextRetrospectiveId(entryTaskId, Array.from(blockMap.keys()));
    const block = buildRetrospectiveBlock(entry, id);
    if (!blockMap.has(id)) {
      order.push(id);
    }
    blockMap.set(id, block);
  }

  if (retrospectiveEntries.length > 0 && blockMap.has("[Session YYYY-MM-DD HH:MM]")) {
    blockMap.delete("[Session YYYY-MM-DD HH:MM]");
  }

  const renderedBlocks = order
    .filter((id, index) => order.indexOf(id) === index)
    .filter((id) => blockMap.has(id))
    .map((id) => blockMap.get(id));

  const parts = [...preamble, ...renderedBlocks].filter(Boolean);
  const bodyText =
    parts.length > 0
      ? `${parts.join("\n\n")}\n\n`
      : "<!-- No pending retrospective prompts -->\n\n";

  return text.replace(match[0], `${prefix}${bodyText}${suffix}`);
}

export function syncProgressFromState(progressPath, activePlans, state, taskRegistry = null) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return;
  }

  const projectDir = findProjectDir(path.dirname(progressPath)) || path.dirname(progressPath);
  const original = fs.readFileSync(progressPath, "utf8");
  const withRetryPattern = updateCurrentWorkSection(original, activePlans, state, taskRegistry);
  const withGovernanceQueue = updateGovernanceQueueSection(withRetryPattern, state);
  const withRetrospective = updateSessionRetrospectiveSection(withGovernanceQueue, state);

  if (withRetrospective !== original) {
    fs.writeFileSync(progressPath, withRetrospective, "utf8");
    logRuntimeFileWrite(projectDir, progressPath, withRetrospective, {
      category: "progress",
      writer: "syncProgressFromState",
      format: "text"
    });
  }
}
