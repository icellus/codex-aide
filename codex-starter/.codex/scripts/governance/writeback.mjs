#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  compareGovernanceLevel,
  compactText,
  getProjectContext,
  highestGovernanceLevel,
  loadAideGovernancePolicy,
  logRuntimeFileWrite,
  loadGovernanceRegistry,
  loadProjectProfileState,
  loadRuntimeState,
  listTaskRegistryTasks,
  readJsonStdinEnvelope,
  saveGovernanceRegistry,
  startRuntimeInvocationLogging,
  syncTaskRegistry
} from "../runtime/index.mjs";

function candidateTimestamp(item) {
  return new Date(item?.updatedAt || item?.lastSeenAt || item?.createdAt || 0).getTime();
}

function reviewTimestamp(item) {
  return new Date(item?.checkedAt || item?.updatedAt || item?.completedAt || 0).getTime();
}

function normalizeGovernanceLevel(value, fallback = "G2") {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "G1" || normalized === "G2" || normalized === "G3" ? normalized : fallback;
}

function governanceDisposition(policy, level, fallback = "ask-user") {
  const normalizedLevel = normalizeGovernanceLevel(level);
  const defaults = policy?.default_disposition && typeof policy.default_disposition === "object"
    ? policy.default_disposition
    : {};
  return String(defaults[normalizedLevel] || fallback).trim() || fallback;
}

function authorityTargetForCandidate({ authorityTarget = null, planPath = null, fallback = "to-be-determined" } = {}) {
  return authorityTarget || planPath || fallback;
}

