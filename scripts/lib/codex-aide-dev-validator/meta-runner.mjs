import fs from "node:fs";
import path from "node:path";

import { validateAuthority } from "../../validate-codex-aide-authority.mjs";
import { validateGovernanceTarget } from "../../../starter/aide/scripts/guards/validate-governance-target.mjs";

import {
  defaultRepoRoot,
  fileExists,
  getRegistryPath,
  listFilesRecursive,
  loadJsonFile,
  normalizeRepoRelativePath,
  pathCoversRelativeTarget,
  relativeRepoPath
} from "./shared.mjs";
import { validateConsistency, validateGovernanceTargetContracts, validateJsonContracts } from "./contract-shape.mjs";
import {
  validateGovernanceFlowContracts,
  validateProjectContextBehaviorContracts,
  validateRepoContextBehaviorContracts,
  validateTaskStateBehaviorContracts
} from "./behavior-context.mjs";
import {
  validateHookRootBehaviorContracts,
  validateTaskProgressSyncBehaviorContracts,
  validateValidateGitBehaviorContracts
} from "./behavior-hooks.mjs";
import { validateSubmitDeliveryBehaviorContracts } from "./behavior-submit.mjs";

const runnableStatuses = new Set(["active", "temporary"]);
const behaviorFilterBypassPaths = new Set([
  "scripts/validate-codex-aide-dev.mjs",
  "tests/standards/codex-aide-test-registry.json"
]);

function normalizeAliasMap(registry, errors) {
  if (registry.path_aliases === undefined) {
    return {};
  }

  if (!registry.path_aliases || typeof registry.path_aliases !== "object" || Array.isArray(registry.path_aliases)) {
    errors.push("tests/standards/codex-aide-test-registry.json: path_aliases must be an object when provided");
    return {};
  }

  return registry.path_aliases;
}

function resolveRegistryAlias(aliasMap, alias, errors, label) {
  const resolvedPath = aliasMap?.[alias];
  if (typeof resolvedPath !== "string" || resolvedPath.length === 0) {
    errors.push(`${label}: unknown path alias "${alias}"`);
    return null;
  }

  return resolvedPath;
}

function normalizeRegistryCheck(aliasMap, check, errors) {
  const normalizedCheck = { ...check };

  if (typeof check.owner_alias === "string" && check.owner_alias) {
    normalizedCheck.owner = resolveRegistryAlias(aliasMap, check.owner_alias, errors, `${check.id || "<unknown>"} owner_alias`);
  }

  if (Array.isArray(check.source_path_aliases) && check.source_path_aliases.length > 0) {
    const aliasPaths = [];
    for (const alias of check.source_path_aliases) {
      if (typeof alias !== "string" || alias.length === 0) {
        errors.push(`${check.id || "<unknown>"}: source_path_aliases entries must be non-empty strings`);
        continue;
      }

      const resolvedPath = resolveRegistryAlias(aliasMap, alias, errors, `${check.id || "<unknown>"} source_path_aliases`);
      if (resolvedPath) {
        aliasPaths.push(resolvedPath);
      }
    }

    normalizedCheck.source_paths = [...(Array.isArray(check.source_paths) ? check.source_paths : []), ...aliasPaths];
  }

  for (const [fieldName, aliasFieldName] of [
    ["proof_fixture_root", "proof_fixture_root_alias"],
    ["scenario_root", "scenario_root_alias"]
  ]) {
    if (typeof check[aliasFieldName] === "string" && check[aliasFieldName]) {
      normalizedCheck[fieldName] = resolveRegistryAlias(
        aliasMap,
        check[aliasFieldName],
        errors,
        `${check.id || "<unknown>"} ${aliasFieldName}`
      );
    }
  }

  return normalizedCheck;
}

function normalizeRegistry(registry, errors) {
  const aliasMap = normalizeAliasMap(registry, errors);
  return {
    ...registry,
    checks: Array.isArray(registry.checks) ? registry.checks.map((check) => normalizeRegistryCheck(aliasMap, check, errors)) : []
  };
}

function proofScenarioRoot(repoRoot, check) {
  return path.join(repoRoot, check.proof_fixture_root);
}

function createExecutor({ layer, assertionKind, requiresProof, runActive, runProof }) {
  return Object.freeze({
    layer,
    assertionKind,
    requiresProof,
    runActive,
    ...(runProof ? { runProof } : {})
  });
}

