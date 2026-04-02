#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";

const allowedStatuses = new Set(["not-set", "draft", "verified", "needs-refresh"]);
const baselineKeys = ["smoke", "lint", "typecheck", "build", "unit", "integration", "e2e"];
const topLevelKeys = ["version", "status", "sources", "repo_baseline", "ownership", "constraints"];
const ownershipKeys = [
  "maintained_by",
  "baseline_content_prepared_by",
  "purpose",
  "task_level_validation_owner",
  "baseline_refresh_feedback_reported_by",
  "notes"
];
const constraintKeys = ["requires_services", "expensive", "notes"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function profilePath(projectDir) {
  return path.join(projectDir, ".codex", "aide", "policies", "validation-profile.json");
}

function readProfile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateProfile(profile) {
  const errors = [];

  if (!isPlainObject(profile)) {
    return ["validation-profile.json must be a JSON object"];
  }

  for (const key of Object.keys(profile)) {
    if (!topLevelKeys.includes(key)) {
      errors.push(`unexpected top-level field "${key}"`);
    }
  }

  if (!allowedStatuses.has(profile.status)) {
    errors.push(`status must be one of ${Array.from(allowedStatuses).join(", ")}`);
  }

  if (!Array.isArray(profile.sources)) {
    errors.push("sources must be an array");
  }

  if (profile.status !== "not-set" && Array.isArray(profile.sources) && profile.sources.length === 0) {
    errors.push('sources must be non-empty when status is not "not-set"');
  }

  if (!isPlainObject(profile.repo_baseline)) {
    errors.push("repo_baseline must be an object");
  } else {
    for (const key of Object.keys(profile.repo_baseline)) {
      if (!baselineKeys.includes(key)) {
        errors.push(`unexpected repo_baseline field "${key}"`);
      }
    }

    for (const key of baselineKeys) {
      if (typeof profile.repo_baseline[key] !== "string") {
        errors.push(`repo_baseline.${key} must be a string`);
      }
    }
  }

  if (!isPlainObject(profile.ownership)) {
    errors.push("ownership must be an object");
  } else {
    for (const key of Object.keys(profile.ownership)) {
      if (!ownershipKeys.includes(key)) {
        errors.push(`unexpected ownership field "${key}"`);
      }
    }

    if (profile.ownership.maintained_by !== "Aide") {
      errors.push('ownership.maintained_by must equal "Aide"');
    }

    if (profile.ownership.baseline_content_prepared_by !== "technical_manager") {
      errors.push('ownership.baseline_content_prepared_by must equal "technical_manager"');
    }

    if (profile.ownership.task_level_validation_owner !== "tester") {
      errors.push('ownership.task_level_validation_owner must equal "tester"');
    }

    if (profile.ownership.baseline_refresh_feedback_reported_by !== "tester") {
      errors.push('ownership.baseline_refresh_feedback_reported_by must equal "tester"');
    }

    if (!Array.isArray(profile.ownership.notes)) {
      errors.push("ownership.notes must be an array");
    }
  }

  if (!isPlainObject(profile.constraints)) {
    errors.push("constraints must be an object");
  } else {
    for (const key of Object.keys(profile.constraints)) {
      if (!constraintKeys.includes(key)) {
        errors.push(`unexpected constraints field "${key}"`);
      }
    }

    if (!Array.isArray(profile.constraints.requires_services)) {
      errors.push("constraints.requires_services must be an array");
    }

    if (!Array.isArray(profile.constraints.expensive)) {
      errors.push("constraints.expensive must be an array");
    }

    if (!Array.isArray(profile.constraints.notes)) {
      errors.push("constraints.notes must be an array");
    }
  }

  return errors;
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const logger = startRuntimeInvocationLogging({
    projectDir: project.projectDir,
    scriptName: "guards/validate-validation-profile.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const filePath = profilePath(project.projectDir);
    if (!fs.existsSync(filePath)) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          code: "validation_profile_missing",
          message: ".codex/aide/policies/validation-profile.json not found"
        }) + "\n"
      );
      logger.finalize({
        status: "blocked",
        metadata: {
          filePath,
          missing: true
        }
      });
      process.exit(2);
    }

    let profile;
    try {
      profile = readProfile(filePath);
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          code: "validation_profile_invalid_json",
          message: error instanceof Error ? error.message : String(error)
        }) + "\n"
      );
      logger.finalize({
        status: "blocked",
        metadata: {
          filePath,
          invalidJson: true
        }
      });
      process.exit(2);
    }

    const errors = validateProfile(profile);
    if (errors.length > 0) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          code: "validation_profile_invalid",
          errors
        }) + "\n"
      );
      logger.finalize({
        status: "blocked",
        metadata: {
          filePath,
          errors
        }
      });
      process.exit(2);
    }

    process.stdout.write(
      JSON.stringify({
        ok: true,
        file: ".codex/aide/policies/validation-profile.json",
        status: profile.status
      }) + "\n"
    );
    logger.finalize({
      status: "ok",
      metadata: {
        filePath,
        validationStatus: profile.status
      }
    });
  } catch (error) {
    process.stderr.write(
      `guards/validate-validation-profile error: ${error instanceof Error ? error.message : String(error)}\n`
    );
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
