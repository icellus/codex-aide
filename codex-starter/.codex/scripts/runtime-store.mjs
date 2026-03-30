import fs from "node:fs";
import path from "node:path";

import { ensureDir, logRuntimeFileWrite } from "./runtime-core.mjs";

function normalizeWorkflowToken(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || fallback;
}

function normalizeWorkflowChainId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeWorkflowPathReference(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeWorkflowReason(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function inferWorkflowPhase(source, currentChain, fallback) {
  const explicit = normalizeWorkflowToken(source.phase, "");
  if (explicit) {
    return explicit;
  }

  if (currentChain === "tester_blocked") {
    return "tester";
  }

  if (currentChain === "settlement_blocked") {
    const requiredHandoff = normalizeWorkflowToken(source.required_handoff, "none");
    return requiredHandoff === "tester" ? "coder" : fallback;
  }

  return currentChain || fallback;
}

export function createEmptyTaskWorkflowState() {
  return {
    phase: "idle",
    chain_id: null,
    workflow_chain_id: null,
    current_chain: "idle",
    expected_next_step: "none",
    required_handoff: "none",
    required_handoff_task_id: null,
    settlement_guard: "none",
    settlement_guard_reason: "",
    updated_at: null
  };
}

export function normalizeTaskWorkflowState(value = {}) {
  const empty = createEmptyTaskWorkflowState();
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const currentChain = normalizeWorkflowToken(source.current_chain, empty.current_chain);
  const phase = inferWorkflowPhase(source, currentChain, empty.phase);
  const requiredHandoff = normalizeWorkflowToken(source.required_handoff, empty.required_handoff);
  const settlementGuard = normalizeWorkflowToken(source.settlement_guard, empty.settlement_guard);
  const chainId = normalizeWorkflowChainId(source.chain_id ?? source.workflow_chain_id);

  return {
    phase,
    chain_id: chainId,
    workflow_chain_id: chainId,
    current_chain: currentChain,
    expected_next_step: normalizeWorkflowToken(source.expected_next_step, empty.expected_next_step),
    required_handoff: requiredHandoff,
    required_handoff_task_id:
      requiredHandoff === "none" ? null : normalizeWorkflowChainId(source.required_handoff_task_id),
    settlement_guard: settlementGuard,
    settlement_guard_reason: settlementGuard === "none" ? "" : normalizeWorkflowReason(source.settlement_guard_reason),
    updated_at: normalizeWorkflowPathReference(source.updated_at)
  };
}

export function createEmptyTaskContext() {
  return {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: false
    },
    task: {
      current_task: "",
      status: "idle",
      class: "unknown",
      risk: "unknown",
      delivery_mode: "lightweight",
      route_rationale: "",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["intake triage and cached repo context", "direct answer or routed delivery"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "not-set",
      open_questions: [],
      workflow: createEmptyTaskWorkflowState()
    }
  };
}

export function createEmptyRepoContext() {
  return {
    version: 1,
    updated_at: null,
    scan_status: "not-scanned",
    project_type: "Unknown",
    scale: "Unknown",
    primary_languages: [],
    frameworks: [],
    repo_shape: "",
    ci_or_deployment_signals: [],
    release_path: "",
    validation_signals: [],
    notes: []
  };
}

export function createEmptyDeliveryPolicy() {
  return {
    version: 1,
    status: "starter-default",
    ownership: {
      maintained_by: "Aide",
      purpose: "submit orchestration and guarded post-validation delivery defaults",
      notes: [
        "The submit path owns commit, push, and optional post-push delivery stages.",
        "The project itself still owns real CI, release, and notification integrations."
      ]
    },
    submit: {
      enabled: true,
      queue_after: {
        tester_complete_without_qc: true,
        qc_pass_after_tester: true,
        task_settled_without_qc: true,
        task_settled_after_qc: true
      }
    },
    commit: {
      mode: "ask_once",
      protected_branches: ["main", "master"],
      blocked_branches: [],
      allow_current_branch_prefixes: ["feat/", "fix/", "chore/", "refactor/"],
      create_branch_when_needed: "ask",
      max_auto_commits_per_task: 1,
      allow_amend: false,
      message_template: "{type}: {summary}"
    },
    push: {
      mode: "ask_once",
      allowed_remotes: ["origin"],
      default_remote: "origin",
      set_upstream: "ask",
      create_remote_branch_when_missing: "ask",
      stop_on_rejection: true
    },
    notify: {
      enabled: false,
      trigger: "after_push",
      channels: []
    },
    ci: {
      enabled: false,
      source: "project-signals",
      mode: "report-only"
    },
    release: {
      enabled: false,
      mode: "report-only",
      targets: []
    },
    fallback: {
      on_missing_config: "skip-step",
      on_environment_blocker: "report-and-stop",
      on_repeat_failure: "report-and-stop",
      on_partial_delivery: "report-current-state"
    }
  };
}

export function createEmptyAideGovernancePolicy() {
  return {
    version: 1,
    default_disposition: {
      G1: "auto-fix",
      G2: "ask-user",
      G3: "ask-user"
    },
    auto_fix_levels: ["G1"],
    persist_fields: ["issue", "level", "authority_target", "disposition", "note"],
    filePath: "",
    text: ""
  };
}

export function createEmptyState() {
  return {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [],
    failurePatterns: {},
    governanceQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  };
}

export function createEmptyTaskRegistry() {
  return {
    version: 1,
    updatedAt: null,
    currentTaskId: null,
    tasks: []
  };
}

export function createEmptyGovernanceRegistry() {
  return {
    version: 1,
    updatedAt: null,
    lastSweep: {
      checkedAt: null,
      trigger: null,
      background: false,
      candidateCount: 0,
      settledTaskCount: 0,
      note: ""
    },
    candidates: [],
    settledTaskReviews: []
  };
}

function normalizeGovernanceLevel(value, fallback = "G2") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "G1" || normalized === "G2" || normalized === "G3") {
    return normalized;
  }
  return fallback;
}

