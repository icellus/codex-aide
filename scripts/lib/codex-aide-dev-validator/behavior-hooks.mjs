import fs from "node:fs";
import path from "node:path";

import {
  assertPresentFields,
  assertProjectArtifacts,
  buildHookTranscriptEntries,
  buildScenarioEnv,
  buildScenarioInput,
  collectScenarioErrors,
  compareExpectedArrayFields,
  compareExpectedNestedFields,
  compareExpectedObject,
  compareExpectedRelativePathFields,
  defaultRepoRoot,
  fileExists,
  finishValidation,
  getHookChainCommands,
  getHookCommand,
  initGitRepo,
  invalidStepsResult,
  isPlainObject,
  latestJsonlEntry,
  mergeJsonValue,
  readHooksConfig,
  readTaskContextState,
  runHookCommand,
  runNodeJsonScript,
  runNodeRawScript,
  runSetupCommands,
  withTempProject,
  writeJsonFile,
  writeJsonlFile,
  writeTextFile
} from "./shared.mjs";

function writePendingResultFile(projectDir, relativePath, result, options = {}) {
  writeJsonFile(path.join(projectDir, relativePath), {
    version: 1,
    written_at: options.writtenAt || "2026-04-01T00:00:01.000Z",
    session_id: options.sessionId || null,
    turn_id: options.turnId || null,
    result
  });
}

function validateHookRootScenario({ repoRoot = defaultRepoRoot, scenario }) {
  return withTempProject(repoRoot, "codex-aide-hook-root-", ({ projectDir, tempRoot }) => {
    const errors = [];

    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return invalidStepsResult(scenario);
    }

    initGitRepo(projectDir);
    const hooksConfig = readHooksConfig(projectDir);
    fs.rmSync(path.join(projectDir, ".codex", "logs"), { recursive: true, force: true });

    const taskContextDefaults = isPlainObject(scenario.task_context_defaults) ? scenario.task_context_defaults : undefined;

    if (scenario.task_context && typeof scenario.task_context === "object") {
      writeJsonFile(
        path.join(projectDir, ".codex", "state", "task-context.json"),
        mergeJsonValue(taskContextDefaults, scenario.task_context)
      );
    }

    scenario.steps.forEach((rawStep, index) => {
      const step = mergeJsonValue(scenario.step_defaults, rawStep) || {};
      const label = `${scenario.id || "<unknown>"} step ${index + 1}`;
      const cwdRelative = typeof step.cwd_relative === "string" ? step.cwd_relative.trim() : "";
      const stepCwd = cwdRelative ? path.join(projectDir, cwdRelative) : projectDir;
      fs.mkdirSync(stepCwd, { recursive: true });

      if (step.task_context && typeof step.task_context === "object") {
        writeJsonFile(
          path.join(projectDir, ".codex", "state", "task-context.json"),
          mergeJsonValue(taskContextDefaults, step.task_context)
        );
      }

      if (step.pending_task_turn_result && typeof step.pending_task_turn_result === "object") {
        writePendingResultFile(
          projectDir,
          path.join(".codex", "state", "pending-task-turn-result.json"),
          step.pending_task_turn_result,
          {
            writtenAt: step.pending_task_turn_result_written_at,
            sessionId:
              step.pending_task_turn_result_session_id ||
              step.input?.session_id ||
              step.input?.sessionId ||
              scenario.step_defaults?.input?.session_id ||
              scenario.step_defaults?.input?.sessionId,
            turnId: step.pending_task_turn_result_turn_id || step.input?.turn_id || step.input?.turnId
          }
        );
      }

      if (step.pending_governance_result && typeof step.pending_governance_result === "object") {
        writePendingResultFile(
          projectDir,
          path.join(".codex", "state", "pending-governance-result.json"),
          step.pending_governance_result,
          {
            writtenAt: step.pending_governance_result_written_at,
            sessionId:
              step.pending_governance_result_session_id ||
              step.input?.session_id ||
              step.input?.sessionId ||
              scenario.step_defaults?.input?.session_id ||
              scenario.step_defaults?.input?.sessionId,
            turnId: step.pending_governance_result_turn_id || step.input?.turn_id || step.input?.turnId
          }
        );
      }

      const eventName = step.hook_event || "SessionStart";
      const chainIndex = Number.isInteger(step.chain_index) ? step.chain_index : 0;
      const commands = step.run_entire_chain === true
        ? getHookChainCommands(hooksConfig, eventName, chainIndex)
        : [
            getHookCommand(
              hooksConfig,
              eventName,
              chainIndex,
              Number.isInteger(step.hook_index) ? step.hook_index : 0
            )
          ];

      const stepInput = buildScenarioInput(step.input, {
        projectDir,
        stepCwd,
        useInputProjectDir: step.use_input_project_dir === true,
        useInputCwd: step.use_input_cwd === true
      });

      const transcriptEntries = buildHookTranscriptEntries(step, index);
      if (Array.isArray(transcriptEntries)) {
        const transcriptPath = path.join(tempRoot, `${scenario.id || "hook-scenario"}-step-${index + 1}.jsonl`);
        writeJsonlFile(transcriptPath, transcriptEntries);
        if (!stepInput.transcript_path) {
          stepInput.transcript_path = transcriptPath;
        }
      }

      let result = {
        status: 0,
        stdout: "",
        stderr: ""
      };

      for (const command of commands) {
        result = runHookCommand(command, {
          cwd: stepCwd,
          env: buildScenarioEnv(step.env, {
            projectDir,
            useEnvProjectDir: step.use_env_project_dir === true
          }),
          input: stepInput
        });

        if ((result.status ?? 1) !== 0) {
          break;
        }
      }

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
        const actualRelative = rootEntry?.projectDir ? path.relative(projectDir, rootEntry.projectDir).replace(/\\/g, "/") || "." : "<missing>";
        if (actualRelative !== expect.root_entry_project_dir_relative) {
          errors.push(
            `${label}: expected root_entry_project_dir_relative=${expect.root_entry_project_dir_relative}, got ${actualRelative}`
          );
        }
      }

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

      const lifecycleLogEntry = latestJsonlEntry(path.join(projectDir, ".codex", "logs", "task-lifecycle"));
      compareExpectedNestedFields({
        actual: lifecycleLogEntry,
        expected: expect.latest_lifecycle_log_fields,
        baseLabel: `${label}: expected latest_lifecycle_log`,
        errors
      });

      assertProjectArtifacts({ projectDir, expect, label, errors });
    });

    return finishValidation(errors);
  });
}

function validateHookRootBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-aide-dev", "hook-root-pass")
} = {}) {
  return collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario: validateHookRootScenario });
}

function validateGitScenario({ repoRoot = defaultRepoRoot, scenario }) {
  return withTempProject(repoRoot, "codex-aide-validate-git-", ({ projectDir }) => {
    const errors = [];

    initGitRepo(projectDir);
    runSetupCommands(scenario.setup_commands, projectDir);

    if (scenario.task_context && typeof scenario.task_context === "object") {
      writeJsonFile(path.join(projectDir, ".codex", "state", "task-context.json"), scenario.task_context);
    }

    const requestedScript = typeof scenario.script === "string" ? scenario.script.trim() : "";
    const normalizedScript = requestedScript.replace(/^\.?\//, "");
    const scriptPath = path.join(projectDir, normalizedScript || ".codex/scripts/guards/validate-git.mjs");
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

    if (typeof expect.stdout_exact === "string" && invocation.stdout !== expect.stdout_exact) {
      errors.push(`${scenario.id || "<unknown>"}: expected stdout=${JSON.stringify(expect.stdout_exact)}, got ${JSON.stringify(invocation.stdout)}`);
    }

    return finishValidation(errors);
  });
}

function validateValidateGitBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-aide-dev", "validate-git-pass")
} = {}) {
  return collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario: validateGitScenario });
}

function validateTaskProgressSyncScenario({ repoRoot = defaultRepoRoot, scenario }) {
  return withTempProject(repoRoot, "codex-aide-task-progress-sync-", ({ projectDir }) => {
    const errors = [];

    runSetupCommands(scenario.setup_commands, projectDir);

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

    return finishValidation(errors);
  });
}

function validateTaskProgressSyncBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-aide-dev", "task-progress-sync-pass")
} = {}) {
  return collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario: validateTaskProgressSyncScenario });
}

export {
  validateHookRootBehaviorContracts,
  validateTaskProgressSyncBehaviorContracts,
  validateValidateGitBehaviorContracts
};
