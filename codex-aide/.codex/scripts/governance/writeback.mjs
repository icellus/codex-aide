#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateGovernanceTarget } from "../guards/validate-governance-target.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { getProjectContext } from "../shared/project-context.mjs";

const defaultPolicy = Object.freeze({
  candidate_sources: ["Aide", "architect", "product_assistant", "technical_manager", "tester", "qc"],
  runtime_state_path: ".codex/state/governance-context.json",
  safe_diff_types: ["replace-exact-text", "remove-exact-text", "insert-after-anchor"],
  special_flow_targets: [".codex/policies/validation-profile.json"],
  auto_fix_levels: ["G1"],
  persist_fields: ["issue", "level", "authority_target", "disposition", "note"],
  active_statuses: ["accepted", "ask-user", "special-flow"],
  default_disposition: {
    G1: "auto-fix",
    G2: "ask-user",
    G3: "ask-user"
  }
});

const runtimeRejectPrefixes = [".codex/state/", ".codex/logs/", ".codex/progress/"];
const runtimeAskUserPrefixes = [".codex/scripts/", ".codex/hooks/", ".codex/product/"];
const runtimeAskUserFiles = new Set([".codex/hooks.json", ".codex/config.toml"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureJsonSerializableArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (isPlainObject(item)) {
        try {
          return JSON.parse(JSON.stringify(item));
        } catch {
          return null;
        }
      }

      return null;
    })
    .filter(Boolean);
}

function ensureStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function ensureObjectArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => isPlainObject(item));
}

function relativeTargetPath(projectDir, targetPath) {
  const absoluteTargetPath = path.resolve(projectDir, targetPath);
  const relativePath = path.relative(projectDir, absoluteTargetPath).replace(/\\/g, "/");
  if (!relativePath || relativePath.startsWith("..")) {
    throw new Error("authority_target must stay inside the project directory");
  }
  return relativePath;
}

function loadGovernancePolicy(projectDir) {
  const filePath = path.join(projectDir, ".codex", "policies", "aide-governance-policy.md");
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return { ...defaultPolicy };
  }

  try {
    const parsed = JSON.parse(match[1]);
    return {
      ...defaultPolicy,
      ...parsed
    };
  } catch {
    return { ...defaultPolicy };
  }
}

function governanceStatePath(projectDir, policy) {
  return path.join(projectDir, policy.runtime_state_path || defaultPolicy.runtime_state_path);
}

function governanceStateTemplate() {
  return {
    version: 1,
    updated_at: null,
    items: []
  };
}

