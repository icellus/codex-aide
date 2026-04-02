import fs from "node:fs";
import path from "node:path";

import { validateGovernanceTarget } from "../../../starter/aide/scripts/guards/validate-governance-target.mjs";

import {
  assertProjectArtifacts,
  assertPresentFields,
  buildScenarioEnv,
  buildScenarioInput,
  collectScenarioErrors,
  compareExpectedArray,
  compareExpectedArrayFields,
  compareExpectedObject,
  compareExpectedRelativePathFields,
  defaultRepoRoot,
  fileExists,
  finishValidation,
  invalidStepsResult,
  isPlainObject,
  mergeJsonValue,
  readJson,
  readRepoContextState,
  readTaskContextState,
  relativeOrDot,
  runInlineModuleProbe,
  runNodeJsonScript,
  runNodeRawScript,
  runSetupCommands,
  withTempProject,
  writeStructuredTranscript
} from "./shared.mjs";

function writePendingResultFile(projectDir, relativePath, result, options = {}) {
  fs.mkdirSync(path.dirname(path.join(projectDir, relativePath)), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, relativePath),
    `${JSON.stringify(
      {
        version: 1,
        written_at: options.writtenAt || "2026-04-01T00:00:01.000Z",
        session_id: options.sessionId || null,
        turn_id: options.turnId || null,
        result
      },
      null,
      2
    )}\n`,
    "utf8"
  );
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

  if (mutation.type === "delete-file") {
    fs.rmSync(filePath, { force: true });
    return;
  }

  throw new Error(`unsupported scenario mutation type "${mutation?.type || "<missing>"}"`);
}

function validateGovernanceFlowScenario({ repoRoot = defaultRepoRoot, scenario }) {
  return withTempProject(repoRoot, "codex-aide-governance-", ({ projectDir, tempRoot }) => {
    const errors = [];

    for (const mutation of scenario.pre_mutations || []) {
      applyGovernanceScenarioMutation(projectDir, mutation);
    }

    const expect = scenario.expect || {};
    const targetPath = expect.target_path || scenario.candidate?.authority_target;
    const targetFilePath = targetPath ? path.join(projectDir, targetPath) : null;
    const beforeTargetText = targetFilePath && fileExists(targetFilePath) ? fs.readFileSync(targetFilePath, "utf8") : null;
    let invocation = null;

    if (scenario.mode === "ingest") {
      if (scenario.pending_governance_result && typeof scenario.pending_governance_result === "object") {
        writePendingResultFile(
          projectDir,
          path.join(".codex", "aide", "state", "pending-governance-result.json"),
          scenario.pending_governance_result,
          {
            writtenAt: scenario.pending_governance_result_written_at,
            sessionId: scenario.pending_governance_result_session_id || scenario.session_id || scenario.id || "scenario-session",
            turnId: scenario.pending_governance_result_turn_id || scenario.turn_id || scenario.turnId || "turn-governance"
          }
        );
      }

      const ingestInput = {
        projectDir,
        session_id: scenario.session_id || scenario.id || "scenario-session",
        turn_id: scenario.turn_id || scenario.turnId || "turn-governance"
      };

      if (scenario.structured_result && typeof scenario.structured_result === "object") {
        const transcriptPath = path.join(tempRoot, `${scenario.id || "scenario"}.jsonl`);
        writeStructuredTranscript(transcriptPath, scenario.structured_result || {});
        ingestInput.transcript_path = transcriptPath;
      } else if (scenario.pending_governance_result && typeof scenario.pending_governance_result === "object") {
        const transcriptPath = path.join(tempRoot, `${scenario.id || "scenario"}.jsonl`);
        writeStructuredTranscript(transcriptPath, {});
        ingestInput.transcript_path = transcriptPath;
      }

      invocation = runNodeJsonScript(path.join(projectDir, ".codex", "aide", "hooks", "ingest-governance.mjs"), projectDir, ingestInput);
    } else if (scenario.mode === "writeback") {
      invocation = runNodeJsonScript(path.join(projectDir, ".codex", "aide", "scripts", "governance", "writeback.mjs"), projectDir, {
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

    const afterTargetText = targetFilePath && fileExists(targetFilePath) ? fs.readFileSync(targetFilePath, "utf8") : null;
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

    const stateFilePath = path.join(projectDir, ".codex", "aide", "state", "governance-context.json");
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

    assertProjectArtifacts({ projectDir, expect, label: scenario.id || "<unknown>", errors });

    return finishValidation(errors);
  });
}

function validateGovernanceFlowContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "tests", "fixtures", "codex-aide-dev", "governance-flow-pass")
} = {}) {
  return collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario: validateGovernanceFlowScenario });
}

function validateTaskStateScenario({ repoRoot = defaultRepoRoot, scenario }) {
  return withTempProject(repoRoot, "codex-aide-task-state-", ({ projectDir }) => {
    const errors = [];

    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return invalidStepsResult(scenario);
    }

    const scriptPath = path.join(projectDir, ".codex", "aide", "scripts", "context", "task-state.mjs");
    const stepDefaults = isPlainObject(scenario.step_defaults) ? scenario.step_defaults : undefined;

    scenario.steps.forEach((rawStep, index) => {
      const step = mergeJsonValue(stepDefaults, rawStep) || {};
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

      if (typeof expect.status === "string" && String(parsed?.status || "") !== expect.status) {
        errors.push(`${label}: expected status=${expect.status}, got ${parsed?.status || "<missing>"}`);
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

      assertProjectArtifacts({ projectDir, expect, label, errors });
    });

    return finishValidation(errors);
  });
}

function validateTaskStateBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "tests", "fixtures", "codex-aide-dev", "task-state-pass")
} = {}) {
  return collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario: validateTaskStateScenario });
}

function validateRepoContextScenario({ repoRoot = defaultRepoRoot, scenario }) {
  return withTempProject(repoRoot, "codex-aide-repo-context-", ({ projectDir }) => {
    const errors = [];
    runSetupCommands(scenario.setup_commands, projectDir);

    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return invalidStepsResult(scenario);
    }

    const scriptPath = path.join(projectDir, ".codex", "aide", "scripts", "context", "repo-context.mjs");

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

    return finishValidation(errors);
  });
}

function validateRepoContextBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "tests", "fixtures", "codex-aide-dev", "repo-context-pass")
} = {}) {
  return collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario: validateRepoContextScenario });
}

function validateProjectContextScenario({ repoRoot = defaultRepoRoot, scenario }) {
  return withTempProject(repoRoot, "codex-aide-project-context-", ({ projectDir }) => {
    const errors = [];
    runSetupCommands(scenario.setup_commands, projectDir);

    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return invalidStepsResult(scenario);
    }

    const modulePath = path.join(projectDir, ".codex", "aide", "scripts", "shared", "project-context.mjs");

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

    return finishValidation(errors);
  });
}

function validateProjectContextBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "tests", "fixtures", "codex-aide-dev", "project-context-pass")
} = {}) {
  return collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario: validateProjectContextScenario });
}

export {
  validateGovernanceFlowContracts,
  validateProjectContextBehaviorContracts,
  validateRepoContextBehaviorContracts,
  validateTaskStateBehaviorContracts
};