function createRepoRootExecutor({ layer, assertionKind, validator, requiresProof = true }) {
  return createExecutor({
    layer,
    assertionKind,
    requiresProof,
    runActive: ({ repoRoot }) => validator({ repoRoot }),
    runProof: requiresProof ? ({ repoRoot, check }) => validator({ repoRoot: proofScenarioRoot(repoRoot, check) }) : undefined
  });
}

function createScenarioExecutor({ validator, activeScenarioRoot }) {
  return createExecutor({
    layer: "contract",
    assertionKind: "behavior",
    requiresProof: true,
    runActive: ({ repoRoot, check }) =>
      validator(activeScenarioRoot ? { repoRoot, scenarioRoot: activeScenarioRoot(repoRoot, check) } : { repoRoot }),
    runProof: ({ repoRoot, check }) => validator({ repoRoot, scenarioRoot: proofScenarioRoot(repoRoot, check) })
  });
}

const defaultHookRootScenario = path.join("fixtures", "codex-aide-dev", "hook-root-pass");
const executorDefinitions = Object.freeze({
  "authority-shape": createRepoRootExecutor({
    layer: "contract",
    assertionKind: "shape",
    validator: validateAuthority
  }),
  "json-shape": createExecutor({
    layer: "contract",
    assertionKind: "shape",
    requiresProof: false,
    runActive: ({ repoRoot }) => validateJsonContracts({ repoRoot })
  }),
  "governance-target-shape": createExecutor({
    layer: "contract",
    assertionKind: "shape",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateGovernanceTargetContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) =>
      validateGovernanceTarget({
        projectDir: path.join(repoRoot, check.proof_fixture_root, check.proof_project_path || "."),
        targetPath: check.proof_target_path
      })
  }),
  "governance-flow": createScenarioExecutor({ validator: validateGovernanceFlowContracts }),
  "task-state-behavior": createScenarioExecutor({ validator: validateTaskStateBehaviorContracts }),
  "task-progress-sync-behavior": createScenarioExecutor({ validator: validateTaskProgressSyncBehaviorContracts }),
  "repo-context-behavior": createScenarioExecutor({ validator: validateRepoContextBehaviorContracts }),
  "project-context-behavior": createScenarioExecutor({ validator: validateProjectContextBehaviorContracts }),
  "hook-root-behavior": createScenarioExecutor({
    validator: validateHookRootBehaviorContracts,
    activeScenarioRoot: (repoRoot, check) => path.join(repoRoot, check?.scenario_root || defaultHookRootScenario)
  }),
  "validate-git-behavior": createScenarioExecutor({ validator: validateValidateGitBehaviorContracts }),
  "submit-delivery-behavior": createScenarioExecutor({ validator: validateSubmitDeliveryBehaviorContracts }),
  "text-consistency": createRepoRootExecutor({
    layer: "consistency",
    assertionKind: "consistency",
    validator: validateConsistency
  }),
  "registry-meta": createExecutor({
    layer: "meta",
    assertionKind: "meta",
    requiresProof: false,
    runActive: ({ repoRoot }) => validateMeta({ repoRoot })
  })
});

function validateRegistryExecutionShape({ repoRoot, registryFilePath = getRegistryPath(repoRoot) } = {}) {
  const errors = [];
  const rawRegistry = loadJsonFile(repoRoot, registryFilePath, errors);

  if (rawRegistry === null) {
    return { ok: false, errors, registry: null };
  }

  const registry = normalizeRegistry(rawRegistry, errors);

  if (!Array.isArray(registry.checks) || registry.checks.length === 0) {
    errors.push("tests/standards/codex-aide-test-registry.json: checks must be a non-empty array");
    return { ok: false, errors, registry };
  }

  for (const check of registry.checks) {
    for (const field of ["id", "layer", "assertion_kind", "status", "executor"]) {
      if (!check[field]) {
        errors.push(`tests/standards/codex-aide-test-registry.json: check is missing ${field}`);
      }
    }

    const definition = executorDefinitions[check.executor];
    if (!definition) {
      errors.push(`${check.id || "<unknown>"}: unsupported executor "${check.executor || "<missing>"}"`);
      continue;
    }

    if (check.layer && check.layer !== definition.layer) {
      errors.push(`${check.id}: executor "${check.executor}" must stay in layer "${definition.layer}"`);
    }

    if (check.assertion_kind && check.assertion_kind !== definition.assertionKind) {
      errors.push(`${check.id}: executor "${check.executor}" must use assertion_kind "${definition.assertionKind}"`);
    }
  }

  return { ok: errors.length === 0, errors, registry };
}

