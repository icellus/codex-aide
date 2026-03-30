import fs from "node:fs";
import path from "node:path";

import { ensureDir, logRuntimeFileWrite } from "../shared/logging.mjs";
import {
  createEmptyAideGovernancePolicy,
  createEmptyDeliveryPolicy,
  createEmptyGovernanceRegistry,
  createEmptyRepoContext,
  createEmptyState,
  createEmptyTaskContext,
  createEmptyTaskRegistry,
  createEmptyTaskWorkflowState,
  normalizeGovernanceRegistryShape,
  normalizeRuntimeStateShape,
  normalizeSubmitQueueAfter,
  normalizeTaskWorkflowState
} from "./store-shapes.mjs";
import {
  isLongRunningProfile,
  isQcEnabled,
  isSubmitEnabled,
  isTaskSettled,
  loadProjectProfileState as loadProfileState
} from "./profile-state.mjs";

export {
  createEmptyAideGovernancePolicy,
  createEmptyDeliveryPolicy,
  createEmptyGovernanceRegistry,
  createEmptyRepoContext,
  createEmptyState,
  createEmptyTaskContext,
  createEmptyTaskRegistry,
  createEmptyTaskWorkflowState,
  normalizeTaskWorkflowState
} from "./store-shapes.mjs";

export {
  isLongRunningProfile,
  isQcEnabled,
  isSubmitEnabled,
  isTaskSettled
} from "./profile-state.mjs";

function loadJsonFile(filePath, fallbackFactory) {
  if (!fs.existsSync(filePath)) {
    return fallbackFactory();
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackFactory();
  }
}

export function loadRuntimeState(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const statePath = path.join(stateDir, "runtime-state.json");

  ensureDir(stateDir);

  if (!fs.existsSync(statePath)) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return normalizeRuntimeStateShape(parsed);
  } catch {
    return createEmptyState();
  }
}

export function saveRuntimeState(projectDir, state) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const statePath = path.join(stateDir, "runtime-state.json");
  const normalizedState = normalizeRuntimeStateShape(state);

  ensureDir(stateDir);
  fs.writeFileSync(statePath, JSON.stringify(normalizedState, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, statePath, normalizedState, {
    category: "state",
    writer: "saveRuntimeState",
    format: "json"
  });
}

export function loadDeliveryPolicy(projectDir) {
  const policyPath = path.join(projectDir, ".codex", "policies", "delivery-policy.json");
  const parsed = loadJsonFile(policyPath, createEmptyDeliveryPolicy);
  const emptyPolicy = createEmptyDeliveryPolicy();
  const parsedSubmitQueueAfter = normalizeSubmitQueueAfter(parsed.submit?.queue_after);

  return {
    ...emptyPolicy,
    ...parsed,
    ownership: {
      ...emptyPolicy.ownership,
      ...(parsed.ownership || {})
    },
    submit: {
      ...emptyPolicy.submit,
      ...(parsed.submit || {}),
      queue_after: {
        ...emptyPolicy.submit.queue_after,
        ...parsedSubmitQueueAfter
      }
    },
    commit: {
      ...emptyPolicy.commit,
      ...(parsed.commit || {})
    },
    push: {
      ...emptyPolicy.push,
      ...(parsed.push || {})
    },
    notify: {
      ...emptyPolicy.notify,
      ...(parsed.notify || {})
    },
    ci: {
      ...emptyPolicy.ci,
      ...(parsed.ci || {})
    },
    release: {
      ...emptyPolicy.release,
      ...(parsed.release || {})
    },
    fallback: {
      ...emptyPolicy.fallback,
      ...(parsed.fallback || {})
    }
  };
}