function readGovernanceState(filePath) {
  if (!fs.existsSync(filePath)) {
    return governanceStateTemplate();
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeGovernanceState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function candidateId(issue, authorityTarget) {
  const hash = crypto.createHash("sha1").update(`${authorityTarget}::${issue}`).digest("hex").slice(0, 12);
  return `gov-${hash}`;
}

function normalizeOperation(input) {
  const type = normalizeText(input?.type);

  if (type === "replace-exact-text") {
    const before = typeof input?.before === "string" ? input.before : "";
    const after = typeof input?.after === "string" ? input.after : "";
    if (!before) {
      return {
        error: "replace-exact-text requires before"
      };
    }
    return {
      type,
      before,
      after
    };
  }

  if (type === "remove-exact-text") {
    const before = typeof input?.before === "string" ? input.before : "";
    if (!before) {
      return {
        error: "remove-exact-text requires before"
      };
    }
    return {
      type,
      before,
      after: ""
    };
  }

  if (type === "insert-after-anchor") {
    const anchor = typeof input?.anchor === "string" ? input.anchor : "";
    const text = typeof input?.text === "string" ? input.text : "";
    if (!anchor || !text) {
      return {
        error: "insert-after-anchor requires anchor and text"
      };
    }
    return {
      type,
      anchor,
      text
    };
  }

  return {
    error: `unsupported operation type "${type || "<missing>"}"`
  };
}

function normalizeCandidate(projectDir, inputCandidate, policy) {
  const issue = normalizeText(inputCandidate?.issue);
  const source = normalizeText(inputCandidate?.source);
  const sourceRoles = ensureStringArray(inputCandidate?.source_roles);
  const note = normalizeText(inputCandidate?.note);
  const level = normalizeText(inputCandidate?.level) || "unset";
  const impact = normalizeText(inputCandidate?.impact);
  const recommendedAction = normalizeText(inputCandidate?.recommended_action);
  const taskRef = normalizeText(inputCandidate?.task_ref);
  const evidence = ensureJsonSerializableArray(inputCandidate?.evidence);
  const inputTarget = normalizeText(inputCandidate?.authority_target);
  const operations = ensureObjectArray(inputCandidate?.operations);
  const errors = [];

  let authorityTarget = "";
  if (!issue) {
    errors.push("candidate.issue is required");
  }

  if (!source) {
    if (sourceRoles.length === 0) {
      errors.push("candidate.source or candidate.source_roles is required");
    }
  } else if (!policy.candidate_sources.includes(source)) {
    errors.push(`candidate.source must be one of ${policy.candidate_sources.join(", ")}`);
  }

  const normalizedSourceRoles = Array.from(new Set([...sourceRoles, source].filter(Boolean)));
  if (normalizedSourceRoles.length === 0) {
    errors.push("candidate.source_roles must contain at least one recognized source");
  }

  for (const role of normalizedSourceRoles) {
    if (!policy.candidate_sources.includes(role)) {
      errors.push(`candidate.source_roles must be one of ${policy.candidate_sources.join(", ")}`);
    }
  }

  if (!inputTarget) {
    errors.push("candidate.authority_target is required");
  } else {
    try {
      authorityTarget = relativeTargetPath(projectDir, inputTarget);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (evidence.length === 0) {
    errors.push("candidate.evidence must contain at least one item");
  }

  return {
    errors,
    candidate: {
      id: normalizeText(inputCandidate?.id) || candidateId(issue || "<missing>", authorityTarget || "<missing>"),
      task_ref: taskRef,
      issue,
      authority_target: authorityTarget,
      source: source || normalizedSourceRoles[0] || "",
      source_roles: normalizedSourceRoles,
      evidence,
      note,
      level,
      impact,
      recommended_action: recommendedAction,
      disposition:
        normalizeText(inputCandidate?.disposition) ||
        policy.default_disposition[level] ||
        defaultPolicy.default_disposition[level] ||
        "ask-user",
      operations
    }
  };
}

function normalizeOperations(operations, policy) {
  const errors = [];
  const normalizedOperations = [];

  for (const operation of ensureObjectArray(operations)) {
    const normalized = normalizeOperation(operation);
    if (normalized.error) {
      errors.push(normalized.error);
      continue;
    }

    if (!policy.safe_diff_types.includes(normalized.type)) {
      errors.push(`operation type "${normalized.type}" is not allowed by governance policy`);
      continue;
    }

    normalizedOperations.push(normalized);
  }

  return {
    errors,
    operations: normalizedOperations
  };
}

function countOccurrences(text, needle) {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while (true) {
    const next = text.indexOf(needle, index);
    if (next === -1) {
      return count;
    }
    count += 1;
    index = next + needle.length;
  }
}

function applyOperations(originalText, operations) {
  let nextText = originalText;

  for (const operation of operations) {
    if (operation.type === "replace-exact-text" || operation.type === "remove-exact-text") {
      const matches = countOccurrences(nextText, operation.before);
      if (matches !== 1) {
        throw new Error(`${operation.type} requires exactly one match; found ${matches}`);
      }
      nextText = nextText.replace(operation.before, operation.after);
      continue;
    }

    if (operation.type === "insert-after-anchor") {
      const matches = countOccurrences(nextText, operation.anchor);
      if (matches !== 1) {
        throw new Error(`insert-after-anchor requires exactly one anchor match; found ${matches}`);
      }
      nextText = nextText.replace(operation.anchor, `${operation.anchor}${operation.text}`);
      continue;
    }
  }

  if (nextText === originalText) {
    throw new Error("operations did not produce a change");
  }

  return nextText;
}

function targetFlow(relativePath, policy) {
  if (policy.special_flow_targets.includes(relativePath)) {
    return {
      decision: "special-flow",
      reason: `${relativePath} uses a dedicated maintenance flow`
    };
  }

  if (runtimeRejectPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    return {
      decision: "reject",
      reason: `${relativePath} is runtime state/log/progress, not a generic governance writeback target`
    };
  }

  if (runtimeAskUserFiles.has(relativePath) || runtimeAskUserPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    return {
      decision: "ask-user",
      reason: `${relativePath} affects runtime behavior or product data and requires user review`
    };
  }

  return {
    decision: "generic"
  };
}

function allowedActiveStatuses(policy) {
  const configured = ensureStringArray(policy.active_statuses);
  return configured.length > 0 ? new Set(configured) : new Set(defaultPolicy.active_statuses);
}

function persistedFieldNames(policy) {
  const configured = ensureStringArray(policy.persist_fields);
  return configured.length > 0 ? configured : defaultPolicy.persist_fields;
}

function persistedCandidatePayload(candidate, policy) {
  const payload = {};
  for (const fieldName of persistedFieldNames(policy)) {
    if (Object.prototype.hasOwnProperty.call(candidate, fieldName)) {
      payload[fieldName] = candidate[fieldName];
    }
  }

  return payload;
}

function upsertActiveItem(state, candidate, status, sourceRoles, policy) {
  if (!allowedActiveStatuses(policy).has(status)) {
    throw new Error(`governance status "${status}" is not allowed by policy.active_statuses`);
  }

  const now = new Date().toISOString();
  const existingIndex = state.items.findIndex((item) => item.id === candidate.id);
  const existing = existingIndex === -1 ? null : state.items[existingIndex];
  const mergedSourceRoles = Array.from(new Set([...(existing?.source_roles || []), ...sourceRoles])).filter(Boolean);
  const nextItem = {
    id: candidate.id,
    task_ref: candidate.task_ref || existing?.task_ref || "",
    ...persistedCandidatePayload(candidate, policy),
    source_roles: mergedSourceRoles,
    evidence: candidate.evidence,
    status,
    created_at: existing?.created_at || now,
    updated_at: now
  };

  if (existingIndex === -1) {
    state.items.push(nextItem);
  } else {
    state.items.splice(existingIndex, 1, nextItem);
  }

  state.updated_at = now;
}

function removeActiveItem(state, candidateIdValue) {
  const nextItems = state.items.filter((item) => item.id !== candidateIdValue);
  if (nextItems.length !== state.items.length) {
    state.items = nextItems;
    state.updated_at = new Date().toISOString();
  }
}

function resultPayload({ decision, candidate, targetPath, reason, applied = false, rolledBack = false, code = null }) {
  return {
    ok: decision !== "reject",
    decision,
    code,
    authority_target: targetPath || candidate.authority_target,
    applied,
    rolled_back: rolledBack,
    reason,
    item: {
      id: candidate.id,
      issue: candidate.issue,
      level: candidate.level,
      disposition: candidate.disposition
    }
  };
}

function runTargetValidation(projectDir, targetPath) {
  try {
    return validateGovernanceTarget({
      projectDir,
      targetPath
    });
  } catch (error) {
    return {
      ok: false,
      code: "target_unreadable",
      targetPath,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  if (envelope.parseError) {
    throw envelope.parseError;
  }

  const input = envelope.value;
  const project = getProjectContext(input);
  const logger = startRuntimeInvocationLogging({
    projectDir: project.projectDir,
    scriptName: "governance/writeback.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const policy = loadGovernancePolicy(project.projectDir);
    const stateFilePath = governanceStatePath(project.projectDir, policy);
    const state = readGovernanceState(stateFilePath);
    const normalized = normalizeCandidate(project.projectDir, input.candidate || {}, policy);
    const actorRole = normalizeText(input.actor_role || input.actor);

    if (normalized.errors.length > 0) {
      const payload = {
        ok: false,
        decision: "reject",
        code: "candidate_invalid",
        errors: normalized.errors
      };
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "blocked",
        metadata: payload
      });
      return 2;
    }

    const candidate = normalized.candidate;
    const flow = targetFlow(candidate.authority_target, policy);

    if (actorRole !== "Aide") {
      const payload = resultPayload({
        decision: "reject",
        candidate,
        reason: "generic governance writeback requires actor_role=Aide",
        code: "actor_not_authorized"
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "blocked",
        metadata: payload
      });
      return 2;
    }

    if (flow.decision === "special-flow") {
      candidate.disposition = "special-flow";
      upsertActiveItem(state, candidate, "special-flow", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "special-flow",
        candidate,
        reason: flow.reason
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    if (flow.decision === "reject") {
      removeActiveItem(state, candidate.id);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "reject",
        candidate,
        reason: flow.reason,
        code: "target_rejected"
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "blocked",
        metadata: payload
      });
      return 2;
    }

    if (candidate.disposition !== "auto-fix") {
      const status = candidate.disposition === "special-flow" ? "special-flow" : "ask-user";
      upsertActiveItem(state, candidate, status, candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: status,
        candidate,
        reason: `candidate disposition ${candidate.disposition} is not eligible for generic auto-fix`
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    if (flow.decision === "ask-user") {
      candidate.disposition = "ask-user";
      upsertActiveItem(state, candidate, "ask-user", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "ask-user",
        candidate,
        reason: flow.reason
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    const autoFixLevels = new Set(ensureStringArray(policy.auto_fix_levels).length > 0 ? ensureStringArray(policy.auto_fix_levels) : defaultPolicy.auto_fix_levels);

    if (!autoFixLevels.has(candidate.level)) {
      candidate.disposition = "ask-user";
      upsertActiveItem(state, candidate, "ask-user", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "ask-user",
        candidate,
        reason: `generic governance auto-fix only supports ${Array.from(autoFixLevels).join("|")}; received ${candidate.level}`
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    const normalizedOperations = normalizeOperations(candidate.operations, policy);
    if (normalizedOperations.errors.length > 0) {
      candidate.disposition = "ask-user";
      upsertActiveItem(state, candidate, "ask-user", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "ask-user",
        candidate,
        reason: normalizedOperations.errors.join("; ")
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    candidate.operations = normalizedOperations.operations;

    if (candidate.operations.length === 0) {
      candidate.disposition = "ask-user";
      upsertActiveItem(state, candidate, "ask-user", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "ask-user",
        candidate,
        reason: "generic governance auto-fix requires an explicit safe diff plan"
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    const beforeValidation = runTargetValidation(project.projectDir, candidate.authority_target);

    if (!beforeValidation.ok && beforeValidation.code === "unsupported_target") {
      candidate.disposition = "ask-user";
      upsertActiveItem(state, candidate, "ask-user", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "ask-user",
        candidate,
        reason: beforeValidation.errors.join("; ")
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    const targetWasInvalidBeforePatch = !beforeValidation.ok;

    const targetFilePath = path.join(project.projectDir, candidate.authority_target);
    let originalText = "";

    try {
      originalText = fs.readFileSync(targetFilePath, "utf8");
    } catch (error) {
      candidate.disposition = "ask-user";
      upsertActiveItem(state, candidate, "ask-user", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "ask-user",
        candidate,
        reason: error instanceof Error ? error.message : String(error),
        code: "target_unreadable"
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    let modifiedText = "";

    try {
      modifiedText = applyOperations(originalText, candidate.operations);
    } catch (error) {
      candidate.disposition = "ask-user";
      upsertActiveItem(state, candidate, "ask-user", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "ask-user",
        candidate,
        reason: error instanceof Error ? error.message : String(error)
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    fs.writeFileSync(targetFilePath, modifiedText, "utf8");
    const afterValidation = runTargetValidation(project.projectDir, candidate.authority_target);

    if (!afterValidation.ok) {
      fs.writeFileSync(targetFilePath, originalText, "utf8");
      candidate.disposition = afterValidation.code === "unsupported_target" ? "ask-user" : candidate.disposition;
      upsertActiveItem(state, candidate, "ask-user", candidate.source_roles, policy);
      writeGovernanceState(stateFilePath, state);
      const payload = resultPayload({
        decision: "ask-user",
        candidate,
        reason: afterValidation.errors.join("; "),
        rolledBack: true,
        code: afterValidation.code
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      logger.finalize({
        status: "ok",
        metadata: payload
      });
      return 0;
    }

    removeActiveItem(state, candidate.id);
    writeGovernanceState(stateFilePath, state);
    const payload = resultPayload({
      decision: "auto-fix",
      candidate,
      applied: true,
      reason: targetWasInvalidBeforePatch
        ? "generic governance writeback repaired the target and validator passed after patch"
        : "generic governance writeback applied and validator passed"
    });
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    logger.finalize({
      status: "ok",
      metadata: payload
    });
    return 0;
  } catch (error) {
    const payload = {
      ok: false,
      decision: "reject",
      code: "writeback_error",
      errors: [error instanceof Error ? error.message : String(error)]
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    logger.finalize({
      status: "error",
      error,
      metadata: payload
    });
    return 1;
  } finally {
    restoreStreams();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(await main());
}
