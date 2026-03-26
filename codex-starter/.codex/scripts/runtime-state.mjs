#!/usr/bin/env node

import {
  basenameLabel,
  compactText,
  detectFailureCategories,
  detectQcFail,
  detectQcPhase,
  detectQcPass,
  detectTaskCompletionMessage,
  detectSubagentStatus,
  extractStructuredResult,
  findProgressFile,
  getProjectDir,
  highestGovernanceSeverity,
  isLongRunningProfile,
  isQcEnabled,
  isSubmitEnabled,
  isTaskSettled,
  lessonForCategory,
  loadDeliveryPolicy,
  loadProjectProfileState,
  loadRuntimeState,
  parseActiveStories,
  readJsonStdin,
  removePendingActions,
  resolveActiveStory,
  saveRuntimeState,
  suggestedRoutesForCategory,
  syncTaskRegistry,
  syncProgressFromState,
  toLessonId,
  trimRuntimeState,
  normalizeGovernanceSeverity,
  upsertLearningQueueItem,
  upsertPendingAction
} from "./runtime-utils.mjs";

function normalizeEventName(input = {}) {
  const raw = String(input.event || input.hook_event_name || "").trim().toLowerCase();

  if (!raw) {
    return "";
  }

  if (raw === "subagentstop" || raw === "subagent_stop" || raw === "subagent-result") {
    return "subagent_result";
  }

  if (raw === "stop" || raw === "session-stop" || raw === "session_close") {
    return "session_end";
  }

  if (raw === "task-stop" || raw === "task_complete" || raw === "task-complete" || raw === "task-settled") {
    return "task_settled";
  }

  return raw;
}

function normalizeRole(input = {}, message = "") {
  const structured = extractStructuredResult(message);
  const raw = String(input.role || input.agent_type || structured?.role || "").trim().toLowerCase();

  if (raw === "qc_reviewer") {
    return "qc";
  }

  if (raw === "submit_worker") {
    return "submit";
  }

  return raw;
}

function normalizeMessage(input = {}) {
  return String(input.message || input.last_assistant_message || input.report || "");
}

function normalizeStatus(input = {}, role, message) {
  const explicitStatus = String(input.status || "").trim().toLowerCase();
  if (explicitStatus) {
    return explicitStatus;
  }

  return detectSubagentStatus(role, message);
}

function upsertSessionRetrospective(state, storyPath, details = {}) {
  const id = details.id || `session-retrospective:${storyPath || "unknown"}`;
  upsertPendingAction(state, {
    id,
    type: "session_retrospective",
    storyPath,
    ...details
  });
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeWritebackCandidates(message) {
  const structured = extractStructuredResult(message);
  if (!Array.isArray(structured?.writeback_candidates)) {
    return [];
  }

  return structured.writeback_candidates
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const target = String(entry.target || "").trim();
      const reason = String(entry.reason || "").trim();
      const capability = String(entry.capability || "investigation").trim().toLowerCase() || "investigation";
      const severity = normalizeGovernanceSeverity(entry.severity || "L2");

      if (!target && !reason) {
        return null;
      }

      return {
        target: target || "unknown-target",
        reason: reason || "No reason provided.",
        capability,
        severity
      };
    })
    .filter(Boolean);
}

function normalizeProductMemoryUpdates(message) {
  const structured = extractStructuredResult(message) || {};
  const updates = structured.memory_updates_applied;
  if (!updates || typeof updates !== "object") {
    return {
      userPreferences: [],
      repoPreferences: []
    };
  }

  const normalizePreferenceEntries = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (typeof entry === "string") {
          const text = String(entry).trim();
          return text ? { id: "", preference: text, applies_to: "", source: "explicit|repeated" } : null;
        }
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const preference = String(entry.preference || "").trim();
        const appliesTo = String(entry.applies_to || "").trim();
        const source = String(entry.source || "").trim();
        if (!preference && !appliesTo && !source) {
          return null;
        }
        return {
          id: String(entry.id || "").trim(),
          preference,
          applies_to: appliesTo,
          source: source || "explicit|repeated"
        };
      })
      .filter(Boolean);
  };

  return {
    userPreferences: normalizePreferenceEntries(updates.user_preferences),
    repoPreferences: normalizePreferenceEntries(updates.repo_preferences)
  };
}

