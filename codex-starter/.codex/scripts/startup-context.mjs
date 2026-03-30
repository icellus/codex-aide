#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { getProjectContext, readJsonStdinEnvelope, startRuntimeInvocationLogging } from "./runtime-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeStepInput(input, projectDir, extra = {}) {
  return {
    ...input,
    cwd: input.cwd || projectDir,
    ...extra
  };
}

function runStep(projectDir, scriptName, input) {
  const scriptPath = path.join(__dirname, scriptName);
  return spawnSync(process.execPath, [scriptPath], {
    cwd: projectDir,
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: projectDir
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8"
  });
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "startup-context.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const trigger = String(input.trigger || "startup").trim().toLowerCase() || "startup";
    const steps = [
      {
        scriptName: "task-overview.mjs",
        input: normalizeStepInput(input, projectDir)
      },
      {
        scriptName: "aide-writeback.mjs",
        input: normalizeStepInput(input, projectDir, { trigger })
      },
      {
        scriptName: "session-context.mjs",
        input: normalizeStepInput(input, projectDir)
      }
    ];

    const results = [];

    for (const step of steps) {
      const result = runStep(projectDir, step.scriptName, step.input);
      results.push({
        script: step.scriptName,
        status: result.status,
        signal: result.signal
      });

      if (result.stdout) {
        process.stdout.write(result.stdout);
      }

      if (result.stderr) {
        process.stderr.write(result.stderr);
      }

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        logger.finalize({
          status: "error",
          error: new Error(`${step.scriptName} exited with status ${result.status ?? "unknown"}`),
          metadata: {
            trigger,
            results
          }
        });
        process.exit(result.status || 1);
      }
    }

    logger.finalize({
      status: "ok",
      metadata: {
        trigger,
        results
      }
    });
  } catch (error) {
    process.stderr.write(`startup-context error: ${error instanceof Error ? error.message : String(error)}\n`);
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
