#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { ensureDir, startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { clearPendingTaskTurnResult, isPendingResultFresh, readPendingTaskTurnResult } from "../shared/pending-turn-results.mjs";
import { defaultTaskState, hasTrackedTask, normalizeProductDecision, normalizeTaskStatus, readTaskContext } from "../shared/task-context.mjs";
import {
  collectTurnEntries,
  readTranscriptLines
} from "../shared/transcript.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function hasOwnField(value, fieldName) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, fieldName);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function extractStructuredResultsFromText(text) {
  const matches = Array.from(String(text || "").matchAll(/## Structured Result\s*```json\s*([\s\S]*?)\s*```/g));
  return matches
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function callNameById(entries) {
  const mapping = new Map();
  for (const entry of entries) {
    if (entry?.type !== "response_item" || entry?.payload?.type !== "function_call") {
      continue;
    }

    const callId = normalizeText(entry.payload.call_id);
    const name = normalizeText(entry.payload.name);
    if (callId && name) {
      mapping.set(callId, name);
    }
  }

  return mapping;
}

function waitAgentStructuredResults(entries) {
  const mapping = callNameById(entries);
  const results = [];

  for (const entry of entries) {
    if (entry?.type !== "response_item" || entry?.payload?.type !== "function_call_output") {
      continue;
    }

    const callId = normalizeText(entry.payload.call_id);
    if (!callId || mapping.get(callId) !== "wait_agent") {
      continue;
    }

    const output = String(entry.payload.output || "");
    for (const structured of extractStructuredResultsFromText(output)) {
      results.push(structured);
    }
  }

  return results;
}

function latestJsonObjectFromStdout(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return null;
}

function runTaskState(projectDir, input) {
  const scriptPath = path.join(projectDir, ".codex", "aide", "scripts", "context", "task-state.mjs");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectDir,
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: projectDir
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8"
  });

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    parsed: latestJsonObjectFromStdout(result.stdout || "")
  };
}

function lifecycleLogPath(projectDir, timestamp) {
  const day = String(timestamp || new Date().toISOString()).slice(0, 10) || "unknown-date";
  const logDir = path.join(projectDir, ".codex", "aide", "logs", "task-lifecycle");
  ensureDir(logDir);
  return path.join(logDir, `${day}.jsonl`);
}

function appendLifecycleLog(projectDir, entry) {
  const timestamp = normalizeText(entry?.timestamp) || new Date().toISOString();
  fs.appendFileSync(lifecycleLogPath(projectDir, timestamp), `${JSON.stringify({ ...entry, timestamp })}\n`, "utf8");
}

function turnStartedAt(turnLines) {
  for (const entry of turnLines || []) {
    const timestamp = normalizeText(entry?.timestamp);
    if (timestamp) {
      return timestamp;
    }
  }

  return "";
}

function readTurnSnapshot(projectDir, transcriptPath, turnId, sessionId = "") {
  const lines = readTranscriptLines(transcriptPath);
  const turnLines = collectTurnEntries(lines, turnId);
  const startedAt = turnStartedAt(turnLines);
  const pending = readPendingTaskTurnResult(projectDir);
  if (!pending) {
    return {
      turnLines,
      structuredResult: null,
      structuredSource: "",
      pendingState: "missing"
    };
  }

  if (!isPendingResultFresh(pending, {
    session_id: sessionId,
    turn_id: turnId,
    turn_started_at: startedAt
  })) {
    return {
      turnLines,
      structuredResult: null,
      structuredSource: "",
      pendingState: "stale"
    };
  }

  return {
    turnLines,
    structuredResult: pending.result,
    structuredSource: "pending-task-turn-result",
    pendingState: "used"
  };
}

function normalizeTaskUpdate(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const taskUpdate = {
    sync: value.sync === true
  };

  if (!taskUpdate.sync) {
    return taskUpdate;
  }

  if (hasOwnField(value, "status")) {
    taskUpdate.status = normalizeText(value.status).toLowerCase();
  }
  if (hasOwnField(value, "checkpoint")) {
    taskUpdate.checkpoint = normalizeText(value.checkpoint);
  }
  if (hasOwnField(value, "next_step")) {
    taskUpdate.next_step = normalizeText(value.next_step);
  }
  if (hasOwnField(value, "next_owner")) {
    taskUpdate.next_owner = normalizeText(value.next_owner);
  }
  if (hasOwnField(value, "waiting_on")) {
    taskUpdate.waiting_on = normalizeText(value.waiting_on).toLowerCase();
  }
  if (hasOwnField(value, "blocked_reason")) {
    taskUpdate.blocked_reason = normalizeText(value.blocked_reason);
  }
  if (hasOwnField(value, "completion_reason")) {
    taskUpdate.completion_reason = normalizeText(value.completion_reason);
  }
  if (hasOwnField(value, "enabled_roles")) {
    taskUpdate.enabled_roles = normalizeStringList(value.enabled_roles);
  }
  if (hasOwnField(value, "enabled_modules")) {
    taskUpdate.enabled_modules = normalizeStringList(value.enabled_modules);
  }
  if (hasOwnField(value, "event")) {
    taskUpdate.event = normalizeText(value.event);
  }

  return taskUpdate;
}