export function loadAideGovernancePolicy(projectDir) {
  const fallback = createEmptyAideGovernancePolicy();
  const policyPath = path.join(projectDir, ".codex", "policies", "aide-governance-policy.md");
  const next = {
    ...fallback,
    filePath: policyPath
  };

  if (!fs.existsSync(policyPath)) {
    return next;
  }

  const text = fs.readFileSync(policyPath, "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);

  let parsed = {};
  if (frontmatter?.[1]) {
    try {
      parsed = JSON.parse(frontmatter[1]);
    } catch {
      parsed = {};
    }
  }

  const normalizedAutoFixLevels = Array.isArray(parsed.auto_fix_levels)
    ? parsed.auto_fix_levels.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
    : fallback.auto_fix_levels;
  const normalizedPersistFields = Array.isArray(parsed.persist_fields)
    ? parsed.persist_fields.map((item) => String(item || "").trim()).filter(Boolean)
    : fallback.persist_fields;

  return {
    ...next,
    ...(parsed && typeof parsed === "object" ? parsed : {}),
    default_disposition:
      parsed.default_disposition && typeof parsed.default_disposition === "object"
        ? {
            ...fallback.default_disposition,
            ...parsed.default_disposition
          }
        : fallback.default_disposition,
    auto_fix_levels: normalizedAutoFixLevels.length > 0 ? normalizedAutoFixLevels : fallback.auto_fix_levels,
    persist_fields: normalizedPersistFields.length > 0 ? normalizedPersistFields : fallback.persist_fields,
    text
  };
}

export function loadTaskRegistry(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const registryPath = path.join(stateDir, "task-registry.json");

  ensureDir(stateDir);

  if (!fs.existsSync(registryPath)) {
    return createEmptyTaskRegistry();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const emptyRegistry = createEmptyTaskRegistry();
    return {
      ...emptyRegistry,
      ...parsed,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter((item) => item && typeof item === "object") : []
    };
  } catch {
    return createEmptyTaskRegistry();
  }
}

export function saveTaskRegistry(projectDir, registry) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const registryPath = path.join(stateDir, "task-registry.json");

  ensureDir(stateDir);
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, registryPath, registry, {
    category: "state",
    writer: "saveTaskRegistry",
    format: "json"
  });
}

export function loadTaskContext(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const taskContextPath = path.join(stateDir, "task-context.json");

  ensureDir(stateDir);

  const parsed = loadJsonFile(taskContextPath, createEmptyTaskContext);
  const empty = createEmptyTaskContext();
  const nextTask = {
    ...empty.task,
    ...(parsed.task || {})
  };
  nextTask.workflow = normalizeTaskWorkflowState({
    ...empty.task.workflow,
    ...(nextTask.workflow || {})
  });

  return {
    ...empty,
    ...parsed,
    collaboration: {
      ...empty.collaboration,
      ...(parsed.collaboration || {})
    },
    task: nextTask
  };
}

export function saveTaskContext(projectDir, taskContext) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const taskContextPath = path.join(stateDir, "task-context.json");
  const empty = createEmptyTaskContext();
  const current = loadTaskContext(projectDir);
  const incomingTask = (taskContext && taskContext.task) || {};
  const mergedWorkflow = normalizeTaskWorkflowState({
    ...(current.task?.workflow || {}),
    ...(incomingTask.workflow || {})
  });
  const merged = {
    ...empty,
    ...current,
    ...(taskContext || {}),
    collaboration: {
      ...empty.collaboration,
      ...(current.collaboration || {}),
      ...((taskContext && taskContext.collaboration) || {})
    },
    task: {
      ...empty.task,
      ...(current.task || {}),
      ...incomingTask,
      workflow: mergedWorkflow
    }
  };

  ensureDir(stateDir);
  fs.writeFileSync(taskContextPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, taskContextPath, merged, {
    category: "state",
    writer: "saveTaskContext",
    format: "json"
  });
}

export function saveRepoContext(projectDir, repoContext) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const repoContextPath = path.join(stateDir, "repo-context.json");
  const empty = createEmptyRepoContext();
  const merged = {
    ...empty,
    ...(repoContext || {}),
    primary_languages: Array.isArray(repoContext?.primary_languages) ? repoContext.primary_languages : [],
    frameworks: Array.isArray(repoContext?.frameworks) ? repoContext.frameworks : [],
    ci_or_deployment_signals: Array.isArray(repoContext?.ci_or_deployment_signals)
      ? repoContext.ci_or_deployment_signals
      : [],
    validation_signals: Array.isArray(repoContext?.validation_signals) ? repoContext.validation_signals : [],
    notes: Array.isArray(repoContext?.notes) ? repoContext.notes : []
  };

  ensureDir(stateDir);
  fs.writeFileSync(repoContextPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, repoContextPath, merged, {
    category: "state",
    writer: "saveRepoContext",
    format: "json"
  });
}

export function loadGovernanceRegistry(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const registryPath = path.join(stateDir, "governance-registry.json");

  ensureDir(stateDir);

  if (!fs.existsSync(registryPath)) {
    return createEmptyGovernanceRegistry();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    return normalizeGovernanceRegistryShape(parsed);
  } catch {
    return createEmptyGovernanceRegistry();
  }
}

export function saveGovernanceRegistry(projectDir, registry) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const registryPath = path.join(stateDir, "governance-registry.json");
  const normalizedRegistry = normalizeGovernanceRegistryShape(registry);

  ensureDir(stateDir);
  fs.writeFileSync(registryPath, JSON.stringify(normalizedRegistry, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, registryPath, normalizedRegistry, {
    category: "state",
    writer: "saveGovernanceRegistry",
    format: "json"
  });
}

export function loadProjectProfileState(projectDir) {
  return loadProfileState(projectDir, loadTaskContext);
}
