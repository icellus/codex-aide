#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { ensureDir, getProjectContext, readJsonStdinEnvelope } from "../scripts/runtime-utils.mjs";

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch {
    return {};
  }
}

function hookLogPath(projectDir, timestamp) {
  const day = String(timestamp || new Date().toISOString()).slice(0, 10) || "unknown-date";
  const logDir = path.join(projectDir, ".codex", "logs", "codex-hooks");
  ensureDir(logDir);
  return path.join(logDir, `${day}.jsonl`);
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const timestamp = new Date().toISOString();
  const eventName = String(input.hook_event_name || "").trim() || "unknown";

  try {
    const payload = {
      capturedAt: timestamp,
      projectDir: project.projectDir,
      projectDirSource: project.source,
      hookEventName: eventName,
      sessionId: input.session_id || null,
      turnId: input.turn_id || null,
      cwd: input.cwd || process.cwd(),
      transcriptPath: input.transcript_path || null,
      payload: cloneJson(input),
      rawInput: envelope.raw
    };
    fs.appendFileSync(hookLogPath(project.projectDir, timestamp), `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Hook logging should fail open and never block Codex.
  }

  if (eventName === "Stop") {
    process.stdout.write('{"continue":true}\n');
  }
}

await main();
