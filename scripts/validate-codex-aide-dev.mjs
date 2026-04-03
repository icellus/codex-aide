import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateConsistency, validateGovernanceTargetContracts, validateJsonContracts } from "./lib/codex-aide-dev-validator/contract-shape.mjs";
import {
  validateGovernanceFlowContracts,
  validateProjectContextBehaviorContracts,
  validateRepoContextBehaviorContracts,
  validateTaskStateBehaviorContracts
} from "./lib/codex-aide-dev-validator/behavior-context.mjs";
import {
  validateHookRootBehaviorContracts,
  validateProgressDemoContracts,
  validateTaskProgressSyncBehaviorContracts,
  validateValidateGitBehaviorContracts
} from "./lib/codex-aide-dev-validator/behavior-hooks.mjs";
import { validateSubmitDeliveryBehaviorContracts } from "./lib/codex-aide-dev-validator/behavior-submit.mjs";
import { defaultRepoRoot, normalizeRepoRelativePath } from "./lib/codex-aide-dev-validator/shared.mjs";
import { formatSummary, runLayers, validateMeta, validateRegistry } from "./lib/codex-aide-dev-validator/meta-runner.mjs";

function parseArgs(argv) {
  const validModes = new Set(["contract", "consistency", "meta", "full"]);
  let mode = "full";
  let repoRoot = defaultRepoRoot;
  const changedFiles = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo-root") {
      repoRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--changed-file") {
      changedFiles.push(normalizeRepoRelativePath(argv[index + 1]));
      index += 1;
      continue;
    }

    if (validModes.has(arg)) {
      mode = arg;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return {
    mode,
    repoRoot,
    changedFiles: [...new Set(changedFiles.filter(Boolean))]
  };
}

function shouldCopyValidationPath(sourceRepoRoot, candidatePath) {
  const relativePath = path.relative(sourceRepoRoot, candidatePath).replace(/\\/g, "/");
  if (!relativePath) {
    return true;
  }

  if (relativePath === ".git" || relativePath.startsWith(".git/")) {
    return false;
  }

  if (relativePath === ".codex" || relativePath.startsWith(".codex/")) {
    return false;
  }

  return true;
}

function withIsolatedRepoRoot(sourceRepoRoot, callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-skills-validator-"));
  const isolatedRepoRoot = path.join(tempRoot, "repo");

  fs.cpSync(sourceRepoRoot, isolatedRepoRoot, {
    recursive: true,
    filter: (src) => shouldCopyValidationPath(sourceRepoRoot, path.resolve(src))
  });

  try {
    return callback(isolatedRepoRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runCli(argv = process.argv.slice(2)) {
  let options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(
      "Usage: node scripts/validate-codex-aide-dev.mjs [contract|consistency|meta|full] [--repo-root <path>]\n"
    );
    return 2;
  }

  const layerResults = withIsolatedRepoRoot(options.repoRoot, (isolatedRepoRoot) =>
    runLayers(options.mode, isolatedRepoRoot, {
      changedFiles: options.changedFiles
    })
  );
  let hasErrors = false;

  for (const [layerName, result] of layerResults) {
    const summary = formatSummary(result.summary);
    if (result.ok) {
      process.stdout.write(`[${layerName}] PASS${summary}\n`);
      continue;
    }

    hasErrors = true;
    process.stderr.write(`[${layerName}] FAIL${summary}\n`);
    for (const error of result.errors) {
      process.stderr.write(`- ${error}\n`);
    }
  }

  if (hasErrors) {
    return 1;
  }

  process.stdout.write("codex-aide development validation passed\n");
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(runCli());
}

export {
  validateConsistency,
  validateGovernanceFlowContracts,
  validateGovernanceTargetContracts,
  validateHookRootBehaviorContracts,
  validateJsonContracts,
  validateMeta,
  validateProgressDemoContracts,
  validateProjectContextBehaviorContracts,
  validateRegistry,
  validateRepoContextBehaviorContracts,
  validateTaskProgressSyncBehaviorContracts,
  validateTaskStateBehaviorContracts,
  validateValidateGitBehaviorContracts,
  validateSubmitDeliveryBehaviorContracts
};
