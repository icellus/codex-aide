import fs from "node:fs";
import path from "node:path";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function normalizeBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }

  return null;
}

function defaultPreferences() {
  return {
    version: 1,
    updated_at: null,
    commit: {
      auto_commit: null,
      tasks: {}
    },
    push: {
      remotes: {}
    }
  };
}

function normalizeTaskCommitEntry(value = {}) {
  const autoCommitCount = Number.isFinite(value?.auto_commit_count)
    ? value.auto_commit_count
    : Number.parseInt(value?.auto_commit_count, 10) || 0;

  return {
    auto_commit_count: Math.max(0, autoCommitCount),
    last_commit_sha: normalizeText(value?.last_commit_sha),
    last_commit_at: normalizeText(value?.last_commit_at) || null
  };
}

function normalizePreferences(value = {}) {
  const defaults = defaultPreferences();
  const commit = value?.commit && typeof value.commit === "object" ? value.commit : {};
  const push = value?.push && typeof value.push === "object" ? value.push : {};
  const remotes = push?.remotes && typeof push.remotes === "object" ? push.remotes : {};
  const taskEntries = commit?.tasks && typeof commit.tasks === "object" ? commit.tasks : {};
  const normalizedRemotes = {};
  const normalizedTasks = {};

  for (const [remote, entry] of Object.entries(remotes)) {
    const autoPush = normalizeBoolean(entry?.auto_push);
    normalizedRemotes[remote] = {
      auto_push: autoPush
    };
  }

  for (const [taskId, entry] of Object.entries(taskEntries)) {
    const normalizedTaskId = normalizeText(taskId);
    if (!normalizedTaskId) {
      continue;
    }
    normalizedTasks[normalizedTaskId] = normalizeTaskCommitEntry(entry);
  }

  return {
    version: Number.isFinite(value?.version) ? value.version : defaults.version,
    updated_at: normalizeText(value?.updated_at) || defaults.updated_at,
    commit: {
      auto_commit: normalizeBoolean(commit.auto_commit),
      tasks: normalizedTasks
    },
    push: {
      remotes: normalizedRemotes
    }
  };
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function preferencesPath(projectDir) {
  return path.join(projectDir, ".codex", "state", "submit-preferences.json");
}

function readPreferences(projectDir) {
  return normalizePreferences(readJsonFile(preferencesPath(projectDir), defaultPreferences()));
}

function writePreferences(projectDir, value) {
  const filePath = preferencesPath(projectDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalizePreferences(value), null, 2)}\n`, "utf8");
}

function taskCommitEntry(preferences, taskId) {
  const normalizedTaskId = normalizeText(taskId);
  if (!normalizedTaskId) {
    return normalizeTaskCommitEntry();
  }

  return normalizeTaskCommitEntry(preferences?.commit?.tasks?.[normalizedTaskId]);
}

function recordAutoCommit(preferences, taskId, commitSha, committedAt) {
  const normalized = normalizePreferences(preferences);
  const normalizedTaskId = normalizeText(taskId);
  if (!normalizedTaskId) {
    return normalized;
  }

  const current = taskCommitEntry(normalized, normalizedTaskId);
  normalized.commit.tasks[normalizedTaskId] = {
    auto_commit_count: current.auto_commit_count + 1,
    last_commit_sha: normalizeText(commitSha),
    last_commit_at: normalizeText(committedAt) || null
  };
  normalized.updated_at = normalizeText(committedAt) || new Date().toISOString();
  return normalized;
}

export {
  defaultPreferences,
  normalizeBoolean,
  normalizePreferences,
  normalizeTaskCommitEntry,
  normalizeText,
  preferencesPath,
  readPreferences,
  recordAutoCommit,
  taskCommitEntry,
  writePreferences
};