function validateRegistry({
  repoRoot = defaultRepoRoot,
  registryFilePath = getRegistryPath(repoRoot)
} = {}) {
  const errors = [];
  const rawRegistry = loadJsonFile(repoRoot, registryFilePath, errors);
  const validLayers = new Set(["contract", "consistency", "meta"]);
  const validAssertionKinds = new Set(["shape", "behavior", "consistency", "meta"]);
  const validStatuses = new Set(["active", "temporary", "deprecated"]);
  const seenIds = new Set();
  const seenCoverageKeys = new Set();

  if (rawRegistry === null) {
    return { ok: false, errors, registry: null };
  }

  const registry = normalizeRegistry(rawRegistry, errors);

  if (!Number.isInteger(registry.version) || registry.version < 1) {
    errors.push("tests/standards/codex-aide-test-registry.json: version must be an integer >= 1");
  }

  if (!registry.budgets || typeof registry.budgets !== "object") {
    errors.push("tests/standards/codex-aide-test-registry.json: budgets must be an object");
  }

  if (!Array.isArray(registry.checks) || registry.checks.length === 0) {
    errors.push("tests/standards/codex-aide-test-registry.json: checks must be a non-empty array");
    return { ok: false, errors, registry };
  }

  let runnableChecks = 0;
  const runnableLayers = new Map([
    ["contract", 0],
    ["consistency", 0],
    ["meta", 0]
  ]);

  for (const check of registry.checks) {
    for (const field of ["id", "layer", "assertion_kind", "rule_id", "failure_mode", "owner", "status", "executor"]) {
      if (!check[field]) {
        errors.push(`tests/standards/codex-aide-test-registry.json: check is missing ${field}`);
      }
    }

    if (!Array.isArray(check.source_paths) || check.source_paths.length === 0) {
      errors.push(`${check.id || "<unknown>"}: source_paths must be a non-empty array`);
    }

    if (check.id) {
      if (seenIds.has(check.id)) {
        errors.push(`tests/standards/codex-aide-test-registry.json: duplicate check id "${check.id}"`);
      }
      seenIds.add(check.id);
    }

    if (check.layer && !validLayers.has(check.layer)) {
      errors.push(`${check.id}: unsupported layer "${check.layer}"`);
    }

    if (check.assertion_kind && !validAssertionKinds.has(check.assertion_kind)) {
      errors.push(`${check.id}: unsupported assertion_kind "${check.assertion_kind}"`);
    }

    if (check.status && !validStatuses.has(check.status)) {
      errors.push(`${check.id}: unsupported status "${check.status}"`);
    }

    const definition = executorDefinitions[check.executor];
    if (!definition) {
      errors.push(`${check.id}: unsupported executor "${check.executor}"`);
    } else {
      if (check.layer && check.layer !== definition.layer) {
        errors.push(`${check.id}: executor "${check.executor}" must stay in layer "${definition.layer}"`);
      }

      if (check.assertion_kind && check.assertion_kind !== definition.assertionKind) {
        errors.push(`${check.id}: executor "${check.executor}" must use assertion_kind "${definition.assertionKind}"`);
      }
    }

    if (check.owner && !fileExists(path.join(repoRoot, check.owner))) {
      errors.push(`${check.id}: owner path not found "${check.owner}"`);
    }

    for (const sourcePath of check.source_paths || []) {
      if (!fileExists(path.join(repoRoot, sourcePath))) {
        errors.push(`${check.id}: source path not found "${sourcePath}"`);
      }
    }

    if (check.status === "temporary" && !check.remove_when) {
      errors.push(`${check.id}: temporary checks must declare remove_when`);
    }

    if (definition?.requiresProof) {
      if (!check.proof_fixture_root) {
        errors.push(`${check.id}: ${check.executor} checks must declare proof_fixture_root`);
      }

      if (!Array.isArray(check.expected_error_patterns) || check.expected_error_patterns.length === 0) {
        errors.push(`${check.id}: ${check.executor} checks must declare expected_error_patterns`);
      }
    }

    if (check.executor === "governance-target-shape" && !check.proof_target_path) {
      errors.push(`${check.id}: governance-target-shape checks must declare proof_target_path`);
    }

    if (check.proof_fixture_root && !fileExists(path.join(repoRoot, check.proof_fixture_root))) {
      errors.push(`${check.id}: proof fixture root not found "${check.proof_fixture_root}"`);
    }

    if (runnableStatuses.has(check.status)) {
      runnableChecks += 1;
      runnableLayers.set(check.layer, (runnableLayers.get(check.layer) || 0) + 1);

      if (check.layer && check.assertion_kind && check.rule_id && check.failure_mode) {
        const coverageKey = `${check.layer}:${check.assertion_kind}:${check.rule_id}:${check.failure_mode}`;
        if (seenCoverageKeys.has(coverageKey)) {
          errors.push(`${check.id}: duplicates runnable coverage "${coverageKey}"`);
        }
        seenCoverageKeys.add(coverageKey);
      }
    }
  }

  for (const layer of validLayers) {
    if ((runnableLayers.get(layer) || 0) === 0) {
      errors.push(`tests/standards/codex-aide-test-registry.json: no runnable checks registered for layer "${layer}"`);
    }
  }

  const maxActiveChecks = registry.budgets?.max_active_checks;
  if (typeof maxActiveChecks !== "number" || maxActiveChecks < 1) {
    errors.push("tests/standards/codex-aide-test-registry.json: budgets.max_active_checks must be >= 1");
  } else if (runnableChecks > maxActiveChecks) {
    errors.push(`runnable checks ${runnableChecks} exceed budget ${maxActiveChecks}`);
  }

  const fixtureFiles = listFilesRecursive(path.join(repoRoot, "tests", "fixtures", "codex-aide-dev"));
  const fixtureBytes = fixtureFiles.reduce((total, filePath) => total + fs.statSync(filePath).size, 0);

  const maxFixtureFiles = registry.budgets?.max_fixture_files;
  const maxFixtureBytes = registry.budgets?.max_fixture_bytes;

  if (typeof maxFixtureFiles !== "number" || maxFixtureFiles < 1) {
    errors.push("tests/standards/codex-aide-test-registry.json: budgets.max_fixture_files must be >= 1");
  } else if (fixtureFiles.length > maxFixtureFiles) {
    errors.push(`fixture files ${fixtureFiles.length} exceed budget ${maxFixtureFiles}`);
  }

  if (typeof maxFixtureBytes !== "number" || maxFixtureBytes < 1) {
    errors.push("tests/standards/codex-aide-test-registry.json: budgets.max_fixture_bytes must be >= 1");
  } else if (fixtureBytes > maxFixtureBytes) {
    errors.push(`fixture bytes ${fixtureBytes} exceed budget ${maxFixtureBytes}`);
    const largestFixtures = fixtureFiles
      .map((filePath) => ({
        path: relativeRepoPath(repoRoot, filePath),
        size: fs.statSync(filePath).size
      }))
      .sort((left, right) => right.size - left.size)
      .slice(0, 5)
      .map((entry) => `${entry.size}:${entry.path}`);
    if (largestFixtures.length > 0) {
      errors.push(`largest fixtures ${largestFixtures.join(", ")}`);
    }
  }

  return { ok: errors.length === 0, errors, registry };
}

