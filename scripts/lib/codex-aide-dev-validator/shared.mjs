import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

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

function normalizeRepoRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

function pathCoversRelativeTarget(repoRoot, sourcePath, relativeTarget) {
  const normalizedSource = normalizeRepoRelativePath(sourcePath);
  const normalizedTarget = normalizeRepoRelativePath(relativeTarget);
  if (!normalizedSource || !normalizedTarget) {
    return false;
  }

  if (normalizedSource === normalizedTarget) {
    return true;
  }

  const sourceAbs = path.join(repoRoot, normalizedSource);
  if (fileExists(sourceAbs) && fs.statSync(sourceAbs).isDirectory()) {
    return normalizedTarget.startsWith(`${normalizedSource}/`);
  }

  return false;
}

function getConsistencySpecPath(repoRoot) {
  return path.join(repoRoot, "tests", "standards", "codex-aide-consistency-map.json");
}

function getRegistryPath(repoRoot) {
  return path.join(repoRoot, "tests", "standards", "codex-aide-test-registry.json");
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

function cloneJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeJsonValue(baseValue, overrideValue) {
  if (overrideValue === undefined) {
    return cloneJsonValue(baseValue);
  }

  if (baseValue === undefined) {
    return cloneJsonValue(overrideValue);
  }

  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const result = {};
    const keys = new Set([...Object.keys(baseValue), ...Object.keys(overrideValue)]);
    for (const key of keys) {
      result[key] = mergeJsonValue(baseValue[key], overrideValue[key]);
    }
    return result;
  }

  return cloneJsonValue(overrideValue);
}

function buildStructuredResultMessage({ title = "", structuredResult }) {
  const heading = String(title || "").trim();
  const body = `## Structured Result\n\`\`\`json\n${JSON.stringify(structuredResult)}\n\`\`\``;
  return heading ? `${heading}\n\n${body}` : body;
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

function buildHookTranscriptEntries(step, index = 0) {
  if (Array.isArray(step.transcript_entries)) {
    return step.transcript_entries;
  }

  if (!isPlainObject(step.transcript)) {
    return null;
  }

  const transcript = step.transcript;
  const turnId = String(transcript.turn_id || step.input?.turn_id || `turn-${index + 1}`).trim();
  const startedAt = String(transcript.started_at || "2026-04-01T00:00:00.000Z");
  const phase = String(transcript.phase || "final_answer");
  const entries = [
    {
      timestamp: startedAt,
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: turnId
      }
    }
  ];

  for (const [waitIndex, item] of (transcript.wait_agent_results || []).entries()) {
    const structuredResult = isPlainObject(item.result) ? item.result : cloneJsonValue(item);
    const role = String(item.role || structuredResult?.role || "worker").trim() || "worker";
    const callId = String(item.call_id || `call-wait-${waitIndex + 1}`).trim();
    const target = String(item.target || `${role}-agent`).trim();
    const calledAt = String(item.called_at || startedAt);
    const returnedAt = String(item.returned_at || calledAt);

    entries.push({
      timestamp: calledAt,
      type: "response_item",
      payload: {
        type: "function_call",
        name: "wait_agent",
        arguments: JSON.stringify({ targets: [target] }),
        call_id: callId
      }
    });

    entries.push({
      timestamp: returnedAt,
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: callId,
        output: buildStructuredResultMessage({
          structuredResult
        })
      }
    });
  }

  const assistantMessage = String(
    transcript.assistant_message ||
      (isPlainObject(transcript.structured_result)
        ? buildStructuredResultMessage({
            title: transcript.title,
            structuredResult: transcript.structured_result
          })
        : "")
  );

  if (assistantMessage) {
    entries.push({
      timestamp: String(transcript.assistant_at || startedAt),
      type: "event_msg",
      payload: {
        type: "agent_message",
        phase,
        message: assistantMessage
      }
    });
  }

  for (const entry of transcript.extra_entries || []) {
    entries.push(cloneJsonValue(entry));
  }

  return entries;
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

function normalizeScenarioEntries(filePath, scenarioValue) {
  if (Array.isArray(scenarioValue)) {
    return scenarioValue.map((scenario, index) => ({
      filePath: `${filePath}#${index + 1}`,
      scenario
    }));
  }

  return [
    {
      filePath,
      scenario: scenarioValue
    }
  ];
}

function loadScenarioFiles(scenarioRoot) {
  return listFilesRecursive(scenarioRoot, (filePath) => filePath.endsWith(".json")).flatMap((filePath) =>
    normalizeScenarioEntries(filePath, readJson(filePath))
  );
}

function finishValidation(errors) {
  return { ok: errors.length === 0, errors };
}

function invalidStepsResult(scenario) {
  return {
    ok: false,
    errors: [`${scenario.id || "<unknown>"}: steps must be a non-empty array`]
  };
}

function collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario }) {
  const errors = [];

  for (const { filePath, scenario } of loadScenarioFiles(scenarioRoot)) {
    const result = validateScenario({ repoRoot, scenario });
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push(`${displayPath(repoRoot, filePath)}: ${error}`);
      }
    }
  }

  return finishValidation(errors);
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

