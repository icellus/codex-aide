#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";

const agentsAllowedSections = new Set([
  "Scope And Precedence",
  "Product Defaults",
  "Route Intents",
  "Authority Map",
  "Top-Level Guardrails"
]);

const agentsForbiddenPatterns = [
  "## Read Order",
  "## Sources of truth",
  "## Output Contract",
  "## Structured Result",
  "## Runtime Entrypoints",
  "context/startup.mjs",
  "context/session.mjs",
  "context/task-overview.mjs",
  "governance/writeback.mjs",
  "governance/audit.mjs",
  "runtime/state.mjs"
];

function relativeTargetPath(projectDir, targetPath) {
  const absoluteTargetPath = path.resolve(projectDir, targetPath);
  const relativePath = path.relative(projectDir, absoluteTargetPath).replace(/\\/g, "/");
  if (!relativePath || relativePath.startsWith("..")) {
    throw new Error("targetPath must stay inside the project directory");
  }
  return relativePath;
}

function readTargetText(projectDir, relativePath) {
  const filePath = path.join(projectDir, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`${relativePath} not found`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function validateAgents(text) {
  const errors = [];
  const headings = Array.from(text.matchAll(/^##\s+(.+)$/gm)).map((match) => match[1].trim());

  for (const heading of headings) {
    if (!agentsAllowedSections.has(heading)) {
      errors.push(`disallowed section heading "${heading}"`);
    }
  }

  for (const pattern of agentsForbiddenPatterns) {
    if (text.includes(pattern)) {
      errors.push(`forbidden pattern "${pattern}"`);
    }
  }

  return errors;
}

function validateRoutingPolicy(text) {
  const errors = [];
  for (const required of ["technical_manager", "QC Gate", "Submit Gate"]) {
    if (!text.includes(required)) {
      errors.push(`missing required term "${required}"`);
    }
  }
  return errors;
}

function validateAideGovernancePolicy(text) {
  const errors = [];
  for (const required of [
    "This file is the single authority for `Aide` governance rules.",
    "Only `G1` items may be auto-fixed.",
    "## Generic Writeback Gates"
  ]) {
    if (!text.includes(required)) {
      errors.push(`missing required term "${required}"`);
    }
  }
  return errors;
}

function validateSkill(text) {
  if (text.includes("## Read Order") || text.includes("## Sources of truth")) {
    return [];
  }
  return ['missing required section; expected one of "## Read Order" or "## Sources of truth"'];
}

function validateAgent(text) {
  return text.includes("developer_instructions") ? [] : ['missing required term "developer_instructions"'];
}

function validateProjectProfile(text) {
  return text.includes("This file is not runtime authority.")
    ? []
    : ['missing required term "This file is not runtime authority."'];
}

function validatorForTarget(relativePath) {
  if (relativePath === "AGENTS.md" || relativePath === "starter/AGENTS.md") {
    return {
      kind: "AGENTS",
      validate: validateAgents
    };
  }

  if (relativePath === ".codex/aide/policies/routing-policy.md" || relativePath === "starter/aide/policies/routing-policy.md") {
    return {
      kind: "routing-policy",
      validate: validateRoutingPolicy
    };
  }

  if (
    relativePath === ".codex/aide/policies/aide-governance-policy.md" ||
    relativePath === "starter/aide/policies/aide-governance-policy.md"
  ) {
    return {
      kind: "aide-governance-policy",
      validate: validateAideGovernancePolicy
    };
  }

  if (
    (relativePath.startsWith(".codex/aide/skills/") || relativePath.startsWith("starter/aide/skills/")) &&
    relativePath.endsWith("/SKILL.md")
  ) {
    return {
      kind: "skill",
      validate: validateSkill
    };
  }

  if (
    (relativePath.startsWith(".codex/aide/agents/") || relativePath.startsWith("starter/aide/agents/")) &&
    relativePath.endsWith(".toml")
  ) {
    return {
      kind: "agent",
      validate: validateAgent
    };
  }

  if (
    relativePath === ".codex/aide/context/project-profile.md" ||
    relativePath === "starter/aide/context/project-profile.md"
  ) {
    return {
      kind: "project-profile",
      validate: validateProjectProfile
    };
  }

  return null;
}

function validateGovernanceTarget({ projectDir, targetPath }) {
  const relativePath = relativeTargetPath(projectDir, targetPath);
  const validator = validatorForTarget(relativePath);

  if (!validator) {
    return {
      ok: false,
      code: "unsupported_target",
      targetPath: relativePath,
      errors: [`${relativePath} has no generic governance target validator`]
    };
  }

  const text = readTargetText(projectDir, relativePath);
  const errors = validator.validate(text);

  return {
    ok: errors.length === 0,
    code: errors.length === 0 ? "ok" : "target_invalid",
    kind: validator.kind,
    targetPath: relativePath,
    errors
  };
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--target") {
      options.targetPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--project-dir") {
      options.projectDir = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

async function main(argv = process.argv.slice(2)) {
  let cliOptions = {};

  try {
    cliOptions = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(
      "Usage: node .codex/aide/scripts/guards/validate-governance-target.mjs [--project-dir <path>] --target <path>\n"
    );
    return 2;
  }

  const envelope = await readJsonStdinEnvelope();
  const input = {
    ...envelope.value,
    projectDir: cliOptions.projectDir || envelope.value.projectDir,
    targetPath: cliOptions.targetPath || envelope.value.targetPath
  };
  const project = getProjectContext(input);
  const logger = startRuntimeInvocationLogging({
    projectDir: project.projectDir,
    scriptName: "guards/validate-governance-target.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    if (typeof input.targetPath !== "string" || !input.targetPath.trim()) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          code: "target_missing",
          errors: ["targetPath is required"]
        }) + "\n"
      );
      logger.finalize({
        status: "blocked",
        metadata: {
          targetMissing: true
        }
      });
      return 2;
    }

    const result = validateGovernanceTarget({
      projectDir: project.projectDir,
      targetPath: input.targetPath
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    logger.finalize({
      status: result.ok ? "ok" : "blocked",
      metadata: result
    });
    return result.ok ? 0 : 2;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        code: "target_validation_error",
        errors: [error instanceof Error ? error.message : String(error)]
      }) + "\n"
    );
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

export { validateGovernanceTarget };