function buildTaskPatch(currentTask, taskUpdate) {
  const patch = {
    current_task: normalizeText(currentTask.current_task),
    task_id: normalizeText(currentTask.task_id)
  };

  for (const fieldName of [
    "status",
    "checkpoint",
    "next_step",
    "next_owner",
    "waiting_on",
    "blocked_reason",
    "completion_reason",
    "enabled_roles",
    "enabled_modules"
  ]) {
    if (hasOwnField(taskUpdate, fieldName)) {
      patch[fieldName] = taskUpdate[fieldName];
    }
  }

  return patch;
}

function validateExpectedRole(currentTask, role, turnLines = []) {
  const normalizedRole = normalizeText(role);
  if (!normalizedRole) {
    return {
      code: "missing-role",
      message: "structured result for a routed task must declare role"
    };
  }

  if (normalizedRole === "coder" || normalizedRole === "tester") {
    return {
      code: "invalid-main-thread-role",
      message: `${normalizedRole} must report through subagent wait output, not the main assistant final message`
    };
  }

  if (!["Aide", "product_manager", "architect", "technical_manager", "product_assistant", "qc", "submit"].includes(normalizedRole)) {
    return {
      code: "unknown-role",
      message: `unknown routed role ${normalizedRole}`
    };
  }

  const currentStatus = normalizeTaskStatus(currentTask.status, "idle");
  const expectedRole = normalizeText(currentTask.next_owner);
  const delegatedResults = new Set(waitAgentStructuredResults(turnLines).map((result) => normalizeText(result?.role)));
  if (
    currentStatus === "handoff" &&
    (expectedRole === "coder" || expectedRole === "tester") &&
    normalizedRole === "technical_manager" &&
    delegatedResults.has(expectedRole)
  ) {
    return null;
  }

  if (currentStatus === "handoff" && expectedRole && expectedRole !== "Aide" && expectedRole !== normalizedRole) {
    return {
      code: "unexpected-role",
      message: `expected handoff owner ${expectedRole}, got ${normalizedRole}`
    };
  }

  return null;
}