function runFailingProofs({ repoRoot = defaultRepoRoot, registry }) {
  const errors = [];

  for (const check of registry.checks || []) {
    if (!runnableStatuses.has(check.status) || !check.proof_fixture_root) {
      continue;
    }

    const definition = executorDefinitions[check.executor];
    if (!definition?.runProof) {
      continue;
    }

    const result = definition.runProof({ repoRoot, check });

    if (result.ok) {
      errors.push(`${check.id}: failing proof unexpectedly passed`);
      continue;
    }

    for (const pattern of check.expected_error_patterns || []) {
      const resultErrors = Array.isArray(result.errors) ? result.errors : [];
      const matched = resultErrors.some((error) => error.includes(pattern));
      if (!matched) {
        errors.push(`${check.id}: failing proof did not produce expected error pattern "${pattern}"`);
      }
    }
  }

  return errors;
}

function validateMeta({
  repoRoot = defaultRepoRoot,
  registryFilePath = getRegistryPath(repoRoot)
} = {}) {
  const registryResult = validateRegistry({ repoRoot, registryFilePath });
  const errors = [...registryResult.errors];

  if (errors.length === 0) {
    errors.push(...runFailingProofs({ repoRoot, registry: registryResult.registry }));
  }

  return { ok: errors.length === 0, errors };
}

