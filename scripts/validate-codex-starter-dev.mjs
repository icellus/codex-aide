import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateAuthority } from "./validate-codex-starter-authority.mjs";
import { validateGovernanceTarget } from "../codex-starter/.codex/scripts/guards/validate-governance-target.mjs";

const defaultRepoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultCheckManifest = Object.freeze([
  { id: "authority-contract", layer: "contract" },
  { id: "json-contract-files", layer: "contract" },
  { id: "governance-target-contract", layer: "contract" },
  { id: "governance-flow-contract", layer: "contract" },
  { id: "consistency-core-rules", layer: "consistency" },
  { id: "meta-test-registry", layer: "meta" }
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function listFilesRecursive(rootDir, predicate = () => true) {
  if (!fileExists(rootDir)) {
    return [];
  }

  const results = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(fullPath)) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

function relativeRepoPath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function displayPath(repoRoot, filePath) {
  const relativePath = relativeRepoPath(repoRoot, filePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
}

function getConsistencySpecPath(repoRoot) {
  return path.join(repoRoot, "standards", "codex-starter-consistency-map.json");
}

function getRegistryPath(repoRoot) {
  return path.join(repoRoot, "standards", "codex-starter-test-registry.json");
}

function loadJsonFile(repoRoot, filePath, errors) {
  if (!fileExists(filePath)) {
    errors.push(`${displayPath(repoRoot, filePath)}: file not found`);
    return null;
  }

  try {
    return readJson(filePath);
  } catch (error) {
    errors.push(`${displayPath(repoRoot, filePath)}: invalid JSON (${error.message})`);
    return null;
  }
}

function collectJsonFiles(repoRoot) {
  const roots = [path.join(repoRoot, "standards"), path.join(repoRoot, "codex-starter", ".codex")];

  return roots.flatMap((rootDir) => listFilesRecursive(rootDir, (filePath) => filePath.endsWith(".json")));
}

function validateJsonContracts({ repoRoot = defaultRepoRoot } = {}) {
  const errors = [];

  for (const filePath of collectJsonFiles(repoRoot)) {
    try {
      JSON.parse(readText(filePath));
    } catch (error) {
      errors.push(`${relativeRepoPath(repoRoot, filePath)}: invalid JSON (${error.message})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateConsistency({
  repoRoot = defaultRepoRoot,
  specPath = getConsistencySpecPath(repoRoot)
} = {}) {
  const errors = [];
  const spec = loadJsonFile(repoRoot, specPath, errors);
  const seenRuleIds = new Set();

  if (spec === null) {
    return { ok: false, errors };
  }

  if (!Array.isArray(spec.rules) || spec.rules.length === 0) {
    return {
      ok: false,
      errors: ["standards/codex-starter-consistency-map.json: rules must be a non-empty array"]
    };
  }

  for (const rule of spec.rules) {
    if (!rule.id) {
      errors.push("standards/codex-starter-consistency-map.json: every rule must declare id");
      continue;
    }

    if (seenRuleIds.has(rule.id)) {
      errors.push(`standards/codex-starter-consistency-map.json: duplicate rule id "${rule.id}"`);
      continue;
    }
    seenRuleIds.add(rule.id);

    if (!Array.isArray(rule.targets) || rule.targets.length === 0) {
      errors.push(`${rule.id}: rule must declare at least one target`);
      continue;
    }

    for (const target of rule.targets) {
      if (!target.path) {
        errors.push(`${rule.id}: target is missing path`);
        continue;
      }

      const filePath = path.join(repoRoot, target.path);
      if (!fileExists(filePath)) {
        errors.push(`${rule.id}: ${target.path}: file not found`);
        continue;
      }

      const text = readText(filePath);

      for (const pattern of target.all_of || []) {
        if (!text.includes(pattern)) {
          errors.push(`${rule.id}: ${target.path}: missing required pattern "${pattern}"`);
        }
      }

      if (target.any_of?.length) {
        const found = target.any_of.some((pattern) => text.includes(pattern));
        if (!found) {
          errors.push(
            `${rule.id}: ${target.path}: missing one of required patterns ${target.any_of.join(", ")}`
          );
        }
      }

      for (const pattern of target.none_of || []) {
        if (text.includes(pattern)) {
          errors.push(`${rule.id}: ${target.path}: forbidden pattern "${pattern}"`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateGovernanceContracts({ repoRoot = defaultRepoRoot } = {}) {
  const errors = [];
  const projectDir = path.join(repoRoot, "codex-starter");
  const targets = [
    "AGENTS.md",
    ".codex/policies/routing-policy.md",
    ".codex/policies/aide-governance-policy.md",
    ".codex/context/project-profile.md"
  ];

  for (const targetPath of targets) {
    const result = validateGovernanceTarget({ projectDir, targetPath });
    if (!result.ok) {
      for (const error of result.errors || []) {
        errors.push(`${targetPath}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function writeStructuredTranscript(filePath, structuredResult) {
  const entry = {
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: `Governance check\n\n## Structured Result\n\`\`\`json\n${JSON.stringify(structuredResult, null, 2)}\n\`\`\`\n`
        }
      ]
    }
  };

  fs.writeFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

function runNodeJsonScript(scriptPath, projectDir, input) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectDir,
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: projectDir
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8"
  });

  let parsed = null;
  const stdout = String(result.stdout || "").trim();
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }
  }

  return {
    status: result.status ?? 1,
    stdout,
    stderr: String(result.stderr || "").trim(),
    parsed
  };
}

