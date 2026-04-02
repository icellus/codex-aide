#!/usr/bin/env node

import path from "node:path";

import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { writePendingGovernanceResult } from "../shared/pending-turn-results.mjs";
import { getProjectContext } from "../shared/project-context.mjs";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function runtimeMetadata(input) {
  return {
    session_id: normalizeText(input.session_id || input.sessionId || process.env.CODEX_SESSION_ID),
    turn_id: normalizeText(input.turn_id || input.turnId || process.env.CODEX_TURN_ID)
  };
}

function resolveResultPayload(input) {
  if (input?.result && typeof input.result === "object" && !Array.isArray(input.result)) {
    return input.result;
  }

  return input;
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "governance/record-governance-result.mjs",
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

    const result = resolveResultPayload(input);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("governance result must be a JSON object");
    }

    const role = normalizeText(result.role);
    if (role !== "Aide") {
      throw new Error("governance result role must be Aide");
    }

    writePendingGovernanceResult(projectDir, result, runtimeMetadata(input));
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        action: "record-governance-result",
        role,
        path: path.join(".codex", "aide", "state", "pending-governance-result.json").replace(/\\/g, "/")
      })}\n`
    );
    logger.finalize({
      status: "ok",
      metadata: {
        role
      }
    });
  } catch (error) {
    process.stderr.write(`governance/record-governance-result error: ${error instanceof Error ? error.message : String(error)}\n`);
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