function loadRunnableChecksForLayer({ repoRoot = defaultRepoRoot, layer }) {
  const registryResult = validateRegistryExecutionShape({ repoRoot });
  if (!registryResult.ok) {
    return { ok: false, errors: registryResult.errors, checks: [] };
  }

  const checks = registryResult.registry.checks.filter(
    (check) => runnableStatuses.has(check.status) && check.layer === layer
  );

  if (checks.length === 0) {
    return {
      ok: false,
      errors: [`tests/standards/codex-aide-test-registry.json: no runnable checks available for layer "${layer}"`],
      checks: []
    };
  }

  return { ok: true, errors: [], checks };
}

function normalizeChangedFiles(changedFiles) {
  const normalized = Array.isArray(changedFiles)
    ? [...new Set(changedFiles.map((value) => normalizeRepoRelativePath(value)).filter(Boolean))]
    : [];

  if (normalized.some((filePath) => filePath.startsWith("scripts/lib/codex-aide-dev-validator/"))) {
    normalized.push("scripts/validate-codex-aide-dev.mjs");
  }

  return [...new Set(normalized)];
}

function filterChecksForChangedFiles({ repoRoot = defaultRepoRoot, layer, checks, changedFiles = [] }) {
  const normalizedChangedFiles = normalizeChangedFiles(changedFiles);

  if (layer !== "contract" || normalizedChangedFiles.length === 0) {
    return checks;
  }

  const bypassFiltering = normalizedChangedFiles.some((filePath) => behaviorFilterBypassPaths.has(filePath));
  if (bypassFiltering) {
    return checks;
  }

  return checks.filter((check) => {
    if (check.assertion_kind !== "behavior") {
      return true;
    }

    return (check.source_paths || []).some((sourcePath) =>
      normalizedChangedFiles.some((filePath) => pathCoversRelativeTarget(repoRoot, sourcePath, filePath))
    );
  });
}

function summarizeAssertionKinds(checks) {
  const counts = new Map();

  for (const check of checks) {
    counts.set(check.assertion_kind, (counts.get(check.assertion_kind) || 0) + 1);
  }

  return counts;
}

function formatSummary(counts) {
  const order = ["shape", "behavior", "consistency", "meta"];
  const items = order.filter((key) => counts.get(key)).map((key) => `${key}=${counts.get(key)}`);
  return items.length > 0 ? ` (${items.join(", ")})` : "";
}

function executeLayer({ repoRoot = defaultRepoRoot, layer, changedFiles = [] }) {
  const loadResult = loadRunnableChecksForLayer({ repoRoot, layer });
  if (!loadResult.ok) {
    return { ok: false, errors: loadResult.errors, summary: new Map() };
  }

  const errors = [];
  const selectedChecks = filterChecksForChangedFiles({
    repoRoot,
    layer,
    checks: loadResult.checks,
    changedFiles
  });
  const summary = summarizeAssertionKinds(selectedChecks);

  for (const check of selectedChecks) {
    const definition = executorDefinitions[check.executor];

    try {
      const result = definition.runActive({ repoRoot, check });
      if (result.ok) {
        continue;
      }

      const resultErrors =
        Array.isArray(result.errors) && result.errors.length > 0
          ? result.errors
          : [`executor "${check.executor}" failed without error details`];

      for (const error of resultErrors) {
        errors.push(`${check.id}: ${error}`);
      }
    } catch (error) {
      errors.push(`${check.id}: executor "${check.executor}" threw ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { ok: errors.length === 0, errors, summary };
}

function runLayers(mode, repoRoot, options = {}) {
  const layers = [];
  const changedFiles = Array.isArray(options.changedFiles) ? options.changedFiles : [];

  if (mode === "contract" || mode === "full") {
    layers.push(["contract", executeLayer({ repoRoot, layer: "contract", changedFiles })]);
  }

  if (mode === "consistency" || mode === "full") {
    layers.push(["consistency", executeLayer({ repoRoot, layer: "consistency", changedFiles })]);
  }

  if (mode === "meta" || mode === "full") {
    layers.push(["meta", executeLayer({ repoRoot, layer: "meta", changedFiles })]);
  }

  return layers;
}

export {
  formatSummary,
  runLayers,
  validateMeta,
  validateRegistry,
  validateRegistryExecutionShape
};