function normalizeProductTemplateChanges(message) {
  const structured = extractStructuredResult(message) || {};
  const entries = structured.template_updates_applied;
  if (Array.isArray(entries)) {
    return entries
      .map((entry) => {
        if (typeof entry === "string") {
          const path = String(entry).trim();
          return path ? { id: "", path, artifact_type: "" } : null;
        }
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const filePath = String(entry.path || "").trim();
        const id = String(entry.id || "").trim();
        const artifactType = String(entry.artifact_type || "").trim();
        if (!filePath && !id && !artifactType) {
          return null;
        }
        return {
          id,
          path: filePath,
          artifact_type: artifactType
        };
      })
      .filter(Boolean);
  }

  return normalizeStringList(structured.template_files_changed).map((path) => ({
    id: "",
    path,
    artifact_type: ""
  }));
}

function normalizeProductOpenGaps(message) {
  const structured = extractStructuredResult(message) || {};
  return normalizeStringList(structured.open_gaps);
}

function normalizeProductEvolutionCandidates(message) {
  const structured = extractStructuredResult(message) || {};
  if (!Array.isArray(structured?.evolution_candidates)) {
    return [];
  }

  return structured.evolution_candidates
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const id = String(entry.id || "").trim();
      const category = String(entry.category || "").trim().toLowerCase();
      const summary = String(entry.summary || entry.reason || "").trim();
      const source = String(entry.source || "").trim();
      if (!id && !category && !summary && !source) {
        return null;
      }

      return {
        id,
        category: category || "role_gap",
        summary: summary || "No summary provided.",
        source: source || "product_assistant"
      };
    })
    .filter(Boolean);
}

function governanceSeverityForRetryCount(triggerCount) {
  return triggerCount >= 4 ? "L4" : "L3";
}

function preferredGovernanceCapability(candidates = [], fallback = "investigation") {
  if (candidates.some((item) => item.capability === "dedup")) {
    return "dedup";
  }

  if (candidates.some((item) => item.capability === "audit")) {
    return "audit";
  }

  if (candidates.some((item) => item.capability === "writeback")) {
    return "writeback";
  }

  return fallback;
}

function upsertAideReview(state, details = {}) {
  const storyKey = details.storyPath || "current-task";
  const issueKey = String(details.issueKey || details.sourceRole || details.capability || "general")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  upsertPendingAction(state, {
    id: details.id || `aide-review:${issueKey}:${storyKey}`,
    type: "aide_review",
    scope: details.scope || undefined,
    severity: normalizeGovernanceSeverity(details.severity || "L2"),
    capability: details.capability || "investigation",
    storyPath: details.storyPath || null,
    sourceRole: details.sourceRole || null,
    note: details.note || "",
    routeTarget: details.routeTarget || null,
    issueType: details.issueType || null,
    decisions: normalizeStringList(details.decisions),
    wrongAssumptions: normalizeStringList(details.wrongAssumptions),
    writebackCandidates: Array.isArray(details.writebackCandidates) ? details.writebackCandidates : []
  });
}

