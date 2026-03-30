#!/usr/bin/env node

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";

function isBroadGitAddCommand(command) {
  const normalized = String(command || "").replace(/\s+/g, " ").trim();
  if (!/\bgit\s+add\b/i.test(normalized)) {
    return false;
  }

  const broadPatterns = [
    /\bgit\s+add\s+\.(?:\s|$)/i,
    /\bgit\s+add\s+-A(?:\s|$)/i,
    /\bgit\s+add\s+--all(?:\s|$)/i,
    /\bgit\s+add\s+-u(?:\s|$)/i,
    /\bgit\s+add\s+--update(?:\s|$)/i,
    /\bgit\s+add\b[\s\S]*\s:\/(?:\s|$)/i,
    /\bgit\s+add\b[\s\S]*\*(?:\s|$)/i
  ];

  return broadPatterns.some((pattern) => pattern.test(normalized));
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const logger = startRuntimeInvocationLogging({
    projectDir: project.projectDir,
    scriptName: "guards/validate-git.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const command = String(input.command || input.cmd || input.tool_input?.command || "").trim();

    const blocked = isBroadGitAddCommand(command);
    if (!blocked) {
      logger.finalize({
        status: "ok",
        metadata: {
          blocked: false,
          command
        }
      });
      return;
    }

    process.stdout.write(
      JSON.stringify({
        ok: false,
        code: "broad_git_add_denied",
        message:
          "'git add .' and broad all-file staging are not allowed. Stage specific files or directories instead.",
        examples: ["git add path/to/file.txt", "git add directory/", "git add '*.ts'"]
      }) + "\n"
    );
    logger.finalize({
      status: "blocked",
      metadata: {
        blocked: true,
        command
      }
    });
    process.exit(2);
  } catch (error) {
    process.stderr.write(`guards/validate-git error: ${error instanceof Error ? error.message : String(error)}\n`);
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
