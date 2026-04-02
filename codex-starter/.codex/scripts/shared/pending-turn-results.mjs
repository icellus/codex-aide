import fs from "node:fs";
import path from "node:path";

import { ensureDir } from "./logging.mjs";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function pendingResultPath(projectDir, fileName) {
  return path.join(projectDir, ".codex", "state", fileName);
}

function normalizePendingResult(value = {}) {
  const result = value?.result && typeof value.result === "object" ? cloneJson(value.result) : null;
  return {
    version: 1,
    written_at: normalizeText(value?.written_at) || null,
    session_id: normalizeText(value?.session_id) || null,
    turn_id: normalizeText(value?.turn_id) || null,
    result
  };
}

function readPendingResult(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const normalized = normalizePendingResult(JSON.parse(fs.readFileSync(filePath, "utf8")));
    return normalized.result ? normalized : null;
  } catch {
    return null;
  }
}

function writePendingResult(filePath, result, metadata = {}) {
  const cloned = cloneJson(result);
  if (!cloned || typeof cloned !== "object") {
    throw new Error("result must be a JSON object");
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        written_at: new Date().toISOString(),
        session_id: normalizeText(metadata?.session_id) || null,
        turn_id: normalizeText(metadata?.turn_id) || null,
        result: cloned
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function clearPendingResult(filePath) {
  fs.rmSync(filePath, { force: true });
}

function parseTimestamp(value) {
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function isPendingResultFresh(record, context = {}) {
  const writtenAt = parseTimestamp(record?.written_at);
  if (writtenAt === null) {
    return false;
  }

  const expectedTurnId = normalizeText(context?.turn_id);
  const expectedSessionId = normalizeText(context?.session_id);
  const recordTurnId = normalizeText(record?.turn_id);
  const recordSessionId = normalizeText(record?.session_id);

  if (expectedTurnId && recordTurnId && recordTurnId !== expectedTurnId) {
    return false;
  }

  if (expectedSessionId && recordSessionId && recordSessionId !== expectedSessionId) {
    return false;
  }

  if (expectedTurnId && recordTurnId && recordTurnId === expectedTurnId) {
    if (!expectedSessionId || !recordSessionId || recordSessionId === expectedSessionId) {
      return true;
    }
  }

  const turnStarted = parseTimestamp(context?.turn_started_at);
  if (turnStarted === null) {
    return false;
  }

  return writtenAt >= turnStarted;
}

function pendingTaskTurnResultPath(projectDir) {
  return pendingResultPath(projectDir, "pending-task-turn-result.json");
}

function pendingGovernanceResultPath(projectDir) {
  return pendingResultPath(projectDir, "pending-governance-result.json");
}

function readPendingTaskTurnResult(projectDir) {
  return readPendingResult(pendingTaskTurnResultPath(projectDir));
}

function writePendingTaskTurnResult(projectDir, result, metadata = {}) {
  writePendingResult(pendingTaskTurnResultPath(projectDir), result, metadata);
}

function clearPendingTaskTurnResult(projectDir) {
  clearPendingResult(pendingTaskTurnResultPath(projectDir));
}

function readPendingGovernanceResult(projectDir) {
  return readPendingResult(pendingGovernanceResultPath(projectDir));
}

function writePendingGovernanceResult(projectDir, result, metadata = {}) {
  writePendingResult(pendingGovernanceResultPath(projectDir), result, metadata);
}

function clearPendingGovernanceResult(projectDir) {
  clearPendingResult(pendingGovernanceResultPath(projectDir));
}

export {
  clearPendingGovernanceResult,
  clearPendingTaskTurnResult,
  isPendingResultFresh,
  pendingGovernanceResultPath,
  pendingTaskTurnResultPath,
  readPendingGovernanceResult,
  readPendingTaskTurnResult,
  writePendingGovernanceResult,
  writePendingTaskTurnResult
};