function applyGovernanceScenarioMutation(projectDir, mutation) {
  const relativePath = mutation?.path;
  if (!relativePath) {
    throw new Error("scenario mutation.path is required");
  }

  const filePath = path.join(projectDir, relativePath);
  if (!fileExists(filePath)) {
    throw new Error(`${relativePath}: file not found for scenario mutation`);
  }

  if (mutation.type === "append-text") {
    fs.appendFileSync(filePath, String(mutation.text || ""), "utf8");
    return;
  }

  throw new Error(`unsupported scenario mutation type "${mutation?.type || "<missing>"}"`);
}

function loadGovernanceFlowScenarios(scenarioRoot) {
  return listFilesRecursive(scenarioRoot, (filePath) => filePath.endsWith(".json")).map((filePath) => ({
    filePath,
    scenario: readJson(filePath)
  }));
}

function validateGovernanceFlowScenario({ repoRoot = defaultRepoRoot, scenario }) {
  const errors = [];
  const sourceProjectDir = path.join(repoRoot, "codex-starter");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-starter-governance-"));
  const projectDir = path.join(tempRoot, "codex-starter");

  fs.cpSync(sourceProjectDir, projectDir, { recursive: true });

  try {
    for (const mutation of scenario.pre_mutations || []) {
      applyGovernanceScenarioMutation(projectDir, mutation);
    }

    const expect = scenario.expect || {};
    const targetPath = expect.target_path || scenario.candidate?.authority_target;
    const targetFilePath = targetPath ? path.join(projectDir, targetPath) : null;
    const beforeTargetText = targetFilePath && fileExists(targetFilePath) ? readText(targetFilePath) : null;
    let invocation = null;

    if (scenario.mode === "ingest") {
      const transcriptPath = path.join(tempRoot, `${scenario.id || "scenario"}.jsonl`);
      writeStructuredTranscript(transcriptPath, scenario.structured_result || {});
      invocation = runNodeJsonScript(path.join(projectDir, ".codex", "hooks", "ingest-governance.mjs"), projectDir, {
        projectDir,
        transcript_path: transcriptPath,
        session_id: scenario.session_id || scenario.id || "scenario-session"
      });
    } else if (scenario.mode === "writeback") {
      invocation = runNodeJsonScript(path.join(projectDir, ".codex", "scripts", "governance", "writeback.mjs"), projectDir, {
        projectDir,
        actor_role: scenario.actor_role || "Aide",
        candidate: scenario.candidate || {}
      });
    } else {
      errors.push(`${scenario.id || "<unknown>"}: unsupported scenario mode "${scenario.mode || "<missing>"}"`);
      return { ok: false, errors };
    }

    if (typeof expect.exit_status === "number" && invocation.status !== expect.exit_status) {
      errors.push(`${scenario.id}: expected exit_status=${expect.exit_status}, got ${invocation.status}`);
    }

    if (expect.decision && invocation.parsed?.decision !== expect.decision) {
      errors.push(`${scenario.id}: expected decision=${expect.decision}, got ${invocation.parsed?.decision || "<missing>"}`);
    }

    const afterTargetText = targetFilePath && fileExists(targetFilePath) ? readText(targetFilePath) : null;
    const targetChanged = beforeTargetText !== afterTargetText;
    if (typeof expect.target_changed === "boolean" && targetChanged !== expect.target_changed) {
      errors.push(`${scenario.id}: expected target_changed=${expect.target_changed}, got ${targetChanged}`);
    }

    if (typeof expect.target_contains === "string" && !(afterTargetText || "").includes(expect.target_contains)) {
      errors.push(`${scenario.id}: expected target to contain "${expect.target_contains}"`);
    }

    if (typeof expect.target_not_contains === "string" && (afterTargetText || "").includes(expect.target_not_contains)) {
      errors.push(`${scenario.id}: expected target to remove "${expect.target_not_contains}"`);
    }

    const stateFilePath = path.join(projectDir, ".codex", "state", "governance-context.json");
    const governanceStateExists = fileExists(stateFilePath);
    if (typeof expect.governance_state_exists === "boolean" && governanceStateExists !== expect.governance_state_exists) {
      errors.push(`${scenario.id}: expected governance_state_exists=${expect.governance_state_exists}, got ${governanceStateExists}`);
    }

    if (Array.isArray(expect.governance_statuses)) {
      const state = governanceStateExists ? readJson(stateFilePath) : { items: [] };
      const statuses = Array.isArray(state.items) ? state.items.map((item) => item.status).sort() : [];
      const expectedStatuses = [...expect.governance_statuses].sort();
      if (JSON.stringify(statuses) !== JSON.stringify(expectedStatuses)) {
        errors.push(`${scenario.id}: expected governance_statuses=${expectedStatuses.join(",")}, got ${statuses.join(",")}`);
      }
    }

    if (typeof expect.target_valid_after === "boolean" && targetPath) {
      const validation = validateGovernanceTarget({
        projectDir,
        targetPath
      });
      if (validation.ok !== expect.target_valid_after) {
        errors.push(`${scenario.id}: expected target_valid_after=${expect.target_valid_after}, got ${validation.ok}`);
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors };
}

function validateGovernanceFlowContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-starter-dev", "governance-flow-pass")
} = {}) {
  const errors = [];

  for (const { filePath, scenario } of loadGovernanceFlowScenarios(scenarioRoot)) {
    const result = validateGovernanceFlowScenario({ repoRoot, scenario });
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push(`${displayPath(repoRoot, filePath)}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateRegistry({
  repoRoot = defaultRepoRoot,
  registryFilePath = getRegistryPath(repoRoot)
} = {}) {
  const errors = [];
  const registry = loadJsonFile(repoRoot, registryFilePath, errors);
  const validTypes = new Set(["contract", "consistency", "meta"]);
  const validStatuses = new Set(["active", "temporary", "deprecated"]);
  const validExecutors = new Set(["authority", "json-parse", "consistency", "meta", "governance", "governance-flow"]);
  const seenIds = new Set();
  const seenCoverageKeys = new Set();

  if (registry === null) {
    return { ok: false, errors, registry: null };
  }

  if (!registry.budgets || typeof registry.budgets !== "object") {
    errors.push("standards/codex-starter-test-registry.json: budgets must be an object");
  }

  if (!Array.isArray(registry.checks) || registry.checks.length === 0) {
    errors.push("standards/codex-starter-test-registry.json: checks must be a non-empty array");
    return { ok: false, errors, registry };
  }

  const expectedCheckIds = new Set(defaultCheckManifest.map((check) => check.id));
  const activeCheckIds = new Set();

  let activeChecks = 0;

  for (const check of registry.checks) {
    for (const field of ["id", "type", "rule_id", "failure_mode", "owner", "status", "executor"]) {
      if (!check[field]) {
        errors.push(`standards/codex-starter-test-registry.json: check is missing ${field}`);
      }
    }

    if (!Array.isArray(check.source_paths) || check.source_paths.length === 0) {
      errors.push(`${check.id || "<unknown>"}: source_paths must be a non-empty array`);
    }

    if (check.id) {
      if (seenIds.has(check.id)) {
        errors.push(`standards/codex-starter-test-registry.json: duplicate check id "${check.id}"`);
      }
      seenIds.add(check.id);
    }

    if (check.type && !validTypes.has(check.type)) {
      errors.push(`${check.id}: unsupported type "${check.type}"`);
    }

    if (check.status && !validStatuses.has(check.status)) {
      errors.push(`${check.id}: unsupported status "${check.status}"`);
    }

    if (check.executor && !validExecutors.has(check.executor)) {
      errors.push(`${check.id}: unsupported executor "${check.executor}"`);
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

    if (
      check.executor === "authority" ||
      check.executor === "consistency" ||
      check.executor === "governance" ||
      check.executor === "governance-flow"
    ) {
      if (!check.proof_fixture_root) {
        errors.push(`${check.id}: ${check.executor} checks must declare proof_fixture_root`);
      }

      if (!Array.isArray(check.expected_error_patterns) || check.expected_error_patterns.length === 0) {
        errors.push(`${check.id}: ${check.executor} checks must declare expected_error_patterns`);
      }
    }

    if (check.executor === "governance" && !check.proof_target_path) {
      errors.push(`${check.id}: governance checks must declare proof_target_path`);
    }

    if (check.proof_fixture_root && !fileExists(path.join(repoRoot, check.proof_fixture_root))) {
      errors.push(`${check.id}: proof fixture root not found "${check.proof_fixture_root}"`);
    }

    if (check.status === "active" || check.status === "temporary") {
      activeChecks += 1;
      activeCheckIds.add(check.id);

      if (check.type && check.rule_id && check.failure_mode) {
        const coverageKey = `${check.type}:${check.rule_id}:${check.failure_mode}`;
        if (seenCoverageKeys.has(coverageKey)) {
          errors.push(`${check.id}: duplicates active coverage "${coverageKey}"`);
        }
        seenCoverageKeys.add(coverageKey);
      }
    }
  }

  for (const expectedId of expectedCheckIds) {
    if (!activeCheckIds.has(expectedId)) {
      errors.push(`standards/codex-starter-test-registry.json: missing active check "${expectedId}"`);
    }
  }

  for (const activeId of activeCheckIds) {
    if (!expectedCheckIds.has(activeId)) {
      errors.push(`standards/codex-starter-test-registry.json: active check "${activeId}" is not wired into the default suite`);
    }
  }

  const maxActiveChecks = registry.budgets?.max_active_checks;
  if (typeof maxActiveChecks !== "number" || maxActiveChecks < 1) {
    errors.push("standards/codex-starter-test-registry.json: budgets.max_active_checks must be >= 1");
  } else if (activeChecks > maxActiveChecks) {
    errors.push(`active checks ${activeChecks} exceed budget ${maxActiveChecks}`);
  }

  const fixtureFiles = listFilesRecursive(path.join(repoRoot, "fixtures", "codex-starter-dev"));
  const fixtureBytes = fixtureFiles.reduce((total, filePath) => total + fs.statSync(filePath).size, 0);

  const maxFixtureFiles = registry.budgets?.max_fixture_files;
  const maxFixtureBytes = registry.budgets?.max_fixture_bytes;

  if (typeof maxFixtureFiles !== "number" || maxFixtureFiles < 1) {
    errors.push("standards/codex-starter-test-registry.json: budgets.max_fixture_files must be >= 1");
  } else if (fixtureFiles.length > maxFixtureFiles) {
    errors.push(`fixture files ${fixtureFiles.length} exceed budget ${maxFixtureFiles}`);
  }

  if (typeof maxFixtureBytes !== "number" || maxFixtureBytes < 1) {
    errors.push("standards/codex-starter-test-registry.json: budgets.max_fixture_bytes must be >= 1");
  } else if (fixtureBytes > maxFixtureBytes) {
    errors.push(`fixture bytes ${fixtureBytes} exceed budget ${maxFixtureBytes}`);
  }

  return { ok: errors.length === 0, errors, registry };
}

function runFailingProofs({ repoRoot = defaultRepoRoot, registry }) {
  const errors = [];

  for (const check of registry.checks || []) {
    if (check.status === "deprecated" || !check.proof_fixture_root) {
      continue;
    }

    const proofRoot = path.join(repoRoot, check.proof_fixture_root);
    let result;

    if (check.executor === "authority") {
      result = validateAuthority({ repoRoot: proofRoot });
    } else if (check.executor === "consistency") {
      result = validateConsistency({ repoRoot: proofRoot });
    } else if (check.executor === "governance") {
      const proofProjectPath = path.join(proofRoot, check.proof_project_path || "codex-starter");
      result = validateGovernanceTarget({
        projectDir: proofProjectPath,
        targetPath: check.proof_target_path
      });
    } else if (check.executor === "governance-flow") {
      result = validateGovernanceFlowContracts({
        repoRoot,
        scenarioRoot: proofRoot
      });
    } else {
      continue;
    }

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

function runContractLayer({ repoRoot = defaultRepoRoot } = {}) {
  const jsonResult = validateJsonContracts({ repoRoot });
  const authorityResult = validateAuthority({ repoRoot });
  const governanceResult = validateGovernanceContracts({ repoRoot });
  const governanceFlowResult = validateGovernanceFlowContracts({ repoRoot });
  const errors = [...jsonResult.errors, ...authorityResult.errors, ...governanceResult.errors, ...governanceFlowResult.errors];

  return { ok: errors.length === 0, errors };
}

function runLayers(mode, repoRoot) {
  const layers = [];

  if (mode === "contract" || mode === "full") {
    layers.push(["contract", runContractLayer({ repoRoot })]);
  }

  if (mode === "consistency" || mode === "full") {
    layers.push(["consistency", validateConsistency({ repoRoot })]);
  }

  if (mode === "meta" || mode === "full") {
    layers.push(["meta", validateMeta({ repoRoot })]);
  }

  return layers;
}

function parseArgs(argv) {
  const validModes = new Set(["contract", "consistency", "meta", "full"]);
  let mode = "full";
  let repoRoot = defaultRepoRoot;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo-root") {
      repoRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (validModes.has(arg)) {
      mode = arg;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return { mode, repoRoot };
}

function runCli(argv = process.argv.slice(2)) {
  let options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(
      "Usage: node scripts/validate-codex-starter-dev.mjs [contract|consistency|meta|full] [--repo-root <path>]\n"
    );
    return 2;
  }

  const layerResults = runLayers(options.mode, options.repoRoot);
  let hasErrors = false;

  for (const [layerName, result] of layerResults) {
    if (result.ok) {
      process.stdout.write(`[${layerName}] PASS\n`);
      continue;
    }

    hasErrors = true;
    process.stderr.write(`[${layerName}] FAIL\n`);
    for (const error of result.errors) {
      process.stderr.write(`- ${error}\n`);
    }
  }

  if (hasErrors) {
    return 1;
  }

  process.stdout.write("codex-starter development validation passed\n");
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(runCli());
}

export { validateConsistency, validateGovernanceFlowContracts, validateJsonContracts, validateMeta };