function recordArchitectRetrospective(state, storyPath, message) {
  const structured = extractStructuredResult(message) || {};
  const decisions = normalizeStringList(structured.key_decisions);
  const wrongAssumptions = normalizeStringList(structured.wrong_assumptions);
  const tradeoffs = normalizeStringList(structured.technical_tradeoffs);
  const candidates = normalizeWritebackCandidates(message);

  upsertSessionRetrospective(state, storyPath, {
    id: `session-retrospective:architect:${storyPath || "current-task"}`,
    trigger: "architect_review",
    role: "architect",
    note: `Architect review captured${decisions.length > 0 ? ` decisions: ${decisions.slice(0, 2).join("; ")}` : ""}${
      wrongAssumptions.length > 0 ? `. Wrong assumptions: ${wrongAssumptions.slice(0, 2).join("; ")}` : ""
    }`,
    categories: Array.from(new Set(candidates.map((item) => item.capability))),
    decisions,
    wrongAssumptions,
    tradeoffs
  });

  if (candidates.length === 0) {
    return;
  }

  upsertAideReview(state, {
    issueKey: `architect:${storyPath || "current-task"}`,
    storyPath,
    sourceRole: "architect",
    capability: preferredGovernanceCapability(candidates, "investigation"),
    severity: highestGovernanceSeverity(candidates.map((item) => item.severity), "L2"),
    issueType: "role_learning",
    routeTarget: "/Aide writeback",
    note: `Architect completed with ${candidates.length} writeback candidate(s). Review the shared workflow before the next similar task.`,
    decisions,
    wrongAssumptions,
    writebackCandidates: candidates
  });
}

function reviewCapabilityForProductResult(candidates = [], openGaps = []) {
  if (openGaps.length > 0) {
    return "investigation";
  }

  if (candidates.length > 0) {
    return "writeback";
  }

  return "audit";
}

function reviewSeverityForProductResult(candidates = [], openGaps = [], memoryUpdates, templateChanges) {
  if (openGaps.length > 0) {
    return "L2";
  }

  if (candidates.length >= 2) {
    return "L3";
  }

  if (
    candidates.length > 0 ||
    templateChanges.length > 0 ||
    memoryUpdates.userPreferences.length > 0 ||
    memoryUpdates.repoPreferences.length > 0
  ) {
    return "L1";
  }

  return "L1";
}

function recordProductAssistantReview(state, storyPath, status, message) {
  const memoryUpdates = normalizeProductMemoryUpdates(message);
  const templateChanges = normalizeProductTemplateChanges(message);
  const openGaps = normalizeProductOpenGaps(message);
  const candidates = normalizeProductEvolutionCandidates(message);

  if (status === "blocked") {
    upsertPendingAction(state, {
      id: `blocked-review:product:${storyPath || "current-task"}`,
      type: "blocked_review",
      phase: "product_assistant",
      storyPath,
      note: "Recent product_assistant blockage detected. Review the missing context or route before continuing."
    });

    upsertAideReview(state, {
      issueKey: `blocked:product:${storyPath || "current-task"}`,
      storyPath,
      sourceRole: "product_assistant",
      capability: "investigation",
      severity: "L2",
      issueType: "workflow_break",
      routeTarget: "/Aide investigate",
      note: "A product_assistant task blocked. Review the chat record to decide whether the user input was incomplete, the task was misunderstood, or the route should switch to coding."
    });
    return;
  }

  const shouldReview =
    templateChanges.length > 0 ||
    memoryUpdates.userPreferences.length > 0 ||
    memoryUpdates.repoPreferences.length > 0 ||
    candidates.length > 0 ||
    openGaps.length > 0;

  if (!shouldReview) {
    return;
  }

  const noteParts = [];
  if (templateChanges.length > 0) {
    noteParts.push(
      `template changes: ${templateChanges
        .slice(0, 2)
        .map((item) => item.path || item.id || "template-update")
        .join(", ")}`
    );
  }
  if (memoryUpdates.userPreferences.length > 0 || memoryUpdates.repoPreferences.length > 0) {
    noteParts.push("memory updates proposed");
  }
  if (candidates.length > 0) {
    noteParts.push(`evolution candidates: ${candidates.map((item) => item.category).slice(0, 3).join(", ")}`);
  }
  if (openGaps.length > 0) {
    noteParts.push(`open gaps: ${openGaps.slice(0, 2).join("; ")}`);
  }

  upsertAideReview(state, {
    issueKey: `product-review:${storyPath || "current-task"}`,
    storyPath,
    sourceRole: "product_assistant",
    capability: reviewCapabilityForProductResult(candidates, openGaps),
    severity: reviewSeverityForProductResult(candidates, openGaps, memoryUpdates, templateChanges),
    issueType: "product_review",
    routeTarget: "/Aide review",
    note: `Review the completed product_assistant result against the chat record before accepting long-term writeback${noteParts.length > 0 ? ` (${noteParts.join("; ")})` : ""}.`
  });
}