function deriveRoutePatch({ currentTask, structuredResult, taskUpdate, turnLines }) {
  const normalizedRole = normalizeText(structuredResult?.role);
  const structuredStatus = normalizeText(structuredResult?.status).toLowerCase();
  const routePatch = {};

  if (normalizedRole === "technical_manager") {
    const briefPath = normalizeText(structuredResult?.brief_path);
    if (briefPath) {
      routePatch.implementation_brief_path = briefPath;
    }

    const subagentResults = waitAgentStructuredResults(turnLines);
    const activatedRoles = [];
    const completedRoles = [];
    const subagentRoles = [];
    for (const result of subagentResults) {
      const role = normalizeText(result?.role);
      const status = normalizeText(result?.status).toLowerCase();
      if (role === "coder" || role === "tester") {
        activatedRoles.push(role);
        if (status === "complete") {
          completedRoles.push(role);
          subagentRoles.push(role);
        }
      }
    }

    if (activatedRoles.length > 0) {
      routePatch.activated_roles = activatedRoles;
    }

    if (completedRoles.length > 0) {
      routePatch.completed_roles = completedRoles;
      routePatch.subagent_roles = subagentRoles;
    }

    const nextOwner = normalizeText(taskUpdate?.next_owner);
    if (nextOwner === "architect") {
      return {
        error: {
          code: "invalid-technical-manager-route",
          message: "technical_manager must escalate to Aide instead of handing off directly to architect"
        }
      };
    }

    if (nextOwner === "tester") {
      const roleSet = new Set([
        ...normalizeStringList(currentTask?.completed_roles),
        ...completedRoles
      ]);
      const subagentRoleSet = new Set([
        ...normalizeStringList(currentTask?.subagent_roles),
        ...subagentRoles
      ]);
      if (!roleSet.has("coder") || !subagentRoleSet.has("coder")) {
        return {
          error: {
            code: "missing-coder-subagent-proof",
            message: "technical_manager may hand off to tester only after coder subagent evidence is present"
          }
        };
      }
    }

    return { patch: routePatch };
  }

  if (normalizedRole === "product_manager") {
    if (structuredStatus === "blocked") {
      return { patch: routePatch };
    }

    const selectedOutcome = normalizeProductDecision(
      structuredResult?.selected_outcome || structuredResult?.outcome || structuredResult?.product_decision,
      ""
    );
    if (!selectedOutcome || selectedOutcome === "none") {
      return {
        error: {
          code: "missing-product-manager-outcome",
          message: "product_manager must return selected_outcome=skip|product"
        }
      };
    }

    routePatch.completed_roles = ["product_manager"];
    routePatch.product_decision = selectedOutcome;
    const prdPath = normalizeText(structuredResult?.prd_path);
    if (prdPath) {
      routePatch.prd_path = prdPath;
    }

    const nextOwner = normalizeText(taskUpdate?.next_owner);
    if (selectedOutcome === "product" && nextOwner !== "architect") {
      return {
        error: {
          code: "invalid-product-manager-product-handoff",
          message: "product_manager with product outcome must hand off to architect"
        }
      };
    }

    if (selectedOutcome === "skip" && nextOwner !== "technical_manager") {
      return {
        error: {
          code: "invalid-product-manager-skip-handoff",
          message: "product_manager with skip outcome must hand off to technical_manager"
        }
      };
    }

    return { patch: routePatch };
  }

  if (normalizedRole === "architect") {
    if (structuredStatus === "blocked") {
      return { patch: routePatch };
    }

    routePatch.completed_roles = ["architect"];
    const architecturePath = normalizeText(structuredResult?.architecture_path);
    if (architecturePath) {
      routePatch.architecture_path = architecturePath;
    }

    const nextOwner = normalizeText(taskUpdate?.next_owner);
    if (nextOwner && nextOwner !== "technical_manager" && nextOwner !== "product_manager") {
      return {
        error: {
          code: "invalid-architect-handoff",
          message: "architect may hand off only to technical_manager, or back to product_manager when blocked"
        }
      };
    }

    return { patch: routePatch };
  }

  return { patch: routePatch };
}

function hasTaskUpdateOverrides(taskUpdate) {
  if (!taskUpdate || typeof taskUpdate !== "object") {
    return false;
  }

  return [
    "status",
    "checkpoint",
    "next_step",
    "next_owner",
    "waiting_on",
    "blocked_reason",
    "completion_reason",
    "enabled_roles",
    "enabled_modules",
    "event"
  ].some((fieldName) => hasOwnField(taskUpdate, fieldName));
}

