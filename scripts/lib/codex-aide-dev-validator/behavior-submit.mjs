import fs from "node:fs";
import path from "node:path";

import {
  assertAbsentFields,
  assertProjectArtifacts,
  collectScenarioErrors,
  compareExpectedArray,
  compareExpectedArrayFields,
  compareExpectedNestedFields,
  compareExpectedObject,
  defaultRepoRoot,
  finishValidation,
  initGitRepo,
  invalidStepsResult,
  isPlainObject,
  mergeJsonValue,
  readJson,
  readSubmitPreferencesState,
  runGit,
  runNodeJsonScript,
  runSetupCommands,
  runShellSetup,
  withTempProject,
  writeJsonFile,
  writeTextFile
} from "./shared.mjs";

function bootstrapDeliveryGateRoundtrip(projectDir) {
  runShellSetup("git config user.email tester@example.com", projectDir);
  runShellSetup("git config user.name tester", projectDir);
  runShellSetup("git checkout -b feat/runtime-delivery", projectDir);
  runShellSetup("git add .", projectDir);
  runShellSetup('git commit -m "chore: init"', projectDir);
  runShellSetup("git init --bare -q ../remote.git", projectDir);
  runShellSetup("git remote add origin ../remote.git", projectDir);

  writeTextFile(
    path.join(projectDir, ".codex", "bin", "notify.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
if [ -f .codex/artifacts/delivery/fail-notify.flag ]; then
  echo notify-stage-failed >&2
  exit 1
fi
printf '%s %s %s\n' "$CODEX_DELIVERY_STAGE" "$CODEX_DELIVERY_REMOTE" "$CODEX_DELIVERY_BRANCH" >> .codex/artifacts/delivery/notify.log
`
  );
  writeTextFile(
    path.join(projectDir, ".codex", "bin", "ci.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s %s\n' "$CODEX_DELIVERY_STAGE" "$CODEX_DELIVERY_BRANCH" >> .codex/artifacts/delivery/ci.log
`
  );
  writeTextFile(
    path.join(projectDir, ".codex", "bin", "release.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s %s\n' "$CODEX_DELIVERY_STAGE" "\${#CODEX_DELIVERY_COMMIT_SHA}" >> .codex/artifacts/delivery/release.log
`
  );
  fs.chmodSync(path.join(projectDir, ".codex", "bin", "notify.sh"), 0o755);
  fs.chmodSync(path.join(projectDir, ".codex", "bin", "ci.sh"), 0o755);
  fs.chmodSync(path.join(projectDir, ".codex", "bin", "release.sh"), 0o755);

  const deliveryPolicyPath = path.join(projectDir, ".codex", "policies", "delivery-policy.json");
  const deliveryPolicy = readJson(deliveryPolicyPath);
  deliveryPolicy.notify.enabled = true;
  deliveryPolicy.notify.command = "bash .codex/bin/notify.sh";
  deliveryPolicy.ci.enabled = true;
  deliveryPolicy.ci.command = "bash .codex/bin/ci.sh";
  deliveryPolicy.release.enabled = true;
  deliveryPolicy.release.command = "bash .codex/bin/release.sh";
  writeJsonFile(deliveryPolicyPath, deliveryPolicy);

  writeJsonFile(path.join(projectDir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: false
    },
    task: {
      current_task: "Submit delivery",
      task_id: "submit-task",
      status: "active",
      class: "feature",
      delivery_mode: "long-running",
      checkpoint: "handoff",
      next_owner: "submit",
      next_step: "",
      waiting_on: "none",
      qc_policy: "disabled",
      submit_policy: "manual"
    },
    recent_tasks: []
  });

  fs.appendFileSync(path.join(projectDir, "AGENTS.md"), "\nsubmit-proof\n", "utf8");
}

function validateSubmitDeliveryScenario({ repoRoot = defaultRepoRoot, scenario }) {
  return withTempProject(repoRoot, "codex-aide-submit-delivery-", ({ projectDir }) => {
    const errors = [];

    initGitRepo(projectDir);

    if (String(scenario.bootstrap || "").trim() === "delivery-gate-roundtrip") {
      bootstrapDeliveryGateRoundtrip(projectDir);
    }

    runSetupCommands(scenario.setup_commands, projectDir);

    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      return invalidStepsResult(scenario);
    }

    const taskContextDefaults = isPlainObject(scenario.task_context_defaults) ? scenario.task_context_defaults : undefined;
    const stepDefaults = isPlainObject(scenario.step_defaults) ? scenario.step_defaults : undefined;

    scenario.steps.forEach((rawStep, index) => {
      const step = mergeJsonValue(stepDefaults, rawStep) || {};
      const label = `${scenario.id || "<unknown>"} step ${index + 1}`;
      const cwdRelative = typeof step.cwd_relative === "string" ? step.cwd_relative.trim() : "";
      const stepCwd = cwdRelative ? path.join(projectDir, cwdRelative) : projectDir;
      fs.mkdirSync(stepCwd, { recursive: true });

      runSetupCommands(step.setup_commands, stepCwd);

      if (step.task_context && typeof step.task_context === "object") {
        writeJsonFile(
          path.join(projectDir, ".codex", "state", "task-context.json"),
          mergeJsonValue(taskContextDefaults, step.task_context)
        );
      }

      const stepScript = String(step.script || "plan").trim().toLowerCase();
      const scriptPath = path.join(
        projectDir,
        ".codex",
        "scripts",
        "submit",
        stepScript === "execute" ? "execute-delivery.mjs" : "plan-delivery.mjs"
      );
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
        actual: parsed?.commit,
        expected: expect.commit_fields,
        baseLabel: `${label}: expected commit`,
        errors
      });
      compareExpectedObject({
        actual: parsed?.push,
        expected: expect.push_fields,
        baseLabel: `${label}: expected push`,
        errors
      });
      compareExpectedObject({
        actual: parsed?.qc,
        expected: expect.qc_fields,
        baseLabel: `${label}: expected qc`,
        errors
      });
      compareExpectedObject({
        actual: parsed?.notify,
        expected: expect.notify_fields,
        baseLabel: `${label}: expected notify`,
        errors
      });
      compareExpectedObject({
        actual: parsed?.ci,
        expected: expect.ci_fields,
        baseLabel: `${label}: expected ci`,
        errors
      });
      compareExpectedObject({
        actual: parsed?.release,
        expected: expect.release_fields,
        baseLabel: `${label}: expected release`,
        errors
      });
      compareExpectedObject({
        actual: parsed?.task_update,
        expected: expect.task_update_fields,
        baseLabel: `${label}: expected task_update`,
        errors
      });
      assertAbsentFields({
        actual: parsed?.task_update,
        fields: expect.task_update_absent_fields,
        label: `${label}: expected task_update`,
        errors
      });
      compareExpectedObject({
        actual: parsed?.git,
        expected: expect.git_fields,
        baseLabel: `${label}: expected git`,
        errors
      });
      compareExpectedArrayFields({
        actual: parsed?.git,
        expected: expect.git_array_fields,
        baseLabel: `${label}: expected git`,
        errors
      });
      compareExpectedArray({
        actual: parsed?.blockers,
        expected: expect.blockers,
        label: `${label}: expected blockers`,
        errors
      });
      compareExpectedNestedFields({
        actual: parsed?.preferences,
        expected: expect.preference_fields,
        baseLabel: `${label}: expected preferences`,
        errors
      });

      const preferenceState = readSubmitPreferencesState(projectDir);
      compareExpectedNestedFields({
        actual: preferenceState,
        expected: expect.preference_state_fields,
        baseLabel: `${label}: expected state.submit_preferences`,
        errors
      });

      if (typeof expect.head_subject === "string") {
        const headSubject = runGit(stepCwd, ["log", "-1", "--pretty=%s"]);
        const actualHeadSubject = headSubject.ok ? headSubject.stdout : "<missing>";
        if (actualHeadSubject !== expect.head_subject) {
          errors.push(`${label}: expected head_subject=${expect.head_subject}, got ${actualHeadSubject}`);
        }
      }

      if (typeof expect.upstream === "string") {
        const upstream = runGit(stepCwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
        const actualUpstream = upstream.ok ? upstream.stdout : "<missing>";
        if (actualUpstream !== expect.upstream) {
          errors.push(`${label}: expected upstream=${expect.upstream}, got ${actualUpstream}`);
        }
      }

      if (typeof expect.remote_branch_exists === "string") {
        const remoteBranch = runGit(stepCwd, ["ls-remote", "--heads", "origin", expect.remote_branch_exists]);
        const exists = remoteBranch.ok && Boolean(remoteBranch.stdout);
        if (!exists) {
          errors.push(`${label}: expected remote branch ${expect.remote_branch_exists} to exist`);
        }
      }

      assertProjectArtifacts({ projectDir, expect, label, errors });
    });

    return finishValidation(errors);
  });
}

function validateSubmitDeliveryBehaviorContracts({
  repoRoot = defaultRepoRoot,
  scenarioRoot = path.join(repoRoot, "fixtures", "codex-aide-dev", "submit-delivery-pass")
} = {}) {
  return collectScenarioErrors({ repoRoot, scenarioRoot, validateScenario: validateSubmitDeliveryScenario });
}

export { validateSubmitDeliveryBehaviorContracts };