function currentTaskLabel(profile, storyPath) {
  return String(profile.task || "").trim() || (storyPath ? basenameLabel(storyPath) : "current-task");
}

function hasHotTaskState(state, storyPath) {
  const hasPending = state.pendingActions.some((item) => {
    if (item.type !== "run_qc" && item.type !== "run_submit" && item.type !== "blocked_review" && item.type !== "session_retrospective") {
      return false;
    }

    if (storyPath) {
      return item.storyPath === storyPath;
    }

    return !item.storyPath;
  });

  return hasPending || Boolean(state.sessionContext.lastReminderText);
}

function hasOutstandingCompletionWork(state, storyPath) {
  return state.pendingActions.some((item) => {
    if (item.type !== "run_qc" && item.type !== "run_submit" && item.type !== "blocked_review") {
      return false;
    }

    if (storyPath) {
      return item.storyPath === storyPath;
    }

    return !item.storyPath;
  });
}

function upsertCompletedTask(state, entry) {
  const index = state.completedTasks.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    state.completedTasks[index] = {
      ...state.completedTasks[index],
      ...entry
    };
    return;
  }

  state.completedTasks.push(entry);
}

function clearHotTaskState(state, storyPath, profile, message) {
  removePendingActions(state, (item) => {
    if (item.type !== "run_qc" && item.type !== "run_submit" && item.type !== "blocked_review" && item.type !== "session_retrospective") {
      return false;
    }

    if (storyPath) {
      return item.storyPath === storyPath;
    }

    return !item.storyPath;
  });

  state.sessionContext.lastReminderText = "";

  upsertCompletedTask(state, {
    id: storyPath ? `story:${storyPath}` : `task:${currentTaskLabel(profile, storyPath)}`,
    task: currentTaskLabel(profile, storyPath),
    storyPath,
    deliveryMode: profile.deliveryMode || null,
    completedAt: new Date().toISOString(),
    summary: compactText(message || profile.routeRationale || currentTaskLabel(profile, storyPath), 160)
  });
}

function shouldCompressCompletedTask(profile, state, storyPath, message) {
  if (hasOutstandingCompletionWork(state, storyPath)) {
    return false;
  }

  const taskStatus = String(profile.taskStatus || "").toLowerCase();

  if (taskStatus === "done") {
    return storyPath ? true : hasHotTaskState(state, storyPath);
  }

  if (taskStatus === "idle") {
    return storyPath ? hasHotTaskState(state, storyPath) : false;
  }

  if (isTaskSettled(profile)) {
    return true;
  }

  return detectTaskCompletionMessage(message);
}

function resolveQcPhaseForMetrics(state, message, storyPath) {
  const explicit = detectQcPhase(message);
  if (explicit === "tester" || explicit === "coder") {
    return explicit;
  }

  const queued = state.pendingActions
    .filter((item) => item.type === "run_qc" && (!storyPath || item.storyPath === storyPath))
    .slice(-1)[0];

  if (queued?.phase === "tester" || queued?.phase === "coder") {
    return queued.phase;
  }

  return "manual";
}

function recordQcMetrics(state, storyPath, message, verdict, categories = []) {
  const phase = resolveQcPhaseForMetrics(state, message, storyPath);
  const bucket = state.qualityMetrics.qcByPhase[phase] || { runs: 0, passes: 0, fails: 0 };

  state.qualityMetrics.qcRuns += 1;
  bucket.runs += 1;

  if (verdict === "pass") {
    state.qualityMetrics.qcPasses += 1;
    bucket.passes += 1;
  } else {
    state.qualityMetrics.qcFails += 1;
    bucket.fails += 1;
  }

  state.qualityMetrics.qcByPhase[phase] = bucket;

  for (const category of categories) {
    state.qualityMetrics.failureCategoryCounts[category] =
      (state.qualityMetrics.failureCategoryCounts[category] || 0) + 1;
  }

  state.qualityMetrics.recentQcRuns.push({
    timestamp: new Date().toISOString(),
    storyPath,
    phase,
    verdict,
    categories
  });
}

