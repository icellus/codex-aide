#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { getProjectContext } from "../scripts/shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../scripts/shared/io.mjs";
import { ensureDir, startRuntimeInvocationLogging } from "../scripts/shared/logging.mjs";
import { latestStructuredResult, readTranscriptLines } from "../scripts/shared/transcript.mjs";

const decidingRoles = new Set(["Aide"]);

function ingestLogPath(projectDir, timestamp) {
  const day = String(timestamp || new Date().toISOString()).slice(0, 10) || "unknown-date";
  const logDir = path.join(projectDir, ".codex", "logs", "governance-ingest");
  ensureDir(logDir);
  return path.join(logDir, `${day}.jsonl`);
}

function listProcessedKeys(projectDir) {
  const logDir = path.join(projectDir, ".codex", "logs", "governance-ingest");
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
  const scriptPath = path.join(projectDir, ".codex", "scripts", "governance", "writeback.mjs");
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
    if (!transcriptPath) {
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "missing-transcript"
        }
      });
      return;
    }

    const lines = readTranscriptLines(transcriptPath);
    const latest = latestStructuredResult(lines);
    if (!latest) {
      logger.finalize({
        status: "ok",
        metadata: {
          skipped: "no-structured-result",
          transcriptPath
        }
      });
      return;
    }

    const role = String(latest.structured.role || "").trim();
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

    const status = String(latest.structured.status || "").trim();
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

    const key = `${input.session_id || "unknown-session"}::${role}::${messageHash(latest.messageText)}`;
    const processedKeys = listProcessedKeys(project.projectDir);
    if (processedKeys.has(key)) {
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

    const rawCandidates = governanceCandidatesFromResult(latest.structured);
    if (rawCandidates.length === 0) {
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

      results.push(runWriteback(project.projectDir, candidate, role).parsed);
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
    logger.finalize({
      status: "error",
      error
    });
  } finally {
    restoreStreams();
  }
}

await main();