function createDefaultWritebackPolicy() {
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

function loadWritebackPolicy(projectDir) {
  const policyPath = path.join(projectDir, ".codex", "policies", "aide-writeback-policy.json");
  const fallback = createDefaultWritebackPolicy();

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

function buildGovernanceReviewCandidate(item, governancePolicy) {
  const governanceLevel = normalizeGovernanceLevel(item.level || "G2");
  const summary = compactText(item.issue || item.note || "Pending governance review.", 160);
  return {
    id: `governance-review:${item.id}`,
    sourceType: "governance_review",
    status: "queued",
    taskId: item.taskId || null,
    planPath: item.planPath || null,
    taskTitle: null,
    signalIds: [item.id],
    summary,
    issue: item.issue || summary,
    level: governanceLevel,
    impact: item.impact || "Governance follow-up required.",
    authority_target: authorityTargetForCandidate({
      authorityTarget:
        item.authority_target ||
        item.governance_candidates?.[0]?.authority_target ||
        null,
      planPath: item.planPath || null
    }),
    recommended_action: item.recommended_action || "review and decide next step",
    disposition: item.disposition || governanceDisposition(governancePolicy, governanceLevel),
    note: item.note || "",
    governance_candidates: Array.isArray(item.governance_candidates) ? item.governance_candidates : []
  };
}

function buildGovernanceQueueCandidate(item, governancePolicy) {
  const triggerCount = Number.isFinite(item.triggerCount) ? item.triggerCount : 0;
  const governanceLevel = normalizeGovernanceLevel(item.level || "G2");
  const summary = compactText(item.issue || `Queued governance item: ${item.category || "unknown"} x${triggerCount || 1}.`, 160);

  return {
    id: `governance-queue:${item.id}`,
    sourceType: "governance_queue",
    status: "queued",
    taskId: item.taskId || item.source || null,
    planPath: item.planPath || null,
    taskTitle: null,
    category: item.category || null,
    triggerCount,
    signalIds: [item.id],
    summary,
    issue: item.issue || summary,
    level: governanceLevel,
    impact: item.impact || `Governance queue item triggered ${triggerCount || 1} time(s).`,
    authority_target: authorityTargetForCandidate({
      authorityTarget: item.authority_target || null,
      planPath: item.planPath || null
    }),
    recommended_action: item.recommended_action || "review and decide next step",
    disposition: item.disposition || governanceDisposition(governancePolicy, governanceLevel, "queue"),
    note: item.note || item.recommended_action || ""
  };
}

function relatedSignalsForTask(task, candidates) {
  if (task.id) {
    return candidates.filter((item) => item.taskId === task.id);
  }

  return candidates.filter((item) => item.sourceType === "governance_review" && !item.taskId);
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

function enrichGovernanceCandidateFromPolicy(candidate, policy, governancePolicy) {
  if (candidate.sourceType !== "governance_queue") {
    return candidate;
  }

  const categoryPolicy = policyForCategory(policy, candidate.category);
  const minTriggerCount = Number.parseInt(String(policy?.auto_apply?.min_trigger_count || "2"), 10) || 2;
  const allowedTargets = Array.isArray(policy?.auto_apply?.allowed_targets)
    ? policy.auto_apply.allowed_targets
    : [];
  const autoApplyEnabled = Boolean(policy?.auto_apply?.enabled);
  const allowedGovernanceLevels = Array.isArray(governancePolicy?.auto_fix_levels)
    ? governancePolicy.auto_fix_levels.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
    : ["G1"];
  const target = categoryPolicy?.target || candidate.authority_target || null;
  const governanceLevel = normalizeGovernanceLevel(candidate.level || "G2");
  const canAutoApply =
    autoApplyEnabled &&
    categoryPolicy?.mode === "append_guidance" &&
    candidate.triggerCount >= minTriggerCount &&
    allowedTargets.includes(target) &&
    allowedGovernanceLevels.includes(governanceLevel);

  return {
    ...candidate,
    level: governanceLevel,
    authority_target: authorityTargetForCandidate({ authorityTarget: target, planPath: candidate.planPath || null }),
    disposition: governanceDisposition(governancePolicy, governanceLevel, "queue"),
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

    const levelOrder = compareGovernanceLevel(left.level, right.level);
    if (levelOrder !== 0) {
      return levelOrder;
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
    scriptName: "governance/writeback.mjs",
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
    const policy = loadWritebackPolicy(projectDir);
    const governancePolicy = loadAideGovernancePolicy(projectDir);
    const profile = loadProjectProfileState(projectDir);
    const runtimeState = loadRuntimeState(projectDir);
    const taskRegistry = syncTaskRegistry(projectDir, {
      profile,
      runtimeState
    });
    const governanceRegistry = loadGovernanceRegistry(projectDir);
    const existingCandidateMap = new Map(
      (Array.isArray(governanceRegistry.candidates) ? governanceRegistry.candidates : []).map((item) => [item.id, item])
    );

    const pendingGovernanceReviews = (Array.isArray(runtimeState.pendingActions) ? runtimeState.pendingActions : []).filter(
      (item) => item.type === "governance_review"
    );
    const queuedGovernanceItems = (Array.isArray(runtimeState.governanceQueue) ? runtimeState.governanceQueue : []).filter(
      (item) => String(item.status || "queued").trim().toLowerCase() === "queued"
    );

    const activeCandidates = [
      ...pendingGovernanceReviews.map((item) => buildGovernanceReviewCandidate(item, governancePolicy)),
      ...queuedGovernanceItems
        .map((item) => buildGovernanceQueueCandidate(item, governancePolicy))
        .map((item) => enrichGovernanceCandidateFromPolicy(item, policy, governancePolicy))
    ].filter((item) => existingCandidateMap.get(item.id)?.status !== "applied");
    const activeCandidateIds = new Set(activeCandidates.map((item) => item.id));

    activeCandidates.forEach((entry) => {
      upsertCandidate(governanceRegistry, entry, now);
    });

    const settledTasks = listTaskRegistryTasks(taskRegistry, (task) => {
      const status = String(task.status || "").trim().toLowerCase();
      return status === "done" || status === "cancelled";
    });

    let reviewedSettledTaskCount = 0;
    let newTaskCandidates = 0;

    for (const task of settledTasks) {
      if (hasSettledTaskReview(governanceRegistry, task)) {
        continue;
      }

      const relatedSignals = relatedSignalsForTask(task, activeCandidates);
      const relatedSignalIds = relatedSignals.flatMap((item) => item.signalIds || []);
      const taskCandidateCount = relatedSignals.length;
      const outcome = taskCandidateCount > 0 ? "signals-present" : "no-candidates";
      const note =
        outcome === "signals-present"
          ? `Settled task still has ${taskCandidateCount} governance signal(s) worth reviewing before archival.`
          : "Settled task reviewed with no durable governance signal.";

      upsertSettledTaskReview(governanceRegistry, {
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

      const authorityTargets = Array.from(new Set(relatedSignals.map((item) => item.authority_target).filter(Boolean)));
      const taskCandidate = {
        id: `task-settled:${task.id}`,
        sourceType: "task_settled",
        status: "queued",
        level: highestGovernanceLevel(
          relatedSignals.map((item) => item.level),
          "G2"
        ),
        planPath: task.planPath || null,
        taskId: task.id,
        taskTitle: task.title || "Untitled task",
        signalIds: relatedSignalIds,
        summary: compactText(
          `Task settled: ${task.title || "Untitled task"}. Review whether ${taskCandidateCount} active governance signal(s) should write back before archival.`,
          160
        )
      };
      taskCandidate.issue = taskCandidate.summary;
      taskCandidate.authority_target = authorityTargetForCandidate({
        authorityTarget: authorityTargets.join(", ") || ".codex/policies/aide-governance-policy.md",
        planPath: task.planPath || null
      });
      taskCandidate.impact = "The task is settled but active governance signals still need disposition before archival.";
      taskCandidate.recommended_action = "Review the remaining governance signals and keep only durable writeback candidates.";
      taskCandidate.disposition = governanceDisposition(governancePolicy, taskCandidate.level, "queue");
      taskCandidate.note = taskCandidate.summary;

      upsertCandidate(governanceRegistry, taskCandidate, now);
      activeCandidateIds.add(taskCandidate.id);
      newTaskCandidates += 1;
    }

    const autoAppliedCount = applyAutomaticWritebacks(projectDir, governanceRegistry, now);
    resolveStaleCandidates(governanceRegistry, activeCandidateIds, now);
    sortAndTrimRegistry(governanceRegistry);
    governanceRegistry.lastSweep = {
      checkedAt: now,
      trigger,
      background,
      candidateCount: governanceRegistry.candidates.filter((item) => item.status === "queued").length,
      settledTaskCount: reviewedSettledTaskCount,
      note:
        reviewedSettledTaskCount > 0
          ? `Reviewed ${reviewedSettledTaskCount} settled task(s); ${newTaskCandidates} new task-level candidate(s); ${autoAppliedCount} auto-applied writeback(s).`
          : `No newly settled tasks required governance review. Auto-applied writeback(s): ${autoAppliedCount}.`
    };
    governanceRegistry.updatedAt = now;

    saveGovernanceRegistry(projectDir, governanceRegistry);

    if (quiet) {
      logger.finalize({
        status: "ok",
        metadata: {
          trigger,
          quiet: true,
          queuedCandidateCount: governanceRegistry.candidates.filter((item) => item.status === "queued").length,
          autoAppliedCount
        }
      });
      return;
    }

    const queuedCandidates = governanceRegistry.candidates.filter((item) => item.status === "queued");
    const lines = [
      "Aide writeback sweep:",
      `- Trigger: ${trigger}`,
      `- Active candidates: ${queuedCandidates.length}`,
      `- Newly reviewed settled tasks: ${reviewedSettledTaskCount}`,
      `- Auto-applied writebacks: ${autoAppliedCount}`
    ];

    queuedCandidates.slice(0, 5).forEach((item) => {
      lines.push(`- [${item.level || "G2"}] ${item.summary}`);
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
    process.stderr.write(`aide-writeback error: ${error instanceof Error ? error.message : String(error)}\n`);
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