function matchesStoryScope(itemStoryPath, storyPath) {
  if (storyPath) {
    return !itemStoryPath || itemStoryPath === storyPath;
  }

  return !itemStoryPath;
}

function isAmbiguousStoryScope(activeStories, storyPath) {
  return Array.isArray(activeStories) && activeStories.length > 1 && !storyPath;
}

function clearAmbiguousBlockedSignals(state, role) {
  removePendingActions(state, (item) => {
    if (item.type === "blocked_review") {
      return item.phase === role && item.scope === "ambiguous";
    }

    if (item.type === "aide_review") {
      return item.sourceRole === role && item.scope === "ambiguous";
    }

    return false;
  });
}

function hasAmbiguousBlockedSignals(state, role) {
  return state.pendingActions.some((item) => {
    if (item.type === "blocked_review") {
      return item.phase === role && item.scope === "ambiguous";
    }

    if (item.type === "aide_review") {
      return item.sourceRole === role && item.scope === "ambiguous";
    }

    return false;
  });
}

function shouldQueueByPolicy(deliveryPolicy, trigger) {
  if (!trigger) {
    return true;
  }

  return deliveryPolicy?.submit?.queue_after?.[trigger] !== false;
}

function queueSubmit(state, storyPath, note, trigger) {
  upsertPendingAction(state, {
    id: `run-submit:${storyPath || "current-task"}`,
    type: "run_submit",
    storyPath,
    trigger,
    note
  });
}

function submitLooksReady(profile, message) {
  return isTaskSettled(profile) || detectTaskCompletionMessage(message);
}

function shouldQueueSubmitAfterCompletion(role, profile, message, deliveryPolicy) {
  if (!isSubmitEnabled(profile, deliveryPolicy)) {
    return false;
  }

  if (role === "coder") {
    return shouldQueueByPolicy(deliveryPolicy, "coder_complete_without_qc");
  }

  return submitLooksReady(profile, message) && shouldQueueByPolicy(deliveryPolicy, "task_settled_without_qc");
}

function shouldQueueSubmitAfterQc(state, storyPath, profile, message, deliveryPolicy) {
  if (!isSubmitEnabled(profile, deliveryPolicy)) {
    return false;
  }

  const phase = resolveQcPhaseForMetrics(state, message, storyPath);
  if (phase === "coder") {
    return shouldQueueByPolicy(deliveryPolicy, "qc_pass_after_coder");
  }

  return submitLooksReady(profile, message) && shouldQueueByPolicy(deliveryPolicy, "task_settled_after_qc");
}

function maybeQueueSubmitForSettledTask(state, storyPath, profile, message, deliveryPolicy) {
  if (!isSubmitEnabled(profile, deliveryPolicy)) {
    return;
  }

  if (isQcEnabled(profile) && !detectQcPass(message)) {
    return;
  }

  const trigger = detectQcPass(message) ? "task_settled_after_qc" : "task_settled_without_qc";
  if (!shouldQueueByPolicy(deliveryPolicy, trigger)) {
    return;
  }

  queueSubmit(state, storyPath, "Task is settled and ready for governed delivery. Run /submit.", trigger);
}