function decideSync({ projectDir, currentTask, transcriptPath, turnId, sessionId = "" }) {
  if (!hasTrackedTask(currentTask)) {
    return {
      action: "noop",
      reason: "no-current-task",
      snapshot: null,
      role: ""
    };
  }

  const currentStatus = normalizeTaskStatus(currentTask.status, "idle");
  if (!transcriptPath || !turnId) {
    return {
      action: currentStatus === "completed" || currentStatus === "cancelled" ? "noop" : "record-interruption",
      reason: "missing-turn-context",
      snapshot: null,
      role: ""
    };
  }

  const snapshot = readTurnSnapshot(projectDir, transcriptPath, turnId, sessionId);
  const structuredResult = snapshot.structuredResult;
  const role = normalizeText(structuredResult?.role);
  const taskUpdate = normalizeTaskUpdate(structuredResult?.task_update);
  const hasOverrides = hasTaskUpdateOverrides(taskUpdate);
  const expectedRoleError = structuredResult ? validateExpectedRole(currentTask, role, snapshot.turnLines) : null;

  if (expectedRoleError) {
    return {
      action: "reject-sync",
      reason: expectedRoleError.code,
      snapshot,
      structuredResult,
      role,
      error: expectedRoleError
    };
  }

  if (currentStatus === "completed" || currentStatus === "cancelled") {
    if (taskUpdate?.sync && hasOverrides) {
      return {
        action: "sync-task-state",
        reason: "task-update",
        snapshot,
        structuredResult,
        taskUpdate,
        role
      };
    }

    return {
      action: "noop",
      reason: taskUpdate?.sync ? "terminal-task-sync-noop" : structuredResult ? "terminal-task-no-task-update" : "terminal-task",
      snapshot,
      structuredResult,
      role
    };
  }

  if (taskUpdate?.sync) {
    return {
      action: "sync-task-state",
      reason: "task-update",
      snapshot,
      structuredResult,
      taskUpdate,
      role
    };
  }

  return {
    action: "record-interruption",
    reason: structuredResult ? "missing-task-update" : "missing-structured-result",
    snapshot,
    structuredResult,
    role
  };
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "context/task-turn-sync.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    if (envelope.parseError) {
      throw envelope.parseError;
    }

    const stateBefore = readTaskContext(projectDir);
    const currentTask = stateBefore.task || defaultTaskState();
    const transcriptPath = normalizeText(input.transcript_path);
    const turnId = normalizeText(input.turn_id || input.turnId);
    const sessionId = normalizeText(input.session_id || input.sessionId);
    const decision = decideSync({
      projectDir,
      currentTask,
      transcriptPath,
      turnId,
      sessionId
    });

    if (decision.snapshot?.pendingState === "stale") {
      clearPendingTaskTurnResult(projectDir);
    }

    let invocation = {
      status: 0,
      stdout: "",
      stderr: "",
      parsed: null
    };

    if (decision.action === "sync-task-state") {
      const taskPatch = buildTaskPatch(currentTask, decision.taskUpdate || {});
      const routePatchResult = deriveRoutePatch({
        currentTask,
        structuredResult: decision.structuredResult || {},
        taskUpdate: decision.taskUpdate || {},
        turnLines: decision.snapshot?.turnLines || []
      });
      if (routePatchResult?.error) {
        process.stderr.write(`task-turn-sync route gate error: ${routePatchResult.error.message}\n`);
        logger.finalize({
          status: "error",
          metadata: {
            decision: decision.action,
            reason: decision.reason,
            routeGate: routePatchResult.error.code
          }
        });
        process.exit(1);
      }
      Object.assign(taskPatch, routePatchResult?.patch || {});
      const taskStateInput = {
        action: "set",
        actor: decision.role || "runtime-hook",
        task: taskPatch
      };

      if (decision.taskUpdate?.event) {
        taskStateInput.event = decision.taskUpdate.event;
      }

      invocation = runTaskState(projectDir, taskStateInput);
    } else if (decision.action === "record-interruption") {
      invocation = runTaskState(projectDir, {
        action: "record-interruption"
      });
    } else if (decision.action === "reject-sync") {
      process.stderr.write(decision.error?.message || "task-turn-sync: route gate rejected current turn\n");
      logger.finalize({
        status: "error",
        metadata: {
          decision: decision.action,
          reason: decision.reason
        }
      });
      process.exit(1);
    }

    if ((invocation.status ?? 0) !== 0) {
      process.stderr.write(invocation.stderr || "task-turn-sync: delegated task-state failed\n");
      logger.finalize({
        status: "error",
        metadata: {
          decision: decision.action,
          reason: decision.reason,
          delegatedStatus: invocation.status
        }
      });
      process.exit(invocation.status ?? 1);
    }

    if (decision.snapshot?.pendingState === "used") {
      clearPendingTaskTurnResult(projectDir);
    }

    const stateAfter = readTaskContext(projectDir);
    const afterTask = stateAfter.task || defaultTaskState();
    const structuredStatus = normalizeText(decision.structuredResult?.status);
    const timestamp = new Date().toISOString();

    appendLifecycleLog(projectDir, {
      timestamp,
      session_id: normalizeText(input.session_id),
      turn_id: turnId || null,
      transcript_path: transcriptPath || null,
      hook_event_name: normalizeText(input.hook_event_name),
      decision: decision.action,
      reason: decision.reason,
      role: decision.role || null,
      structured_source: decision.snapshot?.structuredSource || null,
      structured_status: structuredStatus || null,
      status_before: normalizeTaskStatus(currentTask.status, "idle"),
      status_after: normalizeTaskStatus(afterTask.status, "idle"),
      task_id: normalizeText(afterTask.task_id || currentTask.task_id) || null,
      task_update: decision.taskUpdate || null,
      delegated_action: normalizeText(invocation.parsed?.action) || null,
      delegated_changed: Boolean(invocation.parsed?.changed)
    });

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        decision: decision.action,
        reason: decision.reason,
        role: decision.role || "",
        structured_status: structuredStatus || "",
        task: {
          task_id: afterTask.task_id,
          status: afterTask.status,
          waiting_on: afterTask.waiting_on,
          next_step: afterTask.next_step,
          next_owner: afterTask.next_owner,
          interrupted_at: afterTask.interrupted_at,
          finished_at: afterTask.finished_at
        }
      })}\n`
    );

    logger.finalize({
      status: "ok",
      metadata: {
        decision: decision.action,
        reason: decision.reason,
        role: decision.role || "",
        structuredStatus: structuredStatus || "",
        taskStatus: afterTask.status
      }
    });
  } catch (error) {
    process.stderr.write(`context/task-turn-sync error: ${error instanceof Error ? error.message : String(error)}\n`);
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