function normalizeGovernanceDisposition(value, level = "G2") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "auto-fix" || normalized === "ask-user" || normalized === "queue") {
    return normalized;
  }
  return normalizeGovernanceLevel(level, "G2") === "G1" ? "auto-fix" : "ask-user";
}

function normalizeGovernanceCandidateEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const level = normalizeGovernanceLevel(entry.level, "G2");
  const authorityTarget = String(entry.authority_target || "").trim();
  const recommendedAction = String(entry.recommended_action || "").trim();
  const issue = String(entry.issue || "").trim();
  const impact = String(entry.impact || "").trim();

  if (!issue && !impact && !authorityTarget && !recommendedAction) {
    return null;
  }

  return {
    issue: issue || "Governance follow-up required.",
    level,
    impact: impact || "Governance follow-up required.",
    authority_target: authorityTarget || "to-be-determined",
    recommended_action: recommendedAction || "review and decide next step",
    disposition: normalizeGovernanceDisposition(entry.disposition, level)
  };
}

function normalizeGovernanceQueueItem(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const id = String(entry.id || "").trim();
  const triggerCount = Number.isFinite(entry.triggerCount)
    ? entry.triggerCount
    : Number.parseInt(String(entry.trigger_count || "0"), 10) || 0;
  const suggestedRoute = Array.isArray(entry.suggestedRoute)
    ? entry.suggestedRoute
    : Array.isArray(entry.suggested_route)
      ? entry.suggested_route
      : typeof entry.suggestedRoute === "string"
        ? entry.suggestedRoute.split(",").map((item) => item.trim()).filter(Boolean)
        : typeof entry.suggested_route === "string"
          ? entry.suggested_route.split(",").map((item) => item.trim()).filter(Boolean)
          : [];
  const level = normalizeGovernanceLevel(entry.level, "G2");
  const authorityTarget = String(entry.authority_target || "").trim();
  const recommendedAction = String(entry.recommended_action || "").trim();
  const normalizedId = id || `governance-item-${Date.now()}`;

  return {
    id: normalizedId,
    category: String(entry.category || "role_gap").trim() || "role_gap",
    taskId: entry.taskId || null,
    planPath: entry.planPath || null,
    triggerCount,
    suggestedRoute,
    issue: String(entry.issue || `Queued governance item: ${String(entry.category || "unknown").trim() || "unknown"}`).trim(),
    level,
    impact: String(entry.impact || "").trim() || `Governance queue item triggered ${triggerCount || 1} time(s).`,
    authority_target: authorityTarget || "to-be-determined",
    recommended_action: recommendedAction || "review and decide next step",
    disposition: normalizeGovernanceDisposition(entry.disposition || (entry.status === "queued" ? "queue" : ""), level),
    status: String(entry.status || "queued").trim().toLowerCase() || "queued",
    source: String(entry.source || entry.taskId || "unknown").trim() || "unknown",
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null
  };
}

