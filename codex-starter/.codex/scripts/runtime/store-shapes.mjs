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

export function normalizeRuntimeStateShape(parsed = {}) {
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

export function normalizeGovernanceRegistryShape(parsed = {}) {
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

export function normalizeSubmitQueueAfter(queueAfter) {
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