function processQcOutcome(state, storyPath, profile, message, deliveryPolicy) {
  if (detectQcPass(message)) {
    recordQcMetrics(state, storyPath, message, "pass");

    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesStoryScope(item.storyPath, storyPath)
    );
    removePendingActions(
      state,
      (item) => item.type === "blocked_review" && item.scope !== "ambiguous" && matchesStoryScope(item.storyPath, storyPath)
    );

    if (shouldQueueSubmitAfterQc(state, storyPath, profile, message, deliveryPolicy)) {
      queueSubmit(
        state,
        storyPath,
        "QC passed for a deliverable handoff. Run /submit.",
        "qc_pass_after_coder"
      );
    }

    if (storyPath) {
      const queuedForStory = state.learningQueue.filter(
        (item) => item.status === "queued" && (item.source || "unknown") === storyPath
      );

      if (queuedForStory.length > 0 && isLongRunningProfile(profile)) {
        upsertSessionRetrospective(state, storyPath, {
          trigger: "qc_pass_after_retries",
          categories: Array.from(new Set(queuedForStory.map((item) => item.category))),
          note: `QC passed for ${basenameLabel(storyPath)}, but queued lesson candidates remain. Decide in the retrospective which ones should route through /Aide.`
        });
      }
    }
  }

  if (detectQcFail(message)) {
    const categories = detectFailureCategories(message);
    const escalatedCategories = [];
    recordQcMetrics(state, storyPath, message, "fail", categories);

    removePendingActions(
      state,
      (item) => item.type === "run_qc" && matchesStoryScope(item.storyPath, storyPath)
    );
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
    );

    if (storyPath) {
      for (const category of categories) {
        const key = `${storyPath}::${category}`;
        const existing = state.failurePatterns[key] || {
          source: storyPath,
          category,
          count: 0,
          firstSeenAt: new Date().toISOString()
        };

        existing.count += 1;
        existing.lastSeenAt = new Date().toISOString();
        state.failurePatterns[key] = existing;

        if (existing.count >= 2) {
          escalatedCategories.push({
            category,
            triggerCount: existing.count
          });
          upsertLearningQueueItem(state, {
            id: toLessonId(storyPath, category),
            source: storyPath,
            category,
            triggerCount: existing.count,
            suggestedRoute: suggestedRoutesForCategory(category),
            lesson: lessonForCategory(category),
            status: "queued"
          });
        }
      }

      if (escalatedCategories.length > 0) {
        upsertAideReview(state, {
          issueKey: `qc-pattern:${storyPath || "current-task"}`,
          storyPath,
          sourceRole: "qc",
          capability: "audit",
          severity: highestGovernanceSeverity(
            escalatedCategories.map((item) => governanceSeverityForRetryCount(item.triggerCount)),
            "L3"
          ),
          issueType: "workflow_break",
          routeTarget: "/Aide audit",
          note: `Repeated QC failure categories detected: ${escalatedCategories
            .map((item) => `${item.category} x${item.triggerCount}`)
            .join(", ")}. Review shared prompts and handoff rules instead of only patching the latest output.`
        });
      }

      if (categories.length > 0 && isLongRunningProfile(profile)) {
        upsertSessionRetrospective(state, storyPath, {
          trigger: "qc_failure",
          categories,
          note: `QC failure categories detected for ${basenameLabel(storyPath)}. Capture the wrong assumption, the corrective decision, and whether any lesson is durable enough for /Aide.`
        });
      }
    }
  }
}

function processSubmitOutcome(state, storyPath, profile, message, status) {
  if (status === "complete") {
    removePendingActions(
      state,
      (item) => item.type === "run_submit" && matchesStoryScope(item.storyPath, storyPath)
    );
    removePendingActions(
      state,
      (item) => item.type === "blocked_review" && item.phase === "submit" && matchesStoryScope(item.storyPath, storyPath)
    );

    if (shouldCompressCompletedTask(profile, state, storyPath, message)) {
      clearHotTaskState(state, storyPath, profile, message);
    }
    return;
  }

  if (status === "blocked") {
    upsertPendingAction(state, {
      id: `blocked-review:submit:${storyPath || "current-task"}`,
      type: "blocked_review",
      phase: "submit",
      storyPath,
      note: "Governed delivery blocked. Review the submit report before continuing."
    });

    upsertAideReview(state, {
      issueKey: `blocked:submit:${storyPath || "current-task"}`,
      storyPath,
      sourceRole: "submit",
      capability: "investigation",
      severity: "L2",
      issueType: "workflow_break",
      routeTarget: "/Aide investigate",
      note: "A submit step blocked the delivery flow. Review branch policy, remotes, permissions, or delivery configuration."
    });
  }
}