function readNestedValue(target, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, segment) => (current && Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : undefined), target);
}

function compareExpectedNestedFields({ actual, expected, baseLabel, errors }) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return;
  }

  for (const [key, value] of Object.entries(expected)) {
    const actualValue = readNestedValue(actual, key);
    if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
      errors.push(
        `${baseLabel}.${key}=${JSON.stringify(value)}, got ${actualValue === undefined ? "<missing>" : JSON.stringify(actualValue)}`
      );
    }
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

function assertAbsentFields({ actual, fields, label, errors }) {
  if (!Array.isArray(fields)) {
    return;
  }

  for (const field of fields) {
    const actualValue = actual ? actual[field] : undefined;
    if (actualValue !== undefined) {
      errors.push(`${label}.${field} to be absent, got ${JSON.stringify(actualValue)}`);
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

function readSubmitPreferencesState(projectDir) {
  const stateFilePath = path.join(projectDir, ".codex", "state", "submit-preferences.json");
  if (!fileExists(stateFilePath)) {
    return null;
  }

  return readJson(stateFilePath);
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

function getHookChainCommands(hooksConfig, eventName, chainIndex = 0) {
  const chains = hooksConfig?.hooks?.[eventName];
  if (!Array.isArray(chains) || !chains[chainIndex] || !Array.isArray(chains[chainIndex].hooks)) {
    throw new Error(`hook chain not found for ${eventName}[${chainIndex}]`);
  }

  return chains[chainIndex].hooks.map((hook, hookIndex) => {
    if (!hook || hook.type !== "command" || typeof hook.command !== "string") {
      throw new Error(`hook command not found for ${eventName}[${chainIndex}].hooks[${hookIndex}]`);
    }

    return hook.command;
  });
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

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeTextFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value || ""), "utf8");
}

function writeJsonlFile(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = Array.isArray(entries) ? entries.map((entry) => JSON.stringify(entry)) : [];
  fs.writeFileSync(filePath, lines.length > 0 ? `${lines.join("\n")}\n` : "", "utf8");
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

function runSetupCommands(commands, cwd) {
  for (const command of commands || []) {
    runShellSetup(String(command || ""), cwd);
  }
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  return {
    ok: (result.status ?? 1) === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function withTempProject(repoRoot, prefix, callback) {
  const sourceProjectDir = path.join(repoRoot, "codex-aide");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const projectDir = path.join(tempRoot, "codex-aide");

  fs.cpSync(sourceProjectDir, projectDir, { recursive: true });

  try {
    return callback({ projectDir, tempRoot });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function assertProjectArtifacts({ projectDir, expect, label, errors }) {
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

  const projectDirContains = expect.project_dir_contains && typeof expect.project_dir_contains === "object"
    ? expect.project_dir_contains
    : {};
  for (const [relativeDir, expectedText] of Object.entries(projectDirContains)) {
    const targetDir = path.join(projectDir, relativeDir);
    const files = listFilesRecursive(targetDir, () => true);
    const matched = files.some((filePath) => readText(filePath).includes(String(expectedText)));
    if (!matched) {
      errors.push(`${label}: expected some file under ${relativeDir} to contain ${JSON.stringify(expectedText)}`);
    }
  }

  const fileContains = expect.project_file_contains && typeof expect.project_file_contains === "object"
    ? expect.project_file_contains
    : {};
  for (const [relativePath, expectedText] of Object.entries(fileContains)) {
    const filePath = path.join(projectDir, relativePath);
    const actualText = fileExists(filePath) ? readText(filePath) : "";
    if (!actualText.includes(String(expectedText))) {
      errors.push(`${label}: expected project file ${relativePath} to contain ${JSON.stringify(expectedText)}`);
    }
  }
}

export {
  assertAbsentFields,
  assertPresentFields,
  assertProjectArtifacts,
  buildHookTranscriptEntries,
  buildScenarioEnv,
  buildScenarioInput,
  buildStructuredResultMessage,
  cloneJsonValue,
  collectScenarioErrors,
  compareExpectedArray,
  compareExpectedArrayFields,
  compareExpectedNestedFields,
  compareExpectedObject,
  compareExpectedRelativePathFields,
  defaultRepoRoot,
  displayPath,
  fileExists,
  finishValidation,
  getConsistencySpecPath,
  getHookChainCommands,
  getHookCommand,
  getRegistryPath,
  initGitRepo,
  invalidStepsResult,
  isPlainObject,
  latestJsonlEntry,
  listFilesRecursive,
  loadJsonFile,
  loadScenarioFiles,
  mergeJsonValue,
  normalizeRepoRelativePath,
  pathCoversRelativeTarget,
  readHooksConfig,
  readJson,
  readRepoContextState,
  readSubmitPreferencesState,
  readTaskContextState,
  readText,
  relativeOrDot,
  relativeRepoPath,
  runGit,
  runHookCommand,
  runInlineModuleProbe,
  runNodeJsonScript,
  runNodeRawScript,
  runSetupCommands,
  runShellSetup,
  withTempProject,
  writeJsonFile,
  writeJsonlFile,
  writeStructuredTranscript,
  writeTextFile
};
