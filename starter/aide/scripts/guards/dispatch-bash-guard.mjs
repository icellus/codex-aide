#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { getProjectContext } from "../shared/project-context.mjs";
import { collectGitInvocations, commandContainsTests, commandDecision, readCommandInput } from "./validate-git.mjs";

const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "rev-parse", "symbolic-ref", "describe", "merge-base", "ls-files", "ls-remote"]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function requiresGuardDispatch(command) {
  if (commandContainsTests(command)) {
    return true;
  }

  const gitInvocations = collectGitInvocations(command);
  if (gitInvocations.length === 0) {
    return false;
  }

  return gitInvocations.some((invocation) => !READ_ONLY_GIT_SUBCOMMANDS.has(normalizeText(invocation?.subcommand)));
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const command = readCommandInput(input);

  if (!requiresGuardDispatch(command)) {
    return;
  }

  const project = getProjectContext(input);
  const logger = startRuntimeInvocationLogging({
    projectDir: project.projectDir,
    scriptName: "guards/dispatch-bash-guard.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const decision = commandDecision(command, project.projectDir);

    if (decision) {
      process.stdout.write(`${JSON.stringify(decision)}\n`);
    }

    logger.finalize({
      status: "ok",
      metadata: {
        decision: decision ? "deny" : "allow",
        hasCommand: Boolean(command),
        dispatched: true
      }
    });
  } catch (error) {
    process.stderr.write(`guards/dispatch-bash-guard error: ${error instanceof Error ? error.message : String(error)}\n`);
    logger.finalize({
      status: "error",
      error
    });
    process.exit(1);
  } finally {
    restoreStreams();
  }
}

const isEntrypoint = Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  await main();
}