function recordSubagentResult(input, state, activeStories, projectDir, profile, deliveryPolicy) {
  const message = normalizeMessage(input);
  const role = normalizeRole(input, message);
  const status = normalizeStatus(input, role, message);
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;
  const ambiguousStoryScope = isAmbiguousStoryScope(activeStories, storyPath);
  const isAmbiguousBlockedScope = (role === "tester" || role === "coder") && ambiguousStoryScope && status === "blocked";
  const canResolveAmbiguousSignals =
    (role === "tester" || role === "coder") &&
    Boolean(storyPath) &&
    (status === "complete" || status === "blocked") &&
    hasAmbiguousBlockedSignals(state, role);

  state.recentSubagentEvents.push({
    timestamp: new Date().toISOString(),
    agentType: role,
    status,
    storyPath,
    summary: compactText(message, 120)
  });

  if (canResolveAmbiguousSignals) {
    clearAmbiguousBlockedSignals(state, role);
  }

  if ((role === "tester" || role === "coder") && ambiguousStoryScope && status !== "blocked") {
    return;
  }

  if ((role === "tester" || role === "coder") && status === "complete" && isQcEnabled(profile)) {
    upsertPendingAction(state, {
      id: `run-qc:${role}:${storyPath || "current-task"}`,
      type: "run_qc",
      phase: role,
      storyPath,
      note: `Recent ${role} completion detected. Run /qc --phase=${role}.`
    });
  }

  if ((role === "tester" || role === "coder") && status === "complete") {
    removePendingActions(
      state,
      (item) =>
        item.type === "blocked_review" &&
        item.phase === role &&
        item.scope !== "ambiguous" &&
        matchesStoryScope(item.storyPath, storyPath)
    );
  }

  if ((role === "tester" || role === "coder") && status === "complete" && !isQcEnabled(profile)) {
    removePendingActions(
      state,
      (item) => item.type === "run_qc" && item.phase === role && matchesStoryScope(item.storyPath, storyPath)
    );
    if (shouldQueueSubmitAfterCompletion(role, profile, message, deliveryPolicy)) {
      queueSubmit(
        state,
        storyPath,
        `Recent ${role} completion detected. Run /submit.`,
        role === "coder" ? "coder_complete_without_qc" : "task_settled_without_qc"
      );
    }
  }

  if ((role === "tester" || role === "coder") && status === "blocked") {
    const blockedScopeLabel = isAmbiguousBlockedScope ? "ambiguous-story-scope" : storyPath || "current-task";
    const blockedNote = isAmbiguousBlockedScope
      ? `Recent ${role} blockage detected, but the active story is ambiguous. Resolve story ownership (cwd/worktree/branch or story_path) before resuming.`
      : `Recent ${role} blockage detected. Review structured handoff before continuing.`;
    const reviewNote = isAmbiguousBlockedScope
      ? `A ${role} handoff blocked while multiple active stories were unresolved. Investigate story ownership first, then route fixes to the correct plan.`
      : `A ${role} handoff blocked the workflow. Investigate whether the issue comes from routing, role boundaries, or missing shared guidance.`;

    upsertPendingAction(state, {
      id: `blocked-review:${role}:${blockedScopeLabel}`,
      type: "blocked_review",
      phase: role,
      storyPath,
      scope: isAmbiguousBlockedScope ? "ambiguous" : undefined,
      note: blockedNote
    });
    if (storyPath && isLongRunningProfile(profile)) {
      upsertSessionRetrospective(state, storyPath, {
        trigger: "blocked",
        phase: role,
        note: `Before pausing ${basenameLabel(storyPath)}, capture attempted fixes, the broken assumption, and whether shared workflow docs need updates.`
      });
    }

    upsertAideReview(state, {
      issueKey: `blocked:${role}:${blockedScopeLabel}`,
      storyPath,
      scope: isAmbiguousBlockedScope ? "ambiguous" : undefined,
      sourceRole: role,
      capability: "investigation",
      severity: "L3",
      issueType: "workflow_break",
      routeTarget: "/Aide investigate",
      note: reviewNote
    });
  }

  if (role === "product_assistant" && (status === "complete" || status === "blocked")) {
    recordProductAssistantReview(state, storyPath, status, message);
  }

  if (role === "architect" && status === "complete") {
    recordArchitectRetrospective(state, storyPath, message);
  }

  if (role === "qc") {
    processQcOutcome(state, storyPath, profile, message, deliveryPolicy);
  }

  if (role === "submit") {
    processSubmitOutcome(state, storyPath, profile, message, status);
  }
}

