#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  compareGovernanceSeverity,
  compactText,
  getProjectContext,
  highestGovernanceSeverity,
  logRuntimeFileWrite,
  loadEvolutionRegistry,
  loadProjectProfileState,
  loadRuntimeState,
  listTaskRegistryTasks,
  normalizeGovernanceSeverity,
  readJsonStdinEnvelope,
  saveEvolutionRegistry,
  startRuntimeInvocationLogging,
  syncTaskRegistry
} from "./runtime-utils.mjs";

function candidateTimestamp(item) {
  return new Date(item?.updatedAt || item?.lastSeenAt || item?.createdAt || 0).getTime();
}

function reviewTimestamp(item) {
  return new Date(item?.checkedAt || item?.updatedAt || item?.completedAt || 0).getTime();
}

function createDefaultPolicy() {
  return {
    version: 1,
    auto_apply: {
      enabled: true,
      min_trigger_count: 2,
      allowed_targets: [".codex/agents/tester.toml", ".codex/agents/coder.toml"]
    },
    categories: {}
  };
}

function loadEvolutionPolicy(projectDir) {
  const policyPath = path.join(projectDir, ".codex", "policies", "evolution-policy.json");
  const fallback = createDefaultPolicy();

  if (!fs.existsSync(policyPath)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    return {
      ...fallback,
      ...parsed,
      auto_apply: {
        ...fallback.auto_apply,
        ...(parsed.auto_apply || {})
      },
      categories: parsed.categories && typeof parsed.categories === "object" ? parsed.categories : {}
    };
  } catch {
    return fallback;
  }
}

function buildAideReviewCandidate(item) {
  return {
    id: `aide-review:${item.id}`,
    sourceType: "aide_review",
    status: "queued",
    severity: normalizeGovernanceSeverity(item.severity || "L2"),
    capability: String(item.capability || "investigation").trim().toLowerCase() || "investigation",
    taskId: item.taskId || null,
    planPath: item.planPath || null,
    taskTitle: null,
    routeTarget: item.routeTarget || null,
    signalIds: [item.id],
    summary: compactText(item.note || "Pending Aide review.", 160)
  };
}

function buildLearningQueueCandidate(item) {
  const triggerCount = Number.isFinite(item.triggerCount) ? item.triggerCount : 0;
  const routeTarget = Array.isArray(item.suggestedRoute)
    ? item.suggestedRoute.join(", ")
    : String(item.suggestedRoute || "").trim() || null;

  return {
    id: `learning-queue:${item.id}`,
    sourceType: "learning_queue",
    status: "queued",
    severity: triggerCount >= 4 ? "L4" : triggerCount >= 2 ? "L3" : "L2",
    capability: "writeback",
    taskId: item.taskId || item.source || null,
    planPath: item.planPath || null,
    taskTitle: null,
    routeTarget,
    category: item.category || null,
    triggerCount,
    lesson: item.lesson || "",
    signalIds: [item.id],
    summary: compactText(
      `Queued lesson candidate: ${item.category || "unknown"} x${triggerCount || 1}. ${item.lesson || ""}`,
      160
    )
  };
}

function relatedSignalsForTask(task, candidates) {
  if (task.id) {
    return candidates.filter((item) => item.taskId === task.id);
  }

  return candidates.filter((item) => item.sourceType === "aide_review" && !item.taskId);
}

function upsertCandidate(registry, entry, now) {
  const index = registry.candidates.findIndex((item) => item.id === entry.id);

  if (index >= 0) {
    const existingStatus = registry.candidates[index].status || "queued";
    const incomingStatus = entry.status || existingStatus || "queued";
    const preservedStatus =
      (existingStatus === "applied" || existingStatus === "failed") && incomingStatus === "queued"
        ? existingStatus
        : incomingStatus;

    registry.candidates[index] = {
      ...registry.candidates[index],
      ...entry,
      status: preservedStatus,
      updatedAt: now,
      lastSeenAt: now
    };
    return;
  }

  registry.candidates.push({
    ...entry,
    status: entry.status || "queued",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now
  });
}

