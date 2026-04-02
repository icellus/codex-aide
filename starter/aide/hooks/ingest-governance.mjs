#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { getProjectContext } from "../scripts/shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../scripts/shared/io.mjs";
import { ensureDir, startRuntimeInvocationLogging } from "../scripts/shared/logging.mjs";
import { clearPendingGovernanceResult, isPendingResultFresh, readPendingGovernanceResult } from "../scripts/shared/pending-turn-results.mjs";
import { collectTurnEntries, readTranscriptLines } from "../scripts/shared/transcript.mjs";

const decidingRoles = new Set(["Aide"]);

function ingestLogPath(projectDir, timestamp) {
  const day = String(timestamp || new Date().toISOString()).slice(0, 10) || "unknown-date";
  const logDir = path.join(projectDir, ".codex", "aide", "logs", "governance-ingest");
  ensureDir(logDir);
  return path.join(logDir, `${day}.jsonl`);
}

function listProcessedKeys(projectDir) {
  const logDir = path.join(projectDir, ".codex", "aide", "logs", "governance-ingest");
  if (!fs.existsSync(logDir)) {
    return new Set();
  }

  const keys = new Set();
  for (const fileName of fs.readdirSync(logDir)) {
    if (!fileName.endsWith(".jsonl")) {
      continue;
    }

    const filePath = path.join(logDir, fileName);
    const entries = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    for (const line of entries) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.key) {
          keys.add(parsed.key);
        }
      } catch {
        // Ignore malformed log lines.
      }
    }
  }

  return keys;
}

function appendIngestLog(projectDir, entry) {
  const filePath = ingestLogPath(projectDir, entry.timestamp);
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

function messageHash(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function normalizeText(value) {
  return String(value || "").trim();
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

function governanceCandidatesFromResult(result) {
  if (!result || typeof result !== "object") {
    return [];
  }

  if (Array.isArray(result.governance_candidates)) {
    return result.governance_candidates.filter((item) => item && typeof item === "object");
  }

  return [];
}

function normalizeCandidate(role, candidate, fallbackEvidence) {
  const evidence = Array.isArray(candidate.evidence) && candidate.evidence.length > 0 ? candidate.evidence : fallbackEvidence;
  const source = String(candidate.source || role).trim() || role;
  const sourceRoles = Array.isArray(candidate.source_roles)
    ? candidate.source_roles.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (source && !sourceRoles.includes(source)) {
    sourceRoles.unshift(source);
  }

  return {
    issue: String(candidate.issue || "").trim(),
    level: String(candidate.level || "unset").trim() || "unset",
    impact: String(candidate.impact || "").trim(),
    authority_target: String(candidate.authority_target || "").trim(),
    recommended_action: String(candidate.recommended_action || "").trim(),
    disposition: String(candidate.disposition || "").trim() || "ask-user",
    note: String(candidate.note || "").trim(),
    evidence,
    source,
    source_roles: sourceRoles,
    operations: Array.isArray(candidate.operations)
      ? candidate.operations.filter((item) => item && typeof item === "object")
      : []
  };
}

function runWriteback(projectDir, candidate, actorRole) {
  const scriptPath = path.join(projectDir, ".codex", "aide", "scripts", "governance", "writeback.mjs");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectDir,
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: projectDir
    },
    input: `${JSON.stringify({ projectDir, actor_role: actorRole, candidate })}\n`,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(String(result.stdout || "").trim() || "{}");
  } catch {
    parsed = {
      ok: false,
      decision: "reject",
      code: "invalid_writeback_output",
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  return {
    status: result.status ?? 1,
    parsed,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function assertWritebackSucceeded(result) {
  if ((result?.status ?? 1) === 0) {
    return;
  }

  const detail = normalizeText(result?.stderr) || normalizeText(result?.stdout) || normalizeText(result?.parsed?.code);
  throw new Error(detail || "governance writeback failed");
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const logger = startRuntimeInvocationLogging({
    projectDir: project.projectDir,
    scriptName: "hooks/ingest-governance.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const transcriptPath = typeof input.transcript_path === "string" ? input.transcript_path.trim() : "";
    const sessionId = normalizeText(input.session_id || input.sessionId);
    const turnId = normalizeText(input.turn_id || input.turnId);
    const lines = transcriptPath ? readTranscriptLines(transcriptPath) : [];
    const turnLines = turnId ? collectTurnEntries(lines, turnId) : [];
    const pending = readPendingGovernanceResult(project.projectDir);
    const pendingFresh = pending
      ? isPendingResultFresh(pending, {
          session_id: sessionId,
          turn_id: turnId,
          turn_started_at: turnStartedAt(turnLines)
        })
      : false;
    const latest = pendingFresh ? pending.result : null;

    if (!latest) {
      if (pending) {
        clearPendingGovernanceResult(project.projectDir);
      }
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: pending ? "stale-pending-governance-result" : "missing-pending-governance-result",
          transcriptPath
        }
      });
      return;
    }

    const role = String(latest.role || "").trim();
    if (!decidingRoles.has(role)) {
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "unsupported-role",
          role,
          transcriptPath
        }
      });
      return;
    }

    const status = String(latest.status || "").trim();
    if (status && status !== "complete") {
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "non-complete-status",
          role,
          resultStatus: status,
          transcriptPath
        }
      });
      return;
    }

    const key = `${input.session_id || "unknown-session"}::${role}::${messageHash(JSON.stringify(latest))}`;
    const processedKeys = listProcessedKeys(project.projectDir);
    if (processedKeys.has(key)) {
      clearPendingGovernanceResult(project.projectDir);
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "already-processed",
          key,
          transcriptPath
        }
      });
      return;
    }

    const rawCandidates = governanceCandidatesFromResult(latest);
    if (rawCandidates.length === 0) {
      clearPendingGovernanceResult(project.projectDir);
      appendIngestLog(project.projectDir, {
        timestamp: new Date().toISOString(),
        key,
        sessionId: input.session_id || null,
        role,
        transcriptPath,
        outcome: "no-candidates"
      });
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "no-candidates",
          role,
          transcriptPath
        }
      });
      return;
    }

    const fallbackEvidence = [
      {
        kind: "transcript",
        transcript_path: transcriptPath,
        session_id: input.session_id || null,
        turn_id: input.turn_id || null
      }
    ];

    const results = [];
    for (const rawCandidate of rawCandidates) {
      const candidate = normalizeCandidate(role, rawCandidate, fallbackEvidence);
      if (!candidate.issue || !candidate.authority_target) {
        results.push({
          ok: false,
          decision: "reject",
          code: "candidate_missing_required_fields",
          candidate
        });
        continue;
      }

      const writebackResult = runWriteback(project.projectDir, candidate, role);
      assertWritebackSucceeded(writebackResult);
      results.push(writebackResult.parsed);
    }

    appendIngestLog(project.projectDir, {
      timestamp: new Date().toISOString(),
      key,
      sessionId: input.session_id || null,
      role,
      transcriptPath,
      outcome: "processed",
      results
    });
    clearPendingGovernanceResult(project.projectDir);
    logger.finalize({
      status: "ok",
      metadata: {
        key,
        role,
        transcriptPath,
        results
      }
    });
  } catch (error) {
    process.stderr.write(`hooks/ingest-governance error: ${error instanceof Error ? error.message : String(error)}\n`);
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