function recordSessionEnd(input, state, activeStories, projectDir, profile, deliveryPolicy) {
  const message = normalizeMessage(input);
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;

  if (storyPath && isLongRunningProfile(profile)) {
    upsertSessionRetrospective(state, storyPath, {
      trigger: "session_close",
      note: `Session paused around ${basenameLabel(storyPath)}. Capture key decisions, broken assumptions, and whether any queued lesson should write back through /Aide.`
    });
  }

  processQcOutcome(state, storyPath, profile, message, deliveryPolicy);
  maybeQueueSubmitForSettledTask(state, storyPath, profile, message, deliveryPolicy);

  if (shouldCompressCompletedTask(profile, state, storyPath, message)) {
    clearHotTaskState(state, storyPath, profile, message);
  }
}

function recordTaskSettled(input, state, activeStories, projectDir, profile, deliveryPolicy) {
  const message = normalizeMessage(input) || `Task status: ${String(input.task_status || input.status || "done")}`;
  const activeStory = resolveActiveStory(activeStories, input, projectDir);
  const storyPath = activeStory?.storyPath || null;

  if (storyPath && isLongRunningProfile(profile)) {
    upsertSessionRetrospective(state, storyPath, {
      trigger: "task_settled",
      note: `Task settled for ${basenameLabel(storyPath)}. Before archival, capture durable decisions, wrong assumptions, and whether any lesson should route through /Aide.`
    });
  }

  processQcOutcome(state, storyPath, profile, message, deliveryPolicy);
  maybeQueueSubmitForSettledTask(state, storyPath, profile, message, deliveryPolicy);

  if (shouldCompressCompletedTask(profile, state, storyPath, message)) {
    clearHotTaskState(state, storyPath, profile, message);
  }
}

async function main() {
  try {
    const input = await readJsonStdin({ strict: true });
    const eventName = normalizeEventName(input);
    if (!eventName) {
      return;
    }

    if (eventName !== "subagent_result" && eventName !== "session_end" && eventName !== "task_settled") {
      throw new Error(
        `Unsupported event "${eventName}". Supported events: subagent_result, session_end, task_settled.`
      );
    }

    const projectDir = getProjectDir(input);
    const progressPath = findProgressFile(input.cwd || projectDir) || findProgressFile(projectDir);
    const activeStories = parseActiveStories(progressPath);
    const state = loadRuntimeState(projectDir);
    const profile = loadProjectProfileState(projectDir);
    const deliveryPolicy = loadDeliveryPolicy(projectDir);

    if (eventName === "subagent_result") {
      recordSubagentResult(input, state, activeStories, projectDir, profile, deliveryPolicy);
    } else if (eventName === "session_end") {
      recordSessionEnd(input, state, activeStories, projectDir, profile, deliveryPolicy);
    } else if (eventName === "task_settled") {
      recordTaskSettled(input, state, activeStories, projectDir, profile, deliveryPolicy);
    }

    trimRuntimeState(state);
    saveRuntimeState(projectDir, state);
    syncTaskRegistry(projectDir, {
      profile,
      runtimeState: state,
      progressPath
    });
    syncProgressFromState(progressPath, activeStories, state);
  } catch (error) {
    process.stderr.write(`runtime-state error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

await main();