function resolveStaleCandidates(registry, activeCandidateIds, now) {
  registry.candidates = registry.candidates.map((item) => {
    if (activeCandidateIds.has(item.id)) {
      return item;
    }

    if (item.status === "resolved" || item.status === "applied" || item.status === "failed") {
      return item;
    }

    return {
      ...item,
      status: "resolved",
      resolvedAt: item.resolvedAt || now,
      updatedAt: now
    };
  });
}

function reviewedSettledTaskKey(task) {
  return `${task.id}:${task.completedAt || "unknown"}`;
}

function hasSettledTaskReview(registry, task) {
  const taskKey = reviewedSettledTaskKey(task);
  return registry.settledTaskReviews.some((item) => item.taskKey === taskKey);
}

function upsertSettledTaskReview(registry, entry) {
  const index = registry.settledTaskReviews.findIndex((item) => item.taskKey === entry.taskKey);
  if (index >= 0) {
    registry.settledTaskReviews[index] = {
      ...registry.settledTaskReviews[index],
      ...entry
    };
    return;
  }

  registry.settledTaskReviews.push(entry);
}

function policyForCategory(policy, category) {
  if (!category || !policy?.categories || typeof policy.categories !== "object") {
    return null;
  }

  const match = policy.categories[category];
  return match && typeof match === "object" ? match : null;
}

function insertGuidanceIntoAgentToml(text, guidance) {
  if (!guidance || text.includes(guidance)) {
    return {
      changed: false,
      text,
      result: "already-present"
    };
  }

  const anchor = "End every final report";
  const anchorIndex = text.indexOf(anchor);

  if (anchorIndex >= 0) {
    const before = text.slice(0, anchorIndex);
    const after = text.slice(anchorIndex);
    return {
      changed: true,
      text: `${before}${guidance}\n\n${after}`,
      result: "inserted-before-structured-result"
    };
  }

  const fallbackAnchor = '\n"""';
  const fallbackIndex = text.lastIndexOf(fallbackAnchor);
  if (fallbackIndex >= 0) {
    const before = text.slice(0, fallbackIndex);
    const after = text.slice(fallbackIndex);
    return {
      changed: true,
      text: `${before}\n${guidance}${after}`,
      result: "inserted-before-developer-instructions-close"
    };
  }

  return {
    changed: false,
    text,
    result: "missing-anchor"
  };
}

function applyGuidanceWriteback(projectDir, target, guidance) {
  const baseDir = path.resolve(projectDir);
  const targetPath = path.resolve(projectDir, String(target || ""));
  const relativeToProject = path.relative(baseDir, targetPath);
  if (relativeToProject.startsWith("..") || path.isAbsolute(relativeToProject)) {
    return {
      ok: false,
      result: "target-outside-project"
    };
  }

  if (!fs.existsSync(targetPath)) {
    return {
      ok: false,
      result: "missing-target"
    };
  }

  const original = fs.readFileSync(targetPath, "utf8");
  const inserted = insertGuidanceIntoAgentToml(original, guidance);

  if (inserted.result === "missing-anchor") {
    return {
      ok: false,
      result: inserted.result
    };
  }

  if (inserted.changed) {
    fs.writeFileSync(targetPath, inserted.text, "utf8");
    logRuntimeFileWrite(projectDir, targetPath, inserted.text, {
      category: "automation_writeback",
      writer: "applyGuidanceWriteback",
      format: "text",
      result: inserted.result
    });
  }

  return {
    ok: true,
    result: inserted.result
  };
}

function enrichLearningCandidateFromPolicy(candidate, policy) {
  if (candidate.sourceType !== "learning_queue") {
    return candidate;
  }

  const categoryPolicy = policyForCategory(policy, candidate.category);
  const minTriggerCount = Number.parseInt(String(policy?.auto_apply?.min_trigger_count || "2"), 10) || 2;
  const allowedTargets = Array.isArray(policy?.auto_apply?.allowed_targets)
    ? policy.auto_apply.allowed_targets
    : [];
  const autoApplyEnabled = Boolean(policy?.auto_apply?.enabled);
  const target = categoryPolicy?.target || candidate.routeTarget || null;
  const canAutoApply =
    autoApplyEnabled &&
    categoryPolicy?.mode === "append_guidance" &&
    candidate.triggerCount >= minTriggerCount &&
    allowedTargets.includes(target);

  return {
    ...candidate,
    routeTarget: target,
    automation: {
      target,
      mode: categoryPolicy?.mode || null,
      guidance: categoryPolicy?.guidance || null,
      decision: canAutoApply ? "auto_apply" : "queue_review"
    }
  };
}

