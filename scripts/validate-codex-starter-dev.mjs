import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateAuthority } from "./validate-codex-starter-authority.mjs";
import { validateGovernanceTarget } from "../codex-starter/.codex/scripts/guards/validate-governance-target.mjs";

const defaultRepoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runnableStatuses = new Set(["active", "temporary"]);
const validConsistencyKinds = new Set([
  "ownership",
  "handoff",
  "path-convention",
  "authority-boundary",
  "special-flow",
  "integration-wiring"
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

function validatePatternArray(ruleId, targetPath, fieldName, value, errors) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${ruleId}: ${targetPath}: ${fieldName} must be a non-empty array when provided`);
    return [];
  }

  const patterns = [];
  for (const pattern of value) {
    if (typeof pattern !== "string" || pattern.length === 0) {
      errors.push(`${ruleId}: ${targetPath}: ${fieldName} entries must be non-empty strings`);
      continue;
    }
    patterns.push(pattern);
  }

  return patterns;
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

    if (!rule.intent || typeof rule.intent !== "string") {
      errors.push(`${rule.id}: rule must declare intent`);
    }

    if (!rule.kind || typeof rule.kind !== "string") {
      errors.push(`${rule.id}: rule must declare kind`);
    } else if (!validConsistencyKinds.has(rule.kind)) {
      errors.push(`${rule.id}: unsupported kind "${rule.kind}"`);
    }

    if (!Array.isArray(rule.targets) || rule.targets.length === 0) {
      errors.push(`${rule.id}: rule must declare at least one target`);
      continue;
    }

    for (const target of rule.targets) {
      if (!target.path) {
        errors.push(`${rule.id}: target is missing path`);
        continue;
      }

      const targetPath = target.path;
      const filePath = path.join(repoRoot, targetPath);
      if (!fileExists(filePath)) {
        errors.push(`${rule.id}: ${targetPath}: file not found`);
        continue;
      }

      const allOf = validatePatternArray(rule.id, targetPath, "all_of", target.all_of, errors);
      const anyOf = validatePatternArray(rule.id, targetPath, "any_of", target.any_of, errors);
      const noneOf = validatePatternArray(rule.id, targetPath, "none_of", target.none_of, errors);

      if (allOf.length === 0 && anyOf.length === 0 && noneOf.length === 0) {
        errors.push(`${rule.id}: ${targetPath}: target must declare at least one of all_of, any_of, none_of`);
        continue;
      }

      const text = readText(filePath);

      for (const pattern of allOf) {
        if (!text.includes(pattern)) {
          errors.push(`${rule.id}: ${targetPath}: missing required pattern "${pattern}"`);
        }
      }

      if (anyOf.length > 0 && !anyOf.some((pattern) => text.includes(pattern))) {
        errors.push(`${rule.id}: ${targetPath}: missing one of required patterns ${anyOf.join(", ")}`);
      }

      for (const pattern of noneOf) {
        if (text.includes(pattern)) {
          errors.push(`${rule.id}: ${targetPath}: forbidden pattern "${pattern}"`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateGovernanceTargetContracts({ repoRoot = defaultRepoRoot } = {}) {
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

function runNodeJsonScript(scriptPath, projectDir, input, options = {}) {
  const extraEnv = options.extraEnv && typeof options.extraEnv === "object" ? options.extraEnv : {};
  const useProjectDirEnv = options.useProjectDirEnv !== false;
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: options.cwd || projectDir,
    env: {
      ...process.env,
      ...extraEnv,
      ...(useProjectDirEnv ? { CODEX_PROJECT_DIR: projectDir } : {})
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

function loadTaskStateScenarios(scenarioRoot) {
  return listFilesRecursive(scenarioRoot, (filePath) => filePath.endsWith(".json")).map((filePath) => ({
    filePath,
    scenario: readJson(filePath)
  }));
}

function loadScenarioFiles(scenarioRoot) {
  return listFilesRecursive(scenarioRoot, (filePath) => filePath.endsWith(".json")).map((filePath) => ({
    filePath,
    scenario: readJson(filePath)
  }));
}

function isPresentValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function compareExpectedObject({ actual, expected, baseLabel, errors }) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return;
  }

  for (const [key, value] of Object.entries(expected)) {
    const actualValue = actual ? actual[key] : undefined;
    if (actualValue !== value) {
      errors.push(`${baseLabel}.${key}=${value}, got ${actualValue === undefined ? "<missing>" : actualValue}`);
    }
  }
}

function compareExpectedRelativePathFields({ baseDir, actual, expected, baseLabel, errors }) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return;
  }

  for (const [key, value] of Object.entries(expected)) {
    const actualValue = actual ? actual[key] : undefined;
    const actualRelative = typeof actualValue === "string" && actualValue ? relativeOrDot(baseDir, actualValue) : "<missing>";
    if (actualRelative !== value) {
      errors.push(`${baseLabel}.${key}=${value}, got ${actualRelative}`);
    }
  }
}

function compareExpectedArray({ actual, expected, label, errors }) {
  if (!Array.isArray(expected)) {
    return;
  }

  const actualArray = Array.isArray(actual) ? actual : [];
  if (JSON.stringify(actualArray) !== JSON.stringify(expected)) {
    errors.push(`${label}=${JSON.stringify(expected)}, got ${JSON.stringify(actualArray)}`);
  }
}

function compareExpectedArrayFields({ actual, expected, baseLabel, errors }) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return;
  }

  for (const [key, value] of Object.entries(expected)) {
    const actualValue = actual ? actual[key] : undefined;
    compareExpectedArray({
      actual: actualValue,
      expected: value,
      label: `${baseLabel}.${key}`,
      errors
    });
  }
}

function assertPresentFields({ actual, fields, label, errors }) {
  if (!Array.isArray(fields)) {
    return;
  }

  for (const field of fields) {
    const actualValue = actual ? actual[field] : undefined;
    if (!isPresentValue(actualValue)) {
      errors.push(`${label}.${field} to be present`);
    }
  }
}

function readTaskContextState(projectDir) {
  const stateFilePath = path.join(projectDir, ".codex", "state", "task-context.json");
  if (!fileExists(stateFilePath)) {
    return null;
  }

  return readJson(stateFilePath);
}

function readRepoContextState(projectDir) {
  const stateFilePath = path.join(projectDir, ".codex", "state", "repo-context.json");
  if (!fileExists(stateFilePath)) {
    return null;
  }

  return readJson(stateFilePath);
}

function runNodeRawScript(scriptPath, projectDir, rawInput, options = {}) {
  const extraEnv = options.extraEnv && typeof options.extraEnv === "object" ? options.extraEnv : {};
  const useProjectDirEnv = options.useProjectDirEnv !== false;
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: options.cwd || projectDir,
    env: {
      ...process.env,
      ...extraEnv,
      ...(useProjectDirEnv ? { CODEX_PROJECT_DIR: projectDir } : {})
    },
    input: String(rawInput || ""),
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

function validateTaskStateScenario({ repoRoot = defaultRepoRoot, scenario }) {
  const errors = [];
  const sourceProjectDir = path.join(repoRoot, "codex-starter");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-starter-task-state-"));
  const projectDir = path.join(tempRoot, "codex-starter");

  fs.cpSync(sourceProjectDir, projectDir, { recursive: true });

  try {
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return {
        ok: false,
        errors: [`${scenario.id || "<unknown>"}: steps must be a non-empty array`]
      };
    }

    const scriptPath = path.join(projectDir, ".codex", "scripts", "context", "task-state.mjs");

    scenario.steps.forEach((step, index) => {
      const label = `${scenario.id || "<unknown>"} step ${index + 1}`;
      const cwdRelative = typeof step.cwd_relative === "string" ? step.cwd_relative.trim() : "";
      const stepCwd = cwdRelative ? path.join(projectDir, cwdRelative) : projectDir;
      fs.mkdirSync(stepCwd, { recursive: true });

      const invocation =
        typeof step.raw_input === "string"
          ? runNodeRawScript(scriptPath, projectDir, step.raw_input, {
              cwd: stepCwd,
              useProjectDirEnv: step.use_project_dir_env !== false,
              extraEnv: step.env && typeof step.env === "object" ? step.env : {}
            })
          : runNodeJsonScript(scriptPath, projectDir, step.input || {}, {
              cwd: stepCwd,
              useProjectDirEnv: step.use_project_dir_env !== false,
              extraEnv: step.env && typeof step.env === "object" ? step.env : {}
            });
      const parsed = invocation.parsed;
      const expect = step.expect || {};

      if (typeof expect.exit_status === "number" && invocation.status !== expect.exit_status) {
        errors.push(`${label}: expected exit_status=${expect.exit_status}, got ${invocation.status}`);
      }

      if (typeof expect.ok === "boolean" && Boolean(parsed?.ok) !== expect.ok) {
        errors.push(`${label}: expected ok=${expect.ok}, got ${Boolean(parsed?.ok)}`);
      }

      if (typeof expect.action === "string" && String(parsed?.action || "") !== expect.action) {
        errors.push(`${label}: expected action=${expect.action}, got ${parsed?.action || "<missing>"}`);
      }

      if (typeof expect.changed === "boolean" && Boolean(parsed?.changed) !== expect.changed) {
        errors.push(`${label}: expected changed=${expect.changed}, got ${Boolean(parsed?.changed)}`);
      }

      compareExpectedObject({
        actual: parsed?.task,
        expected: expect.task_fields,
        baseLabel: `${label}: expected task`,
        errors
      });
      compareExpectedArrayFields({
        actual: parsed?.task,
        expected: expect.task_array_fields,
        baseLabel: `${label}: expected task`,
        errors
      });
      assertPresentFields({
        actual: parsed?.task,
        fields: expect.task_present_fields,
        label: `${label}: expected task`,
        errors
      });

      if (typeof expect.recent_tasks_count === "number") {
        const actualCount = Array.isArray(parsed?.recent_tasks) ? parsed.recent_tasks.length : 0;
        if (actualCount !== expect.recent_tasks_count) {
          errors.push(`${label}: expected recent_tasks_count=${expect.recent_tasks_count}, got ${actualCount}`);
        }
      }

      compareExpectedArray({
        actual: Array.isArray(parsed?.recent_tasks) ? parsed.recent_tasks.map((item) => item.status) : [],
        expected: expect.recent_task_statuses,
        label: `${label}: expected recent_task_statuses`,
        errors
      });

      compareExpectedArray({
        actual: Array.isArray(parsed?.recent_tasks) ? parsed.recent_tasks.map((item) => item.task_id) : [],
        expected: expect.recent_task_ids,
        label: `${label}: expected recent_task_ids`,
        errors
      });

      const state = readTaskContextState(projectDir);
      compareExpectedObject({
        actual: state?.task,
        expected: expect.state_task_fields,
        baseLabel: `${label}: expected state.task`,
        errors
      });
      compareExpectedArrayFields({
        actual: state?.task,
        expected: expect.state_task_array_fields,
        baseLabel: `${label}: expected state.task`,
        errors
      });
      compareExpectedRelativePathFields({
        baseDir: projectDir,
        actual: state?.task,
        expected: expect.state_task_relative_path_fields,
        baseLabel: `${label}: expected state.task`,
        errors
      });
      assertPresentFields({
        actual: state?.task,
        fields: expect.state_task_present_fields,
        label: `${label}: expected state.task`,
        errors
      });

      if (typeof expect.state_recent_tasks_count === "number") {
        const actualCount = Array.isArray(state?.recent_tasks) ? state.recent_tasks.length : 0;
        if (actualCount !== expect.state_recent_tasks_count) {
          errors.push(`${label}: expected state_recent_tasks_count=${expect.state_recent_tasks_count}, got ${actualCount}`);
        }
      }

      compareExpectedArray({
        actual: Array.isArray(state?.recent_tasks) ? state.recent_tasks.map((item) => item.status) : [],
        expected: expect.state_recent_task_statuses,
        label: `${label}: expected state_recent_task_statuses`,
        errors
      });

      compareExpectedArray({
        actual: Array.isArray(state?.recent_tasks) ? state.recent_tasks.map((item) => item.task_id) : [],
        expected: expect.state_recent_task_ids,
        label: `${label}: expected state_recent_task_ids`,
        errors
      });

      for (const relativePath of expect.project_paths_exist || []) {
        if (!fileExists(path.join(projectDir, relativePath))) {
          errors.push(`${label}: expected project path to exist "${relativePath}"`);
        }
      }

      for (const relativePath of expect.project_paths_absent || []) {
        if (fileExists(path.join(projectDir, relativePath))) {
          errors.push(`${label}: expected project path to be absent "${relativePath}"`);
        }
      }
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors };
}

function validateTaskStateBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-starter-dev", "task-state-pass")
} = {}) {
  const errors = [];

  for (const { filePath, scenario } of loadTaskStateScenarios(scenarioRoot)) {
    const result = validateTaskStateScenario({ repoRoot, scenario });
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push(`${displayPath(repoRoot, filePath)}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateRepoContextScenario({ repoRoot = defaultRepoRoot, scenario }) {
  const errors = [];
  const sourceProjectDir = path.join(repoRoot, "codex-starter");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-starter-repo-context-"));
  const projectDir = path.join(tempRoot, "codex-starter");

  fs.cpSync(sourceProjectDir, projectDir, { recursive: true });

  try {
    for (const command of scenario.setup_commands || []) {
      runShellSetup(String(command || ""), projectDir);
    }

    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return {
        ok: false,
        errors: [`${scenario.id || "<unknown>"}: steps must be a non-empty array`]
      };
    }

    const scriptPath = path.join(projectDir, ".codex", "scripts", "context", "repo-context.mjs");

    scenario.steps.forEach((step, index) => {
      const label = `${scenario.id || "<unknown>"} step ${index + 1}`;
      const cwdRelative = typeof step.cwd_relative === "string" ? step.cwd_relative.trim() : "";
      const stepCwd = cwdRelative ? path.join(projectDir, cwdRelative) : projectDir;
      fs.mkdirSync(stepCwd, { recursive: true });

      const invocation = runNodeJsonScript(scriptPath, projectDir, step.input || {}, {
        cwd: stepCwd,
        useProjectDirEnv: step.use_project_dir_env !== false,
        extraEnv: step.env && typeof step.env === "object" ? step.env : {}
      });
      const parsed = invocation.parsed;
      const expect = step.expect || {};

      if (typeof expect.exit_status === "number" && invocation.status !== expect.exit_status) {
        errors.push(`${label}: expected exit_status=${expect.exit_status}, got ${invocation.status}`);
      }

      if (typeof expect.ok === "boolean" && Boolean(parsed?.ok) !== expect.ok) {
        errors.push(`${label}: expected ok=${expect.ok}, got ${Boolean(parsed?.ok)}`);
      }

      if (typeof expect.action === "string" && String(parsed?.action || "") !== expect.action) {
        errors.push(`${label}: expected action=${expect.action}, got ${parsed?.action || "<missing>"}`);
      }

      compareExpectedObject({
        actual: parsed?.repo_context,
        expected: expect.repo_context_fields,
        baseLabel: `${label}: expected repo_context`,
        errors
      });
      compareExpectedRelativePathFields({
        baseDir: projectDir,
        actual: parsed?.repo_context,
        expected: expect.repo_context_relative_path_fields,
        baseLabel: `${label}: expected repo_context`,
        errors
      });

      const state = readRepoContextState(projectDir);
      compareExpectedObject({
        actual: state,
        expected: expect.state_fields,
        baseLabel: `${label}: expected state.repo_context`,
        errors
      });
      compareExpectedRelativePathFields({
        baseDir: projectDir,
        actual: state,
        expected: expect.state_relative_path_fields,
        baseLabel: `${label}: expected state.repo_context`,
        errors
      });
      compareExpectedArrayFields({
        actual: state,
        expected: expect.state_array_fields,
        baseLabel: `${label}: expected state.repo_context`,
        errors
      });
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors };
}

function validateRepoContextBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-starter-dev", "repo-context-pass")
} = {}) {
  const errors = [];

  for (const { filePath, scenario } of loadScenarioFiles(scenarioRoot)) {
    const result = validateRepoContextScenario({ repoRoot, scenario });
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push(`${displayPath(repoRoot, filePath)}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function runInlineModuleProbe({ cwd, env, modulePath, input }) {
  const probeSource = [
    "import { pathToFileURL } from 'node:url';",
    "const modulePath = process.env.CODEX_PROBE_MODULE_PATH;",
    "const input = JSON.parse(process.env.CODEX_PROBE_INPUT || '{}');",
    "const mod = await import(pathToFileURL(modulePath).href);",
    "const result = mod.getProjectContext(input);",
    "process.stdout.write(JSON.stringify(result));"
  ].join("\n");

  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probeSource], {
    cwd,
    env: {
      ...process.env,
      ...env,
      CODEX_PROBE_MODULE_PATH: modulePath,
      CODEX_PROBE_INPUT: JSON.stringify(input || {})
    },
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

function relativeOrDot(baseDir, targetPath) {
  const relativePath = path.relative(baseDir, targetPath).replace(/\\/g, "/");
  return relativePath || ".";
}

function buildScenarioInput(baseInput, { projectDir, stepCwd, useInputProjectDir, useInputCwd }) {
  const input = baseInput && typeof baseInput === "object" ? JSON.parse(JSON.stringify(baseInput)) : {};

  if (useInputProjectDir) {
    input.projectDir = projectDir;
  }

  if (useInputCwd) {
    input.cwd = stepCwd;
  }

  return input;
}

function buildScenarioEnv(baseEnv, { projectDir, useEnvProjectDir }) {
  const env = baseEnv && typeof baseEnv === "object" ? { ...baseEnv } : {};

  if (useEnvProjectDir) {
    env.CODEX_PROJECT_DIR = projectDir;
  }

  return env;
}

function validateProjectContextScenario({ repoRoot = defaultRepoRoot, scenario }) {
  const errors = [];
  const sourceProjectDir = path.join(repoRoot, "codex-starter");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-starter-project-context-"));
  const projectDir = path.join(tempRoot, "codex-starter");

  fs.cpSync(sourceProjectDir, projectDir, { recursive: true });

  try {
    for (const command of scenario.setup_commands || []) {
      runShellSetup(String(command || ""), projectDir);
    }

    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return {
        ok: false,
        errors: [`${scenario.id || "<unknown>"}: steps must be a non-empty array`]
      };
    }

    const modulePath = path.join(projectDir, ".codex", "scripts", "shared", "project-context.mjs");

    scenario.steps.forEach((step, index) => {
      const label = `${scenario.id || "<unknown>"} step ${index + 1}`;
      const cwdRelative = typeof step.cwd_relative === "string" ? step.cwd_relative.trim() : "";
      const stepCwd = cwdRelative ? path.join(projectDir, cwdRelative) : projectDir;
      fs.mkdirSync(stepCwd, { recursive: true });

      const invocation = runInlineModuleProbe({
        cwd: stepCwd,
        env: buildScenarioEnv(step.env, {
          projectDir,
          useEnvProjectDir: step.use_env_project_dir === true
        }),
        modulePath,
        input: buildScenarioInput(step.input, {
          projectDir,
          stepCwd,
          useInputProjectDir: step.use_input_project_dir === true,
          useInputCwd: step.use_input_cwd === true
        })
      });

      const parsed = invocation.parsed || {};
      const expect = step.expect || {};

      if (typeof expect.exit_status === "number" && invocation.status !== expect.exit_status) {
        errors.push(`${label}: expected exit_status=${expect.exit_status}, got ${invocation.status}`);
      }

      if (typeof expect.source === "string" && String(parsed.source || "") !== expect.source) {
        errors.push(`${label}: expected source=${expect.source}, got ${parsed.source || "<missing>"}`);
      }

      if (typeof expect.project_dir_relative === "string") {
        const actualRelative = parsed.projectDir ? relativeOrDot(projectDir, parsed.projectDir) : "<missing>";
        if (actualRelative !== expect.project_dir_relative) {
          errors.push(`${label}: expected project_dir_relative=${expect.project_dir_relative}, got ${actualRelative}`);
        }
      }

      if (typeof expect.start_path_relative === "string") {
        const actualRelative = parsed.startPath ? relativeOrDot(projectDir, parsed.startPath) : "<missing>";
        if (actualRelative !== expect.start_path_relative) {
          errors.push(`${label}: expected start_path_relative=${expect.start_path_relative}, got ${actualRelative}`);
        }
      }
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors };
}

function validateProjectContextBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-starter-dev", "project-context-pass")
} = {}) {
  const errors = [];

  for (const { filePath, scenario } of loadScenarioFiles(scenarioRoot)) {
    const result = validateProjectContextScenario({ repoRoot, scenario });
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push(`${displayPath(repoRoot, filePath)}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function initGitRepo(projectDir) {
  const result = spawnSync("git", ["init", "-q"], {
    cwd: projectDir,
    encoding: "utf8"
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(`git init failed: ${String(result.stderr || result.stdout || "").trim()}`);
  }
}

function readHooksConfig(projectDir) {
  return readJson(path.join(projectDir, ".codex", "hooks.json"));
}

function getHookCommand(hooksConfig, eventName, chainIndex = 0, hookIndex = 0) {
  const chains = hooksConfig?.hooks?.[eventName];
  if (!Array.isArray(chains) || !chains[chainIndex] || !Array.isArray(chains[chainIndex].hooks)) {
    throw new Error(`hook chain not found for ${eventName}[${chainIndex}]`);
  }

  const hook = chains[chainIndex].hooks[hookIndex];
  if (!hook || hook.type !== "command" || typeof hook.command !== "string") {
    throw new Error(`hook command not found for ${eventName}[${chainIndex}].hooks[${hookIndex}]`);
  }

  return hook.command;
}

function latestJsonlEntry(logDir) {
  if (!fileExists(logDir)) {
    return null;
  }

  const files = fs.readdirSync(logDir).filter((fileName) => fileName.endsWith(".jsonl")).sort();
  if (files.length === 0) {
    return null;
  }

  const lastFile = path.join(logDir, files[files.length - 1]);
  const lines = fs.readFileSync(lastFile, "utf8").split("\n").filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

function runHookCommand(command, { cwd, env, input }) {
  return spawnSync("bash", ["-lc", command], {
    cwd,
    env: {
      ...process.env,
      ...env
    },
    input: input ? `${JSON.stringify(input)}\n` : "",
    encoding: "utf8"
  });
}

function validateHookRootScenario({ repoRoot = defaultRepoRoot, scenario }) {
  const errors = [];
  const sourceProjectDir = path.join(repoRoot, "codex-starter");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-starter-hook-root-"));
  const projectDir = path.join(tempRoot, "codex-starter");

  fs.cpSync(sourceProjectDir, projectDir, { recursive: true });

  try {
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return {
        ok: false,
        errors: [`${scenario.id || "<unknown>"}: steps must be a non-empty array`]
      };
    }

    initGitRepo(projectDir);
    const hooksConfig = readHooksConfig(projectDir);
    fs.rmSync(path.join(projectDir, ".codex", "logs"), { recursive: true, force: true });

    scenario.steps.forEach((step, index) => {
      const label = `${scenario.id || "<unknown>"} step ${index + 1}`;
      const cwdRelative = typeof step.cwd_relative === "string" ? step.cwd_relative.trim() : "";
      const stepCwd = cwdRelative ? path.join(projectDir, cwdRelative) : projectDir;
      fs.mkdirSync(stepCwd, { recursive: true });

      const command = getHookCommand(
        hooksConfig,
        step.hook_event || "SessionStart",
        Number.isInteger(step.chain_index) ? step.chain_index : 0,
        Number.isInteger(step.hook_index) ? step.hook_index : 0
      );

      const result = runHookCommand(command, {
        cwd: stepCwd,
        env: buildScenarioEnv(step.env, {
          projectDir,
          useEnvProjectDir: step.use_env_project_dir === true
        }),
        input: buildScenarioInput(step.input, {
          projectDir,
          stepCwd,
          useInputProjectDir: step.use_input_project_dir === true,
          useInputCwd: step.use_input_cwd === true
        })
      });

      const expect = step.expect || {};

      if (typeof expect.exit_status === "number" && (result.status ?? 1) !== expect.exit_status) {
        errors.push(`${label}: expected exit_status=${expect.exit_status}, got ${result.status ?? 1}`);
      }

      const rootLogDir = path.join(projectDir, ".codex", "logs", "codex-hooks");
      const deepLogDir = path.join(stepCwd, ".codex", "logs", "codex-hooks");

      if (typeof expect.root_log_exists === "boolean" && fileExists(rootLogDir) !== expect.root_log_exists) {
        errors.push(`${label}: expected root_log_exists=${expect.root_log_exists}, got ${fileExists(rootLogDir)}`);
      }

      if (typeof expect.deep_log_exists === "boolean" && fileExists(deepLogDir) !== expect.deep_log_exists) {
        errors.push(`${label}: expected deep_log_exists=${expect.deep_log_exists}, got ${fileExists(deepLogDir)}`);
      }

      const rootEntry = latestJsonlEntry(rootLogDir);
      if (typeof expect.root_entry_source === "string" && String(rootEntry?.projectDirSource || "") !== expect.root_entry_source) {
        errors.push(
          `${label}: expected root_entry_source=${expect.root_entry_source}, got ${rootEntry?.projectDirSource || "<missing>"}`
        );
      }

      if (typeof expect.root_entry_project_dir_relative === "string") {
        const actualRelative = rootEntry?.projectDir ? relativeOrDot(projectDir, rootEntry.projectDir) : "<missing>";
        if (actualRelative !== expect.root_entry_project_dir_relative) {
          errors.push(
            `${label}: expected root_entry_project_dir_relative=${expect.root_entry_project_dir_relative}, got ${actualRelative}`
          );
        }
      }
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors };
}

function validateHookRootBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-starter-dev", "hook-root-pass")
} = {}) {
  const errors = [];

  for (const { filePath, scenario } of loadScenarioFiles(scenarioRoot)) {
    const result = validateHookRootScenario({ repoRoot, scenario });
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push(`${displayPath(repoRoot, filePath)}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeTextFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value || ""), "utf8");
}

function runShellSetup(command, cwd) {
  const result = spawnSync("bash", ["-lc", command], {
    cwd,
    encoding: "utf8"
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(String(result.stderr || result.stdout || "").trim() || `setup command failed: ${command}`);
  }
}

function validateGitScenario({ repoRoot = defaultRepoRoot, scenario }) {
  const errors = [];
  const sourceProjectDir = path.join(repoRoot, "codex-starter");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-starter-validate-git-"));
  const projectDir = path.join(tempRoot, "codex-starter");

  fs.cpSync(sourceProjectDir, projectDir, { recursive: true });

  try {
    initGitRepo(projectDir);

    for (const command of scenario.setup_commands || []) {
      runShellSetup(String(command || ""), projectDir);
    }

    const scriptPath = path.join(projectDir, ".codex", "scripts", "guards", "validate-git.mjs");
    const invocation = runNodeJsonScript(scriptPath, projectDir, scenario.input || {});
    const parsed = invocation.parsed;
    const expect = scenario.expect || {};
    const actualDecision = parsed?.permissionDecision === "deny" ? "deny" : "allow";
    const actualReason = String(parsed?.permissionDecisionReason || "");

    if (typeof expect.exit_status === "number" && invocation.status !== expect.exit_status) {
      errors.push(`${scenario.id || "<unknown>"}: expected exit_status=${expect.exit_status}, got ${invocation.status}`);
    }

    if (typeof expect.decision === "string" && actualDecision !== expect.decision) {
      errors.push(`${scenario.id || "<unknown>"}: expected decision=${expect.decision}, got ${actualDecision}`);
    }

    if (typeof expect.reason_contains === "string" && !actualReason.includes(expect.reason_contains)) {
      errors.push(`${scenario.id || "<unknown>"}: expected reason to contain "${expect.reason_contains}"`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors };
}

function validateValidateGitBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-starter-dev", "validate-git-pass")
} = {}) {
  const errors = [];

  for (const { filePath, scenario } of loadScenarioFiles(scenarioRoot)) {
    const result = validateGitScenario({ repoRoot, scenario });
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push(`${displayPath(repoRoot, filePath)}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateTaskProgressSyncScenario({ repoRoot = defaultRepoRoot, scenario }) {
  const errors = [];
  const sourceProjectDir = path.join(repoRoot, "codex-starter");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-starter-task-progress-sync-"));
  const projectDir = path.join(tempRoot, "codex-starter");

  fs.cpSync(sourceProjectDir, projectDir, { recursive: true });

  try {
    for (const command of scenario.setup_commands || []) {
      runShellSetup(String(command || ""), projectDir);
    }

    if (scenario.task_context && typeof scenario.task_context === "object") {
      writeJsonFile(path.join(projectDir, ".codex", "state", "task-context.json"), scenario.task_context);
    }

    if (typeof scenario.progress_path === "string" && scenario.progress_path.trim()) {
      writeTextFile(path.join(projectDir, scenario.progress_path), scenario.progress_text || "");
    }

    const scriptPath = path.join(projectDir, ".codex", "scripts", "context", "task-progress-sync.mjs");
    const cwdRelative = typeof scenario.cwd_relative === "string" ? scenario.cwd_relative.trim() : "";
    const stepCwd = cwdRelative ? path.join(projectDir, cwdRelative) : projectDir;
    fs.mkdirSync(stepCwd, { recursive: true });

    const invocation = runNodeRawScript(scriptPath, projectDir, JSON.stringify(scenario.input || {}), {
      cwd: stepCwd,
      useProjectDirEnv: scenario.use_project_dir_env !== false,
      extraEnv: scenario.env && typeof scenario.env === "object" ? scenario.env : {}
    });
    const expect = scenario.expect || {};

    if (typeof expect.exit_status === "number" && invocation.status !== expect.exit_status) {
      errors.push(`${scenario.id || "<unknown>"}: expected exit_status=${expect.exit_status}, got ${invocation.status}`);
    }

    if (typeof expect.stdout === "string" && invocation.stdout !== expect.stdout) {
      errors.push(`${scenario.id || "<unknown>"}: expected stdout=${JSON.stringify(expect.stdout)}, got ${JSON.stringify(invocation.stdout)}`);
    }

    if (typeof expect.stdout_contains === "string" && !invocation.stdout.includes(expect.stdout_contains)) {
      errors.push(`${scenario.id || "<unknown>"}: expected stdout to contain ${JSON.stringify(expect.stdout_contains)}`);
    }

    if (typeof expect.stderr_contains === "string" && !invocation.stderr.includes(expect.stderr_contains)) {
      errors.push(`${scenario.id || "<unknown>"}: expected stderr to contain ${JSON.stringify(expect.stderr_contains)}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors };
}

function validateTaskProgressSyncBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-starter-dev", "task-progress-sync-pass")
} = {}) {
  const errors = [];

  for (const { filePath, scenario } of loadScenarioFiles(scenarioRoot)) {
    const result = validateTaskProgressSyncScenario({ repoRoot, scenario });
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push(`${displayPath(repoRoot, filePath)}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

const executorDefinitions = Object.freeze({
  "authority-shape": Object.freeze({
    layer: "contract",
    assertionKind: "shape",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateAuthority({ repoRoot }),
    runProof: ({ repoRoot, check }) => validateAuthority({ repoRoot: path.join(repoRoot, check.proof_fixture_root) })
  }),
  "json-shape": Object.freeze({
    layer: "contract",
    assertionKind: "shape",
    requiresProof: false,
    runActive: ({ repoRoot }) => validateJsonContracts({ repoRoot })
  }),
  "governance-target-shape": Object.freeze({
    layer: "contract",
    assertionKind: "shape",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateGovernanceTargetContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) => {
      const proofProjectPath = path.join(repoRoot, check.proof_fixture_root, check.proof_project_path || "codex-starter");
      return validateGovernanceTarget({
        projectDir: proofProjectPath,
        targetPath: check.proof_target_path
      });
    }
  }),
  "governance-flow": Object.freeze({
    layer: "contract",
    assertionKind: "behavior",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateGovernanceFlowContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) =>
      validateGovernanceFlowContracts({
        repoRoot,
        scenarioRoot: path.join(repoRoot, check.proof_fixture_root)
      })
  }),
  "task-state-behavior": Object.freeze({
    layer: "contract",
    assertionKind: "behavior",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateTaskStateBehaviorContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) =>
      validateTaskStateBehaviorContracts({
        repoRoot,
        scenarioRoot: path.join(repoRoot, check.proof_fixture_root)
      })
  }),
  "task-progress-sync-behavior": Object.freeze({
    layer: "contract",
    assertionKind: "behavior",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateTaskProgressSyncBehaviorContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) =>
      validateTaskProgressSyncBehaviorContracts({
        repoRoot,
        scenarioRoot: path.join(repoRoot, check.proof_fixture_root)
      })
  }),
  "repo-context-behavior": Object.freeze({
    layer: "contract",
    assertionKind: "behavior",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateRepoContextBehaviorContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) =>
      validateRepoContextBehaviorContracts({
        repoRoot,
        scenarioRoot: path.join(repoRoot, check.proof_fixture_root)
      })
  }),
  "project-context-behavior": Object.freeze({
    layer: "contract",
    assertionKind: "behavior",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateProjectContextBehaviorContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) =>
      validateProjectContextBehaviorContracts({
        repoRoot,
        scenarioRoot: path.join(repoRoot, check.proof_fixture_root)
      })
  }),
  "hook-root-behavior": Object.freeze({
    layer: "contract",
    assertionKind: "behavior",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateHookRootBehaviorContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) =>
      validateHookRootBehaviorContracts({
        repoRoot,
        scenarioRoot: path.join(repoRoot, check.proof_fixture_root)
      })
  }),
  "validate-git-behavior": Object.freeze({
    layer: "contract",
    assertionKind: "behavior",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateValidateGitBehaviorContracts({ repoRoot }),
    runProof: ({ repoRoot, check }) =>
      validateValidateGitBehaviorContracts({
        repoRoot,
        scenarioRoot: path.join(repoRoot, check.proof_fixture_root)
      })
  }),
  "text-consistency": Object.freeze({
    layer: "consistency",
    assertionKind: "consistency",
    requiresProof: true,
    runActive: ({ repoRoot }) => validateConsistency({ repoRoot }),
    runProof: ({ repoRoot, check }) => validateConsistency({ repoRoot: path.join(repoRoot, check.proof_fixture_root) })
  }),
  "registry-meta": Object.freeze({
    layer: "meta",
    assertionKind: "meta",
    requiresProof: false,
    runActive: ({ repoRoot }) => validateMeta({ repoRoot })
  })
});

function validateRegistryExecutionShape({ repoRoot, registryFilePath = getRegistryPath(repoRoot) } = {}) {
  const errors = [];
  const registry = loadJsonFile(repoRoot, registryFilePath, errors);

  if (registry === null) {
    return { ok: false, errors, registry: null };
  }

  if (!Array.isArray(registry.checks) || registry.checks.length === 0) {
    errors.push("standards/codex-starter-test-registry.json: checks must be a non-empty array");
    return { ok: false, errors, registry };
  }

  for (const check of registry.checks) {
    for (const field of ["id", "layer", "assertion_kind", "status", "executor"]) {
      if (!check[field]) {
        errors.push(`standards/codex-starter-test-registry.json: check is missing ${field}`);
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
      errors.push(
        `${check.id}: executor "${check.executor}" must use assertion_kind "${definition.assertionKind}"`
      );
    }
  }

  return { ok: errors.length === 0, errors, registry };
}

function validateRegistry({
  repoRoot = defaultRepoRoot,
  registryFilePath = getRegistryPath(repoRoot)
} = {}) {
  const errors = [];
  const registry = loadJsonFile(repoRoot, registryFilePath, errors);
  const validLayers = new Set(["contract", "consistency", "meta"]);
  const validAssertionKinds = new Set(["shape", "behavior", "consistency", "meta"]);
  const validStatuses = new Set(["active", "temporary", "deprecated"]);
  const seenIds = new Set();
  const seenCoverageKeys = new Set();

  if (registry === null) {
    return { ok: false, errors, registry: null };
  }

  if (!Number.isInteger(registry.version) || registry.version < 1) {
    errors.push("standards/codex-starter-test-registry.json: version must be an integer >= 1");
  }

  if (!registry.budgets || typeof registry.budgets !== "object") {
    errors.push("standards/codex-starter-test-registry.json: budgets must be an object");
  }

  if (!Array.isArray(registry.checks) || registry.checks.length === 0) {
    errors.push("standards/codex-starter-test-registry.json: checks must be a non-empty array");
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
        errors.push(
          `${check.id}: executor "${check.executor}" must use assertion_kind "${definition.assertionKind}"`
        );
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
      errors.push(`standards/codex-starter-test-registry.json: no runnable checks registered for layer "${layer}"`);
    }
  }

  const maxActiveChecks = registry.budgets?.max_active_checks;
  if (typeof maxActiveChecks !== "number" || maxActiveChecks < 1) {
    errors.push("standards/codex-starter-test-registry.json: budgets.max_active_checks must be >= 1");
  } else if (runnableChecks > maxActiveChecks) {
    errors.push(`runnable checks ${runnableChecks} exceed budget ${maxActiveChecks}`);
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
      errors: [`standards/codex-starter-test-registry.json: no runnable checks available for layer "${layer}"`],
      checks: []
    };
  }

  return { ok: true, errors: [], checks };
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
  const items = order
    .filter((key) => counts.get(key))
    .map((key) => `${key}=${counts.get(key)}`);

  return items.length > 0 ? ` (${items.join(", ")})` : "";
}

function executeLayer({ repoRoot = defaultRepoRoot, layer }) {
  const loadResult = loadRunnableChecksForLayer({ repoRoot, layer });
  if (!loadResult.ok) {
    return { ok: false, errors: loadResult.errors, summary: new Map() };
  }

  const errors = [];
  const summary = summarizeAssertionKinds(loadResult.checks);

  for (const check of loadResult.checks) {
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
      errors.push(
        `${check.id}: executor "${check.executor}" threw ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { ok: errors.length === 0, errors, summary };
}

function runLayers(mode, repoRoot) {
  const layers = [];

  if (mode === "contract" || mode === "full") {
    layers.push(["contract", executeLayer({ repoRoot, layer: "contract" })]);
  }

  if (mode === "consistency" || mode === "full") {
    layers.push(["consistency", executeLayer({ repoRoot, layer: "consistency" })]);
  }

  if (mode === "meta" || mode === "full") {
    layers.push(["meta", executeLayer({ repoRoot, layer: "meta" })]);
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

  process.stdout.write("codex-starter development validation passed\n");
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
  validateRepoContextBehaviorContracts,
  validateProjectContextBehaviorContracts,
  validateRegistry,
  validateTaskProgressSyncBehaviorContracts,
  validateTaskStateBehaviorContracts,
  validateValidateGitBehaviorContracts
};