function normalizeGovernancePendingAction(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  if (entry.type !== "governance_review") {
    return entry;
  }

  const level = normalizeGovernanceLevel(entry.level, "G2");
  const authorityTarget = String(entry.authority_target || "").trim();
  const recommendedAction = String(entry.recommended_action || "").trim();

  return {
    id: String(entry.id || "").trim() || entry.id,
    type: "governance_review",
    scope: entry.scope || undefined,
    issue: String(entry.issue || entry.note || "governance review pending").trim() || "governance review pending",
    level,
    impact: String(entry.impact || "").trim() || `governance signal from ${String(entry.sourceRole || "runtime").trim() || "runtime"}`,
    authority_target: authorityTarget || "to-be-determined",
    recommended_action: recommendedAction || "review and choose the smallest authority owner",
    disposition: normalizeGovernanceDisposition(entry.disposition, level),
    taskId: entry.taskId || null,
    sourceRole: entry.sourceRole || null,
    note: entry.note || "",
    planPath: entry.planPath || null,
    governance_candidates: Array.isArray(entry.governance_candidates)
      ? entry.governance_candidates.map((item) => normalizeGovernanceCandidateEntry(item)).filter(Boolean)
      : [],
    decisions: Array.isArray(entry.decisions) ? entry.decisions.filter(Boolean) : [],
    wrongAssumptions: Array.isArray(entry.wrongAssumptions) ? entry.wrongAssumptions.filter(Boolean) : [],
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null
  };
}

function normalizeRuntimeStateShape(parsed = {}) {
  const emptyState = createEmptyState();
  const rawPendingActions = Array.isArray(parsed.pendingActions) ? parsed.pendingActions : [];
  const rawGovernanceQueue = Array.isArray(parsed.governanceQueue) ? parsed.governanceQueue : [];

  return {
    ...emptyState,
    ...(parsed || {}),
    pendingActions: rawPendingActions
      .map((entry) => normalizeGovernancePendingAction(entry))
      .filter(Boolean),
    governanceQueue: rawGovernanceQueue
      .map((entry) => normalizeGovernanceQueueItem(entry))
      .filter(Boolean),
    qualityMetrics: {
      ...emptyState.qualityMetrics,
      ...(parsed.qualityMetrics || {}),
      qcByPhase: {
        tester: {
          ...emptyState.qualityMetrics.qcByPhase.tester,
          ...(parsed.qualityMetrics?.qcByPhase?.tester || {})
        },
        coder: {
          ...emptyState.qualityMetrics.qcByPhase.coder,
          ...(parsed.qualityMetrics?.qcByPhase?.coder || {})
        },
        manual: {
          ...emptyState.qualityMetrics.qcByPhase.manual,
          ...(parsed.qualityMetrics?.qcByPhase?.manual || {})
        }
      }
    },
    sessionContext: {
      ...emptyState.sessionContext,
      ...(parsed.sessionContext || {})
    }
  };
}

function normalizeGovernanceRegistryShape(parsed = {}) {
  const emptyRegistry = createEmptyGovernanceRegistry();
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];

  return {
    ...emptyRegistry,
    ...parsed,
    lastSweep: {
      ...emptyRegistry.lastSweep,
      ...(parsed.lastSweep || {})
    },
    candidates: rawCandidates
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const level = normalizeGovernanceLevel(entry.level, "G2");
        const authorityTarget = String(entry.authority_target || "").trim();
        const recommendedAction = String(entry.recommended_action || "").trim();
        return {
          id: entry.id || null,
          sourceType: entry.sourceType || null,
          status: entry.status || "queued",
          taskId: entry.taskId || null,
          planPath: entry.planPath || null,
          taskTitle: entry.taskTitle || null,
          signalIds: Array.isArray(entry.signalIds) ? entry.signalIds : [],
          summary: entry.summary || "",
          issue: String(entry.issue || entry.summary || "candidate queued").trim() || "candidate queued",
          level,
          impact: String(entry.impact || "").trim() || `governance candidate from ${String(entry.sourceType || "unknown")}`,
          authority_target: authorityTarget || "to-be-determined",
          recommended_action: recommendedAction || "review and decide next step",
          disposition: normalizeGovernanceDisposition(entry.disposition, level),
          note: entry.note || "",
          automation: entry.automation || null,
          createdAt: entry.createdAt || null,
          updatedAt: entry.updatedAt || null,
          lastSeenAt: entry.lastSeenAt || null,
          resolvedAt: entry.resolvedAt || null,
          appliedAt: entry.appliedAt || null,
          failedAt: entry.failedAt || null,
          failureReason: entry.failureReason || null,
          applyResult: entry.applyResult || null,
          governance_candidates: Array.isArray(entry.governance_candidates)
            ? entry.governance_candidates.map((item) => normalizeGovernanceCandidateEntry(item)).filter(Boolean)
            : []
        };
      })
      .filter(Boolean),
    settledTaskReviews: Array.isArray(parsed.settledTaskReviews)
      ? parsed.settledTaskReviews.filter((item) => item && typeof item === "object")
      : []
  };
}

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

