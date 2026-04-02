#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { ensureDir, startRuntimeInvocationLogging } from "../shared/logging.mjs";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function demoRepoContextPath(projectDir) {
  return path.join(projectDir, ".codex", "state", "repo-context.demo.json");
}

function repoContextPath(projectDir) {
  return path.join(projectDir, ".codex", "state", "repo-context.json");
}

function loadDemoTemplate(projectDir) {
  const filePath = demoRepoContextPath(projectDir);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readExistingRepoContext(projectDir) {
  const filePath = repoContextPath(projectDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeRepoContext(input) {
  if (!isPlainObject(input)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(input));
  } catch {
    return {};
  }
}

function writeRepoContext(projectDir, value) {
  const filePath = repoContextPath(projectDir);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveScanStatus(explicitStatus, candidateStatus, previousStatus) {
  const explicitValue = normalizeText(explicitStatus);
  if (explicitValue) {
    return explicitValue;
  }

  const candidateValue = normalizeText(candidateStatus);
  if (candidateValue) {
    return candidateValue;
  }

  const previousValue = normalizeText(previousStatus);
  if (previousValue && previousValue !== "not-scanned") {
    return previousValue;
  }

  return "complete";
}

function resolveScanReason(explicitReason, candidateReason, previousReason) {
  return normalizeText(explicitReason) || normalizeText(candidateReason) || normalizeText(previousReason);
}

function buildRepoContext({ projectDir, input, previousState, template, timestamp }) {
  const replaceExisting = input.replace_existing !== false;
  const provided = sanitizeRepoContext(input.repo_context);
  const base = replaceExisting ? template : { ...template, ...(previousState || {}) };

  const next = {
    ...base,
    ...provided,
    generated_at: timestamp,
    repo_root: path.resolve(projectDir),
    scan_reason: resolveScanReason(input.scan_reason, provided.scan_reason, base.scan_reason),
    scan_status: resolveScanStatus(input.scan_status, provided.scan_status, base.scan_status)
  };

  return next;
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  const input = envelope.value;
  const project = getProjectContext(input);
  const logger = startRuntimeInvocationLogging({
    projectDir: project.projectDir,
    scriptName: "context/repo-context.mjs",
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

    const timestamp = new Date().toISOString();
    const template = loadDemoTemplate(project.projectDir);
    const previousState = readExistingRepoContext(project.projectDir);
    const next = buildRepoContext({
      projectDir: project.projectDir,
      input,
      previousState,
      template,
      timestamp
    });

    writeRepoContext(project.projectDir, next);

    const payload = {
      ok: true,
      action: "write-scan",
      project_dir: project.projectDir,
      source: project.source,
      repo_context: {
        repo_root: next.repo_root,
        scan_reason: next.scan_reason,
        scan_status: next.scan_status
      }
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    logger.finalize({
      status: "ok",
      metadata: payload
    });
    return 0;
  } catch (error) {
    process.stderr.write(`context/repo-context error: ${error instanceof Error ? error.message : String(error)}\n`);
    logger.finalize({
      status: "error",
      error
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