function applyAutomaticWritebacks(projectDir, registry, now) {
  let appliedCount = 0;

  registry.candidates = registry.candidates.map((item) => {
    if (item.status !== "queued") {
      return item;
    }

    if (item.automation?.decision !== "auto_apply") {
      return item;
    }

    if (item.automation?.mode !== "append_guidance" || !item.automation?.target || !item.automation?.guidance) {
      return {
        ...item,
        status: "failed",
        updatedAt: now,
        failedAt: now,
        failureReason: "invalid-automation-payload"
      };
    }

    const writeback = applyGuidanceWriteback(projectDir, item.automation.target, item.automation.guidance);
    if (!writeback.ok) {
      return {
        ...item,
        status: "failed",
        updatedAt: now,
        failedAt: now,
        failureReason: writeback.result
      };
    }

    appliedCount += 1;
    return {
      ...item,
      status: "applied",
      updatedAt: now,
      appliedAt: now,
      applyResult: writeback.result,
      summary: compactText(`${item.summary} Auto-applied to ${item.automation.target}.`, 160)
    };
  });

  return appliedCount;
}

function sortAndTrimRegistry(registry) {
  registry.candidates.sort((left, right) => {
    const statusWeight = (value) => {
      if (value === "queued") return 0;
      if (value === "failed") return 1;
      if (value === "applied") return 2;
      return 3;
    };

    if (left.status !== right.status) {
      return statusWeight(left.status) - statusWeight(right.status);
    }

    const severityOrder = compareGovernanceSeverity(left.severity, right.severity);
    if (severityOrder !== 0) {
      return severityOrder;
    }

    return candidateTimestamp(right) - candidateTimestamp(left);
  });
  registry.candidates = registry.candidates.slice(0, 40);

  registry.settledTaskReviews.sort((left, right) => reviewTimestamp(right) - reviewTimestamp(left));
  registry.settledTaskReviews = registry.settledTaskReviews.slice(0, 100);
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "aide-evolution.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const now = new Date().toISOString();
    const trigger = String(input.trigger || "startup").trim().toLowerCase() || "startup";
    const background = Boolean(input.background);
    const quiet = Boolean(input.quiet);
    const policy = loadEvolutionPolicy(projectDir);
    const profile = loadProjectProfileState(projectDir);
    const runtimeState = loadRuntimeState(projectDir);
    const taskRegistry = syncTaskRegistry(projectDir, {
      profile,
      runtimeState
    });
    const evolutionRegistry = loadEvolutionRegistry(projectDir);
    const existingCandidateMap = new Map(
      (Array.isArray(evolutionRegistry.candidates) ? evolutionRegistry.candidates : []).map((item) => [item.id, item])
    );

    const pendingAideReviews = (Array.isArray(runtimeState.pendingActions) ? runtimeState.pendingActions : []).filter(
      (item) => item.type === "aide_review"
    );
    const queuedLessons = (Array.isArray(runtimeState.learningQueue) ? runtimeState.learningQueue : []).filter(
      (item) => String(item.status || "queued").trim().toLowerCase() === "queued"
    );

    const activeCandidates = [
      ...pendingAideReviews.map(buildAideReviewCandidate),
      ...queuedLessons.map(buildLearningQueueCandidate).map((item) => enrichLearningCandidateFromPolicy(item, policy))
    ].filter((item) => existingCandidateMap.get(item.id)?.status !== "applied");
    const activeCandidateIds = new Set(activeCandidates.map((item) => item.id));

    activeCandidates.forEach((entry) => {
      upsertCandidate(evolutionRegistry, entry, now);
    });

    const settledTasks = listTaskRegistryTasks(taskRegistry, (task) => {
      const status = String(task.status || "").trim().toLowerCase();
      return status === "done" || status === "cancelled";
    });

    let reviewedSettledTaskCount = 0;
    let newTaskCandidates = 0;

    for (const task of settledTasks) {
      if (hasSettledTaskReview(evolutionRegistry, task)) {
        continue;
      }

      const relatedSignals = relatedSignalsForTask(task, activeCandidates);
      const relatedSignalIds = relatedSignals.flatMap((item) => item.signalIds || []);
      const taskCandidateCount = relatedSignals.length;
      const outcome = taskCandidateCount > 0 ? "signals-present" : "no-candidates";
      const note =
        outcome === "signals-present"
          ? `Settled task still has ${taskCandidateCount} governance signal(s) worth reviewing before archival.`
          : "Settled task reviewed with no durable evolution signal.";

      upsertSettledTaskReview(evolutionRegistry, {
        taskKey: reviewedSettledTaskKey(task),
        taskId: task.id,
        taskTitle: task.title || "Untitled task",
        taskStatus: task.status || "done",
        planPath: task.planPath || null,
        completedAt: task.completedAt || null,
        checkedAt: now,
        trigger,
        outcome,
        candidateCount: taskCandidateCount,
        signalIds: relatedSignalIds,
        note
      });
      reviewedSettledTaskCount += 1;

      if (taskCandidateCount === 0) {
        continue;
      }

      const routeTargets = Array.from(new Set(relatedSignals.map((item) => item.routeTarget).filter(Boolean)));
      const taskCandidate = {
        id: `task-settled:${task.id}`,
        sourceType: "task_settled",
        status: "queued",
        severity: highestGovernanceSeverity(
          relatedSignals.map((item) => item.severity),
          "L1"
        ),
        capability:
          relatedSignals.find((item) => item.capability === "writeback")?.capability ||
          relatedSignals.find((item) => item.capability === "audit")?.capability ||
          relatedSignals[0]?.capability ||
          "investigation",
        planPath: task.planPath || null,
        taskId: task.id,
        taskTitle: task.title || "Untitled task",
        routeTarget: routeTargets.join(", ") || "Aide review",
        signalIds: relatedSignalIds,
        summary: compactText(
          `Task settled: ${task.title || "Untitled task"}. Review whether ${taskCandidateCount} active governance signal(s) should write back before archival.`,
          160
        )
      };

      upsertCandidate(evolutionRegistry, taskCandidate, now);
      activeCandidateIds.add(taskCandidate.id);
      newTaskCandidates += 1;
    }

    const autoAppliedCount = applyAutomaticWritebacks(projectDir, evolutionRegistry, now);
    resolveStaleCandidates(evolutionRegistry, activeCandidateIds, now);
    sortAndTrimRegistry(evolutionRegistry);
    evolutionRegistry.lastSweep = {
      checkedAt: now,
      trigger,
      background,
      candidateCount: evolutionRegistry.candidates.filter((item) => item.status === "queued").length,
      settledTaskCount: reviewedSettledTaskCount,
      note:
        reviewedSettledTaskCount > 0
          ? `Reviewed ${reviewedSettledTaskCount} settled task(s); ${newTaskCandidates} new task-level candidate(s); ${autoAppliedCount} auto-applied writeback(s).`
          : `No newly settled tasks required review. Auto-applied writeback(s): ${autoAppliedCount}.`
    };
    evolutionRegistry.updatedAt = now;

    saveEvolutionRegistry(projectDir, evolutionRegistry);

    if (quiet) {
      logger.finalize({
        status: "ok",
        metadata: {
          trigger,
          quiet: true,
          queuedCandidateCount: evolutionRegistry.candidates.filter((item) => item.status === "queued").length,
          autoAppliedCount
        }
      });
      return;
    }

    const queuedCandidates = evolutionRegistry.candidates.filter((item) => item.status === "queued");
    const lines = [
      "Aide evolution sweep:",
      `- Trigger: ${trigger}`,
      `- Active candidates: ${queuedCandidates.length}`,
      `- Newly reviewed settled tasks: ${reviewedSettledTaskCount}`,
      `- Auto-applied writebacks: ${autoAppliedCount}`
    ];

    queuedCandidates.slice(0, 5).forEach((item) => {
      lines.push(`- [${item.severity}] ${item.summary}`);
    });

    process.stdout.write(`${lines.join("\n")}\n`);
    logger.finalize({
      status: "ok",
      metadata: {
        trigger,
        quiet: false,
        queuedCandidateCount: queuedCandidates.length,
        autoAppliedCount
      }
    });
  } catch (error) {
    process.stderr.write(`aide-evolution error: ${error instanceof Error ? error.message : String(error)}\n`);
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