function normalizeSubmitQueueAfter(queueAfter) {
  const source = queueAfter && typeof queueAfter === "object" && !Array.isArray(queueAfter) ? queueAfter : {};
  const normalized = { ...source };
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(source, key);

  if (!hasOwn("tester_complete_without_qc") && hasOwn("coder_complete_without_qc")) {
    normalized.tester_complete_without_qc = source.coder_complete_without_qc;
  }

  if (!hasOwn("qc_pass_after_tester") && hasOwn("qc_pass_after_coder")) {
    normalized.qc_pass_after_tester = source.qc_pass_after_coder;
  }

  return normalized;
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

function normalizeProfileValue(value) {
  return String(value || "").replace(/`/g, "").trim();
}

function normalizeDeliveryModeValue(value) {
  const normalized = normalizeProfileValue(value);
  const legacy = normalized.toLowerCase();

  if (legacy === "direct") {
    return "lightweight";
  }

  if (legacy === "plan-driven") {
    return "standard";
  }

  if (legacy === "orchestrated") {
    return "long-running";
  }

  return normalized;
}

function normalizeEnabledModuleValue(value) {
  const normalized = normalizeProfileValue(value);
  const legacy = normalized.toLowerCase();
  if (legacy === "startup scan or cached repo context") {
    return "intake triage and cached repo context";
  }
  if (legacy === "lightweight execution") {
    return "direct answer or routed delivery";
  }
  if (legacy === "direct implementation" || legacy === "lightweight implementation") {
    return "direct answer or routed delivery";
  }
  return normalized;
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeProfileValue(item)).filter(Boolean);
  }

  const normalized = normalizeProfileValue(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readProfileField(text, label) {
  const prefix = `- ${label}:`;
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix));
  if (!line) {
    return "";
  }
  return line.slice(prefix.length).trim();
}

function parseProfileList(value) {
  return normalizeProfileValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapTaskContextToProfile(parsed = {}) {
  const empty = createEmptyTaskContext();
  const collaboration = {
    ...empty.collaboration,
    ...(parsed.collaboration || {})
  };
  const task = {
    ...empty.task,
    ...(parsed.task || {})
  };
  const workflow = normalizeTaskWorkflowState(task.workflow);

  return {
    task: normalizeProfileValue(task.current_task) || null,
    taskStatus: normalizeProfileValue(task.status) || "idle",
    taskClass: normalizeProfileValue(task.class) || null,
    riskLevel: normalizeProfileValue(task.risk) || null,
    deliveryMode: normalizeDeliveryModeValue(task.delivery_mode) || null,
    routeRationale: normalizeProfileValue(task.route_rationale) || null,
    routingOverrides: normalizeListValue(task.routing_overrides),
    enabledRoles: normalizeListValue(task.enabled_roles),
    enabledModules: normalizeListValue(task.enabled_modules).map((item) => normalizeEnabledModuleValue(item)),
    qcPolicy: normalizeProfileValue(task.qc_policy) || null,
    submitPolicy: normalizeProfileValue(task.submit_policy) || null,
    validationProfileStatus: normalizeProfileValue(task.validation_profile_status) || null,
    openQuestions: normalizeListValue(task.open_questions),
    workflow,
    workflowPhase: workflow.phase,
    workflowChainId: workflow.chain_id,
    workflowCurrentChain: workflow.current_chain,
    workflowExpectedNextStep: workflow.expected_next_step,
    workflowRequiredHandoff: workflow.required_handoff,
    workflowRequiredHandoffTaskId: workflow.required_handoff_task_id,
    workflowSettlementGuard: workflow.settlement_guard,
    workflowSettlementGuardReason: workflow.settlement_guard_reason,
    preferredAddress: normalizeProfileValue(collaboration.preferred_address) || "Boss",
    greetingStyle: normalizeProfileValue(collaboration.greeting_style) || "warm",
    firstStartupGreetingCompleted: Boolean(collaboration.first_startup_greeting_completed)
  };
}

export function loadProjectProfileState(projectDir) {
  const emptyWorkflow = createEmptyTaskWorkflowState();
  const taskContextPath = path.join(projectDir, ".codex", "state", "task-context.json");
  if (fs.existsSync(taskContextPath)) {
    return mapTaskContextToProfile(loadTaskContext(projectDir));
  }

  const profilePath = path.join(projectDir, ".codex", "context", "project-profile.md");
  if (!fs.existsSync(profilePath)) {
    return {
      task: null,
      taskStatus: "idle",
      taskClass: null,
      riskLevel: null,
      deliveryMode: null,
      enabledRoles: [],
      enabledModules: [],
      qcPolicy: null,
      submitPolicy: null,
      validationProfileStatus: null,
      workflow: emptyWorkflow,
      workflowPhase: emptyWorkflow.phase,
      workflowChainId: emptyWorkflow.chain_id,
      workflowCurrentChain: emptyWorkflow.current_chain,
      workflowExpectedNextStep: emptyWorkflow.expected_next_step,
      workflowRequiredHandoff: emptyWorkflow.required_handoff,
      workflowRequiredHandoffTaskId: emptyWorkflow.required_handoff_task_id,
      workflowSettlementGuard: emptyWorkflow.settlement_guard,
      workflowSettlementGuardReason: emptyWorkflow.settlement_guard_reason,
      preferredAddress: "Boss",
      greetingStyle: "warm",
      firstStartupGreetingCompleted: false,
      openQuestions: []
    };
  }

  const text = fs.readFileSync(profilePath, "utf8");
  return {
    task: normalizeProfileValue(readProfileField(text, "Current task")) || null,
    taskStatus: normalizeProfileValue(readProfileField(text, "Task status")) || "idle",
    taskClass: normalizeProfileValue(readProfileField(text, "Task class")) || null,
    riskLevel: normalizeProfileValue(readProfileField(text, "Risk level")) || null,
    deliveryMode: normalizeDeliveryModeValue(readProfileField(text, "Selected delivery mode")) || null,
    routeRationale: normalizeProfileValue(readProfileField(text, "Route rationale")) || null,
    enabledRoles: parseProfileList(readProfileField(text, "Enabled roles")),
    enabledModules: parseProfileList(readProfileField(text, "Enabled modules")),
    qcPolicy: normalizeProfileValue(readProfileField(text, "QC policy")) || null,
    submitPolicy: normalizeProfileValue(readProfileField(text, "Submit policy")) || null,
    validationProfileStatus: normalizeProfileValue(readProfileField(text, "Validation profile status")) || null,
    workflow: emptyWorkflow,
    workflowPhase: emptyWorkflow.phase,
    workflowChainId: emptyWorkflow.chain_id,
    workflowCurrentChain: emptyWorkflow.current_chain,
    workflowExpectedNextStep: emptyWorkflow.expected_next_step,
    workflowRequiredHandoff: emptyWorkflow.required_handoff,
    workflowRequiredHandoffTaskId: emptyWorkflow.required_handoff_task_id,
    workflowSettlementGuard: emptyWorkflow.settlement_guard,
    workflowSettlementGuardReason: emptyWorkflow.settlement_guard_reason,
    preferredAddress: normalizeProfileValue(readProfileField(text, "Preferred address")) || "Boss",
    greetingStyle: normalizeProfileValue(readProfileField(text, "Greeting style")) || "warm",
    firstStartupGreetingCompleted:
      normalizeProfileValue(readProfileField(text, "First startup greeting completed")).toLowerCase() === "yes",
    openQuestions: parseProfileList(readProfileField(text, "Open questions"))
  };
}

export function isQcEnabled(profile = {}) {
  const qcPolicy = String(profile.qcPolicy || "").toLowerCase();
  if (qcPolicy === "enabled" || qcPolicy === "required") {
    return true;
  }

  return Array.isArray(profile.enabledModules)
    ? profile.enabledModules.some((item) => /(^|\/)qc\b|quality gate/i.test(String(item)))
    : false;
}

export function isSubmitEnabled(profile = {}, deliveryPolicy = null) {
  const submitPolicy = String(profile.submitPolicy || "").toLowerCase();
  if (submitPolicy === "enabled" || submitPolicy === "required") {
    return true;
  }

  if (submitPolicy === "disabled") {
    return false;
  }

  if (
    Array.isArray(profile.enabledModules) &&
    profile.enabledModules.some((item) => /(^|\/)submit\b|governed submit|delivery/i.test(String(item)))
  ) {
    return true;
  }

  return deliveryPolicy?.submit?.enabled !== false;
}

export function isTaskSettled(profile = {}) {
  const taskStatus = String(profile.taskStatus || "").toLowerCase();
  return taskStatus === "done" || taskStatus === "idle";
}

export function isLongRunningProfile(profile = {}) {
  return normalizeDeliveryModeValue(profile.deliveryMode).toLowerCase() === "long-running";
}
