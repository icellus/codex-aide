import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { starterRootDir } from "../helpers/test-paths.mjs";

import {
  detectQcFail,
  loadRepoContext,
  loadProjectProfileState,
  parseActiveStories,
  saveRepoContext,
  saveTaskContext,
  syncProgressFromState
} from "../../../codex-starter/.codex/scripts/runtime-utils.mjs";

const rootDir = starterRootDir;
const runtimeStateScript = path.join(rootDir, ".codex", "scripts", "runtime-state.mjs");
const sessionContextScript = path.join(rootDir, ".codex", "scripts", "session-context.mjs");
const startupContextScript = path.join(rootDir, ".codex", "scripts", "startup-context.mjs");
const hookLogScript = path.join(rootDir, ".codex", "hooks", "log-event.mjs");
const taskOverviewScript = path.join(rootDir, ".codex", "scripts", "task-overview.mjs");
const aideEvolutionScript = path.join(rootDir, ".codex", "scripts", "aide-evolution.mjs");
const aideGovernanceScript = path.join(rootDir, ".codex", "scripts", "aide-governance.mjs");
const validateGitScript = path.join(rootDir, ".codex", "scripts", "validate-git.mjs");
const installScriptPath = path.join(rootDir, "install.sh");
const progressTemplatePath = path.join(rootDir, ".codex", "templates", "progress.md");
const projectProfilePath = path.join(rootDir, ".codex", "project-profile.md");
const routingPolicyPath = path.join(rootDir, ".codex", "routing-policy.md");
const validationProfilePath = path.join(rootDir, ".codex", "validation-profile.json");
const evolutionPolicyPath = path.join(rootDir, ".codex", "evolution-policy.json");
const testerAgentPath = path.join(rootDir, ".codex", "agents", "tester.toml");
const productAssistantPath = path.join(rootDir, ".codex", "agents", "product_assistant.toml");
const validationHandoffTemplatePath = path.join(rootDir, ".codex", "templates", "validation-handoff.md");
const productRegistryPath = path.join(rootDir, ".product", "registry.json");
const productMemoryPath = path.join(rootDir, ".product", "memory.json");
const productEvolutionPath = path.join(rootDir, ".product", "evolution.json");
const aideSkillPath = path.join(rootDir, ".agents", "skills", "aide", "SKILL.md");
const agentsGuidePath = path.join(rootDir, "AGENTS.md");
const overviewDocPath = path.join(rootDir, "docs", "overview.md");
const detailedGuidePath = path.join(rootDir, "docs", "detailed-guide.md");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function runNode(scriptPath, input, env = {}) {
  return execFileSync("node", [scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8"
  });
}

function runNodeResult(scriptPath, input, env = {}) {
  return spawnSync("node", [scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8"
  });
}

function readRuntimeState(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "runtime-state.json"), "utf8"));
}

function readTaskRegistry(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "task-registry.json"), "utf8"));
}

function readEvolutionRegistry(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "evolution-registry.json"), "utf8"));
}

function readTaskContextFile(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "task-context.json"), "utf8"));
}

function readRepoContextFile(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "repo-context.json"), "utf8"));
}

function readRuntimeLogEntries(projectDir) {
  const logDir = path.join(projectDir, ".codex", "logs", "runtime-hooks");
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs
    .readdirSync(logDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .flatMap((name) =>
      fs
        .readFileSync(path.join(logDir, name), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    );
}

function listRuntimeLogFiles(projectDir) {
  const logDir = path.join(projectDir, ".codex", "logs", "runtime-hooks");
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs.readdirSync(logDir).filter((name) => name.endsWith(".jsonl")).sort();
}

function readCodexHookLogEntries(projectDir) {
  const logDir = path.join(projectDir, ".codex", "logs", "codex-hooks");
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs
    .readdirSync(logDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .flatMap((name) =>
      fs
        .readFileSync(path.join(logDir, name), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    );
}

function prepareProjectProfile(targetPath, replacements = []) {
  let text = fs.readFileSync(projectProfilePath, "utf8");
  for (const [from, to] of replacements) {
    text = text.replace(from, to);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, text, "utf8");
}

function testQcDetectionRequiresQcMarkers() {
  assert.equal(detectQcFail("The feature is NOT IMPLEMENTED yet."), false);
  assert.equal(detectQcFail("Overall Verdict: FAIL\n- NOT IMPLEMENTED"), true);
}

function testValidationProfileDefinesRepoBaselineAndTesterOwnership() {
  const profile = JSON.parse(fs.readFileSync(validationProfilePath, "utf8"));
  assert.equal(profile.version, 2);
  assert.equal(profile.ownership.maintained_by, "/Aide");
  assert.equal(profile.ownership.purpose, "repository validation baseline only");
  assert.equal(profile.ownership.task_level_validation_owner, "tester");
  assert.ok(profile.repo_baseline);
}

function testTesterContractIncludesTaskValidationHandoff() {
  const testerAgent = fs.readFileSync(testerAgentPath, "utf8");
  const handoffTemplate = fs.readFileSync(validationHandoffTemplatePath, "utf8");

  assert.match(testerAgent, /## Task Validation Handoff/);
  assert.match(testerAgent, /"workflow_chain_id": ""/);
  assert.match(testerAgent, /"validation_targets": \[\]/);
  assert.match(testerAgent, /"coverage_rationale": ""/);
  assert.match(testerAgent, /"remaining_gaps": \[\]/);
  assert.match(handoffTemplate, /\*\*Workflow Chain ID\*\*/);
  assert.match(handoffTemplate, /workflow_chain_id/);
  assert.match(handoffTemplate, /## Validation Targets/);
  assert.match(handoffTemplate, /## Selected Checks/);
  assert.match(handoffTemplate, /## Coverage Rationale/);
  assert.match(handoffTemplate, /## Remaining Gaps/);
}

function testProductAssistantContractAndDefaultsExist() {
  const productAssistant = fs.readFileSync(productAssistantPath, "utf8");
  const aideSkill = fs.readFileSync(path.join(rootDir, ".agents", "skills", "aide", "SKILL.md"), "utf8");
  const registry = JSON.parse(fs.readFileSync(productRegistryPath, "utf8"));
  const memory = JSON.parse(fs.readFileSync(productMemoryPath, "utf8"));
  const evolution = JSON.parse(fs.readFileSync(productEvolutionPath, "utf8"));

  assert.match(productAssistant, /"sources_used": \[/);
  assert.match(productAssistant, /"template_updates_applied": \[/);
  assert.match(productAssistant, /"memory_updates_applied": \{/);
  assert.match(productAssistant, /"evolution_candidates": \[/);
  assert.match(productAssistant, /Match the output to the task and audience/);
  assert.match(aideSkill, /## Product Review/);
  assert.match(aideSkill, /inspect the real chat record/);

  assert.equal(registry.version, 1);
  assert.equal(registry.policy.starter_ships_empty, true);
  assert.equal(registry.policy.templates_are_user_evolved, true);
  assert.equal(registry.template_entry_shape.id, "");
  assert.deepEqual(registry.template_entry_shape.triggers, []);
  assert.deepEqual(registry.templates, []);
  assert.equal(memory.version, 1);
  assert.equal(memory.policy.current_conversation_wins, true);
  assert.equal(memory.policy.aide_reviews_chat_record, true);
  assert.equal(memory.policy.store_only_explicit_or_repeated_preferences, true);
  assert.equal(memory.user_preference_entry_shape.source, "explicit|repeated");
  assert.equal(memory.repo_preference_entry_shape.source, "explicit|repeated");
  assert.deepEqual(memory.user_preferences, []);
  assert.deepEqual(memory.repo_preferences, []);
  assert.equal(evolution.version, 1);
  assert.equal(evolution.policy.product_assistant_updates_candidates, true);
  assert.equal(evolution.policy.aide_reviews_chat_record, true);
  assert.equal(evolution.policy.repeated_mismatch_required_for_role_change, true);
  assert.equal(evolution.candidate_entry_shape.source, "product_assistant|aide");
  assert.equal(evolution.candidate_entry_shape.status, "queued|accepted|rejected|applied");
  assert.deepEqual(evolution.candidates, []);
}

function testAideContractHidesInternalWorkflowTermsAndDelegatesExecution() {
  const aideSkill = fs.readFileSync(aideSkillPath, "utf8");
  const agentsGuide = fs.readFileSync(agentsGuidePath, "utf8");
  const overviewDoc = fs.readFileSync(overviewDocPath, "utf8");
  const detailedGuide = fs.readFileSync(detailedGuidePath, "utf8");
  const routingPolicy = fs.readFileSync(routingPolicyPath, "utf8");
  const conductSkill = fs.readFileSync(path.join(rootDir, ".agents", "skills", "conduct", "SKILL.md"), "utf8");

  assert.match(aideSkill, /never expose internal workflow terms/i);
  assert.match(aideSkill, /do not implement repository changes/i);
  assert.match(aideSkill, /sound like a capable personal assistant/i);
  assert.match(aideSkill, /avoid stiff AI phrasing/i);
  assert.match(aideSkill, /concrete repo-change requests are not discussion-shaped work/i);
  assert.match(aideSkill, /hand off to the smallest clear execution role directly/i);
  assert.match(aideSkill, /avoid deep duplicate reading/i);
  assert.match(aideSkill, /do not read implementation files line by line/i);
  assert.match(agentsGuide, /team-secretary and people-manager role/i);
  assert.match(agentsGuide, /must not become the default implementer/i);
  assert.match(overviewDoc, /team's secretary and people manager/i);
  assert.match(overviewDoc, /delegate early and avoid deep local code reading/i);
  assert.match(detailedGuide, /It is a manager, not the default implementer/i);
  assert.match(detailedGuide, /delegate early and let the execution role read the code in detail/i);
  assert.match(routingPolicy, /must not execute concrete repo changes itself/i);
  assert.match(routingPolicy, /prefer cached state plus minimal boundary evidence/i);
  assert.match(routingPolicy, /Do not present coordination work as if `Aide` is personally going to implement the change/i);
  assert.match(routingPolicy, /Do not expose task class, delivery mode, enabled modules/i);
  assert.match(conductSkill, /optimize for assigning the smallest clear execution role/i);
  assert.match(conductSkill, /do not ask `Aide` to deep-read implementation details/i);
}

function testProgressSyncSupportsLegacyShape() {
  const dir = makeTempDir("codex-starter-progress-");
  const progressPath = path.join(dir, "PROGRESS.md");
  let template = fs.readFileSync(progressTemplatePath, "utf8");
  template = template.replace("[path/to/plan.md or N/A]", "plans/demo.md");
  template = template.replace("[path/to/plan-summary.md or N/A]", "plans/demo-summary.md");
  template = template.replace("[single next action]", "ship it");
  fs.writeFileSync(progressPath, template, "utf8");

  const activeStories = parseActiveStories(progressPath);
  assert.equal(activeStories.length, 1);
  assert.equal(activeStories[0].storyPath, "plans/demo.md");

  syncProgressFromState(progressPath, activeStories, {
    pendingActions: [
      {
        id: "session-retrospective:plans/demo.md",
        type: "session_retrospective",
        storyPath: "plans/demo.md",
        trigger: "blocked",
        note: "capture the bad assumption",
        createdAt: "2026-03-25T00:00:00Z",
        updatedAt: "2026-03-25T00:00:00Z"
      }
    ],
    learningQueue: [
      {
        id: "lesson-demo",
        source: "plans/demo.md",
        category: "missing-test",
        triggerCount: 2,
        suggestedRoute: [".codex/agents/tester.toml"],
        lesson: "Every requirement needs a real test.",
        status: "queued"
      }
    ],
    failurePatterns: {
      "plans/demo.md::missing-test": {
        source: "plans/demo.md",
        category: "missing-test",
        count: 2
      }
    }
  });

  const next = fs.readFileSync(progressPath, "utf8");
  assert.match(next, /## Current Work/);
  assert.match(next, /- QC retry pattern: missing-test x2/);
  assert.doesNotMatch(next, /## Session Retrospective \(Optional\)/);
  assert.doesNotMatch(next, /## Learning Queue \(Optional\)/);
}

function testTaskContextJsonOverridesMarkdownProfile() {
  const dir = makeTempDir("codex-starter-task-context-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [
    ["- Task status: `idle`", "- Task status: `done`"],
    ["- Selected delivery mode: `lightweight`", "- Selected delivery mode: `long-running`"]
  ]);
  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: true
    },
    task: {
      current_task: "Tighten hot runtime context",
      status: "active",
      class: "refactor",
      risk: "medium",
      delivery_mode: "lightweight",
      route_rationale: "cached JSON state should win on the hot path",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["lightweight execution"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  const profile = loadProjectProfileState(dir);
  assert.equal(profile.task, "Tighten hot runtime context");
  assert.equal(profile.taskStatus, "active");
  assert.equal(profile.deliveryMode, "lightweight");
}

function testTaskContextRemainsHotStateAuthorityForCollaborationFields() {
  const dir = makeTempDir("codex-starter-task-context-authority-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [
    ["- Preferred address: Boss", "- Preferred address: lead"],
    ["- Greeting style: warm", "- Greeting style: formal"]
  ]);
  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "captain",
      greeting_style: "formal",
      first_startup_greeting_completed: false
    },
    task: {
      current_task: "",
      status: "idle",
      class: "unknown",
      risk: "unknown",
      delivery_mode: "lightweight",
      route_rationale: "",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["lightweight execution"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "not-set",
      open_questions: []
    }
  });

  const profile = loadProjectProfileState(dir);
  assert.equal(profile.preferredAddress, "captain");
  assert.equal(profile.greetingStyle, "formal");
}

function testTaskContextHelpersWriteNormalizedState() {
  const dir = makeTempDir("codex-starter-save-task-context-");

  saveTaskContext(dir, {
    collaboration: {
      first_startup_greeting_completed: true
    },
    task: {
      current_task: "Review the routing flow",
      status: "active",
      enabled_roles: ["Aide"],
      open_questions: ["Should conduct run?"]
    }
  });

  const saved = JSON.parse(fs.readFileSync(path.join(dir, ".codex", "state", "task-context.json"), "utf8"));
  assert.equal(saved.version, 1);
  assert.equal(saved.collaboration.preferred_address, "Boss");
  assert.equal(saved.collaboration.greeting_style, "warm");
  assert.equal(saved.collaboration.first_startup_greeting_completed, true);
  assert.equal(saved.task.current_task, "Review the routing flow");
  assert.deepEqual(saved.task.enabled_roles, ["Aide"]);
  assert.deepEqual(saved.task.open_questions, ["Should conduct run?"]);
  assert.equal(saved.task.workflow.required_handoff, "none");
  assert.equal(saved.task.workflow.settlement_guard, "none");
}

function testRepoContextHelpersWriteNormalizedState() {
  const dir = makeTempDir("codex-starter-save-repo-context-");

  saveRepoContext(dir, {
    scan_status: "scanned",
    project_type: "Node service",
    primary_languages: ["JavaScript"],
    frameworks: ["Express"],
    validation_signals: ["npm test"]
  });

  const saved = loadRepoContext(dir);
  assert.equal(saved.version, 1);
  assert.equal(saved.scan_status, "scanned");
  assert.equal(saved.project_type, "Node service");
  assert.deepEqual(saved.primary_languages, ["JavaScript"]);
  assert.deepEqual(saved.frameworks, ["Express"]);
  assert.deepEqual(saved.validation_signals, ["npm test"]);
  assert.deepEqual(saved.notes, []);
}

function testTrimRuntimeStateDropsOldFailurePatterns() {
  const dir = makeTempDir("codex-starter-failure-patterns-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [
    ["- Selected delivery mode: `lightweight`", "- Selected delivery mode: `long-running`"],
    ["- QC policy: `disabled`", "- QC policy: `enabled`"]
  ]);
  fs.writeFileSync(
    path.join(dir, "PROGRESS.md"),
    [
      "# Project Progress",
      "",
      "## Current Work",
      "",
      "### Demo",
      "**Story**: `plans/demo.md`",
      "",
      "---",
      "## Completed"
    ].join("\n"),
    "utf8"
  );

  for (let index = 0; index < 30; index += 1) {
    runNode(
      runtimeStateScript,
      {
        event: "subagent_result",
        cwd: dir,
        role: "qc",
        message: [
          "## QC Report",
          "Overall Verdict: FAIL",
          "Phase: coder",
          "",
          "## Structured Result",
          "```json",
          JSON.stringify(
            {
              role: "qc",
              status: "complete",
              phase: "coder",
              verdict: "FAIL",
              categories: [`missing-test-${index}`]
            },
            null,
            2
          ),
          "```"
        ].join("\n"),
        story_path: "plans/demo.md"
      },
      { CODEX_PROJECT_DIR: dir }
    );
  }

  const state = readRuntimeState(dir);
  assert.equal(Object.keys(state.failurePatterns).length, 24);
}

function testCoderCompletionQueuesTesterWithoutStory() {
  const dir = makeTempDir("codex-starter-qc-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [
    ["- QC policy: `disabled`", "- QC policy: `enabled`"],
    ["- Selected delivery mode: `lightweight`", "- Selected delivery mode: `standard`"]
  ]);

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            story_path: null,
            plan_path: null,
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [
              {
                command: "npm test -- demo",
                result: "PASS"
              }
            ],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  assert.equal(state.pendingActions.length, 1);
  assert.equal(state.pendingActions[0].type, "run_tester");
  assert.equal(state.pendingActions[0].phase, "tester");
  assert.equal(state.pendingActions[0].storyPath, null);
}

function testCoderAndTesterCompletionUpdateWorkflowHotState() {
  const dir = makeTempDir("codex-starter-workflow-hot-state-");

  saveTaskContext(dir, {
    task: {
      current_task: "Tighten runtime flow",
      status: "active"
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [{ command: "npm test -- demo", result: "PASS" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const workflowAfterCoder = readTaskContextFile(dir).task.workflow;
  assert.equal(workflowAfterCoder.current_chain, "coder");
  assert.equal(typeof workflowAfterCoder.workflow_chain_id, "string");
  assert.notEqual(workflowAfterCoder.workflow_chain_id, "");
  assert.equal(workflowAfterCoder.expected_next_step, "tester_handoff");
  assert.equal(workflowAfterCoder.required_handoff, "tester");
  assert.equal(workflowAfterCoder.settlement_guard, "require_required_handoff");
  const workflowChainId = workflowAfterCoder.workflow_chain_id;

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "tester",
      message: [
        "## Task Validation Handoff",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "tester",
            status: "complete",
            needs_qc: true,
            workflow_chain_id: workflowChainId,
            validation_targets: ["runtime workflow guard"],
            coverage_rationale: "smoke",
            remaining_gaps: [],
            files_changed: [],
            validation: [{ command: "npm test -- demo", result: "PASS", purpose: "task validation" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const workflowAfterTester = readTaskContextFile(dir).task.workflow;
  assert.equal(workflowAfterTester.current_chain, "tester");
  assert.equal(workflowAfterTester.required_handoff, "none");
  assert.equal(workflowAfterTester.settlement_guard, "none");
  assert.equal(workflowAfterTester.expected_next_step, "submit");
  const stateAfterTester = readRuntimeState(dir);
  const blocked = stateAfterTester.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");
  assert.equal(blocked, undefined);
}

function testTesterCompletionWithMismatchedWorkflowChainIdKeepsGuard() {
  const dir = makeTempDir("codex-starter-workflow-chain-mismatch-");

  saveTaskContext(dir, {
    task: {
      current_task: "Validate workflow chain guard",
      status: "active"
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [{ command: "npm test -- demo", result: "PASS" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const workflowAfterCoder = readTaskContextFile(dir).task.workflow;
  assert.equal(workflowAfterCoder.current_chain, "coder");
  assert.equal(typeof workflowAfterCoder.workflow_chain_id, "string");
  assert.notEqual(workflowAfterCoder.workflow_chain_id, "");
  const activeChainId = workflowAfterCoder.workflow_chain_id;
  const mismatchedChainId = `${activeChainId}-mismatch`;

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "tester",
      message: [
        "## Task Validation Handoff",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "tester",
            status: "complete",
            needs_qc: true,
            workflow_chain_id: mismatchedChainId,
            validation_targets: ["workflow chain mismatch guard"],
            coverage_rationale: "smoke",
            remaining_gaps: [],
            files_changed: [],
            validation: [{ command: "npm test -- demo", result: "PASS", purpose: "task validation" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const workflowAfterTester = readTaskContextFile(dir).task.workflow;
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");
  const aideReview = state.pendingActions.find((item) => item.type === "aide_review" && item.sourceRole === "tester");
  const signalNote = [blocked?.note || "", aideReview?.note || ""].join(" ");

  assert.equal(workflowAfterTester.workflow_chain_id, activeChainId);
  assert.equal(workflowAfterTester.required_handoff, "tester");
  assert.equal(workflowAfterTester.settlement_guard, "require_required_handoff");
  assert.equal(workflowAfterTester.expected_next_step, "tester_handoff");
  assert.equal(state.pendingActions.some((item) => item.type === "run_submit"), false);
  assert.ok(blocked || aideReview);
  assert.match(signalNote, /workflow_chain_id|chain|mismatch/i);
}

function testTesterCompletionWithoutWorkflowChainIdKeepsGuard() {
  const dir = makeTempDir("codex-starter-workflow-chain-missing-");

  saveTaskContext(dir, {
    task: {
      current_task: "Validate missing workflow chain guard",
      status: "active"
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [{ command: "npm test -- demo", result: "PASS" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const workflowAfterCoder = readTaskContextFile(dir).task.workflow;
  assert.equal(workflowAfterCoder.current_chain, "coder");
  assert.equal(typeof workflowAfterCoder.workflow_chain_id, "string");
  assert.notEqual(workflowAfterCoder.workflow_chain_id, "");
  const activeChainId = workflowAfterCoder.workflow_chain_id;

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "tester",
      message: [
        "## Task Validation Handoff",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "tester",
            status: "complete",
            needs_qc: true,
            validation_targets: ["workflow chain missing guard"],
            coverage_rationale: "smoke",
            remaining_gaps: [],
            files_changed: [],
            validation: [{ command: "npm test -- demo", result: "PASS", purpose: "task validation" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const workflowAfterTester = readTaskContextFile(dir).task.workflow;
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");
  const aideReview = state.pendingActions.find((item) => item.type === "aide_review" && item.sourceRole === "tester");
  const signalNote = [blocked?.note || "", aideReview?.note || ""].join(" ");

  assert.equal(workflowAfterTester.workflow_chain_id, activeChainId);
  assert.equal(workflowAfterTester.required_handoff, "tester");
  assert.equal(workflowAfterTester.settlement_guard, "require_required_handoff");
  assert.equal(workflowAfterTester.expected_next_step, "tester_handoff");
  assert.equal(state.pendingActions.some((item) => item.type === "run_submit"), false);
  assert.ok(blocked || aideReview);
  assert.match(signalNote, /workflow_chain_id|chain|required|missing/i);
}

function testCoderCompletionDoesNotQueueSubmitBeforeTester() {
  const dir = makeTempDir("codex-starter-submit-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [
              {
                command: "npm test -- demo",
                result: "PASS"
              }
            ],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");

  assert.equal(submitAction, undefined);
  assert.ok(testerAction);
  assert.equal(testerAction.storyPath, null);
}

function testRuntimeRejectsCoderCompletionWithoutStructuredFooter() {
  const dir = makeTempDir("codex-starter-structured-missing-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: "## Implementation Complete\nDone."
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "coder");
  const aideReview = state.pendingActions.find(
    (item) => item.type === "aide_review" && item.sourceRole === "coder"
  );
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");

  assert.ok(blocked);
  assert.match(blocked.note, /missing required "## Structured Result" section/i);
  assert.ok(aideReview);
  assert.equal(testerAction, undefined);
}

function testRuntimeRejectsCoderCompletionWithoutNeedsQcTrue() {
  const dir = makeTempDir("codex-starter-needs-qc-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: false,
            files_changed: ["src/demo.ts"],
            validation: [],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "coder");
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");

  assert.ok(blocked);
  assert.match(blocked.note, /must set needs_qc: true/i);
  assert.equal(testerAction, undefined);
}

function testRuntimeRejectsStructuredResultBypassWithPostSectionJson() {
  const dir = makeTempDir("codex-starter-structured-bypass-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        '{"role":"coder","status":"complete","needs_qc":true,}',
        "```",
        "",
        "## Notes",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [{ command: "npm test -- demo", result: "PASS" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "coder");
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");

  assert.ok(blocked);
  assert.match(blocked.note, /no valid JSON object in the structured result section/i);
  assert.equal(testerAction, undefined);
}

function testRuntimeRejectsTesterCompletionWithoutStructuredFooter() {
  const dir = makeTempDir("codex-starter-tester-structured-missing-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [["- QC policy: `disabled`", "- QC policy: `enabled`"]]);

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "tester",
      message: "## Task Validation Handoff\nDone."
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");
  const qcAction = state.pendingActions.find((item) => item.type === "run_qc");
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");

  assert.ok(blocked);
  assert.match(blocked.note, /missing required "## Structured Result" section/i);
  assert.equal(qcAction, undefined);
  assert.equal(submitAction, undefined);
}

function testQcBeforeTesterCannotQueueSubmit() {
  const dir = makeTempDir("codex-starter-qc-before-tester-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [["- QC policy: `disabled`", "- QC policy: `enabled`"]]);

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [{ command: "npm test -- demo", result: "PASS" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "qc",
      message: [
        "## QC Report",
        "Overall Verdict: PASS",
        "Phase: coder",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "qc",
            status: "complete",
            phase: "coder",
            verdict: "PASS",
            categories: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");

  assert.equal(submitAction, undefined);
  assert.ok(blocked);
  assert.match(blocked.note, /cannot replace tester/i);
}

function testQcPassQueuesSubmitAfterTesterAudit() {
  const dir = makeTempDir("codex-starter-submit-after-qc-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [["- QC policy: `disabled`", "- QC policy: `enabled`"]]);

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [
              {
                command: "npm test -- demo",
                result: "PASS"
              }
            ],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const qcAfterCoderWorkflow = readTaskContextFile(dir).task.workflow;
  assert.equal(typeof qcAfterCoderWorkflow.workflow_chain_id, "string");
  assert.notEqual(qcAfterCoderWorkflow.workflow_chain_id, "");
  const qcAfterCoderChainId = qcAfterCoderWorkflow.workflow_chain_id;

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "tester",
      message: [
        "## Task Validation Handoff",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "tester",
            status: "complete",
            needs_qc: true,
            workflow_chain_id: qcAfterCoderChainId,
            validation_targets: ["retry behavior"],
            coverage_rationale: "critical path covered",
            remaining_gaps: [],
            files_changed: [],
            validation: [{ command: "npm test -- demo", result: "PASS", purpose: "task validation" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "qc",
      message: [
        "## QC Report",
        "Overall Verdict: PASS",
        "Phase: coder",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "qc",
            status: "complete",
            phase: "tester",
            verdict: "PASS",
            categories: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");

  assert.ok(submitAction);
  assert.equal(submitAction.trigger, "qc_pass_after_tester");
}

function testLegacyDeliveryPolicyBlocksTesterSubmitTrigger() {
  const dir = makeTempDir("codex-starter-legacy-policy-tester-submit-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  writeJson(path.join(dir, ".codex", "delivery-policy.json"), {
    version: 1,
    status: "legacy-policy",
    submit: {
      enabled: true,
      queue_after: {
        coder_complete_without_qc: false
      }
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "tester",
      message: [
        "## Task Validation Handoff",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "tester",
            status: "complete",
            needs_qc: true,
            workflow_chain_id: "chain-legacy-policy-tester",
            validation_targets: ["legacy policy compatibility"],
            coverage_rationale: "smoke",
            remaining_gaps: [],
            files_changed: [],
            validation: [{ command: "npm test -- demo", result: "PASS", purpose: "smoke" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");

  assert.equal(submitAction, undefined);
}

function testLegacyDeliveryPolicyBlocksSubmitAfterQcPass() {
  const dir = makeTempDir("codex-starter-legacy-policy-qc-submit-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [["- QC policy: `disabled`", "- QC policy: `enabled`"]]);

  writeJson(path.join(dir, ".codex", "delivery-policy.json"), {
    version: 1,
    status: "legacy-policy",
    submit: {
      enabled: true,
      queue_after: {
        qc_pass_after_coder: false
      }
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [{ command: "npm test -- demo", result: "PASS" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const legacyAfterCoderWorkflow = readTaskContextFile(dir).task.workflow;
  assert.equal(typeof legacyAfterCoderWorkflow.workflow_chain_id, "string");
  assert.notEqual(legacyAfterCoderWorkflow.workflow_chain_id, "");
  const legacyAfterCoderChainId = legacyAfterCoderWorkflow.workflow_chain_id;

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "tester",
      message: [
        "## Task Validation Handoff",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "tester",
            status: "complete",
            needs_qc: true,
            workflow_chain_id: legacyAfterCoderChainId,
            validation_targets: ["retry behavior"],
            coverage_rationale: "critical path covered",
            remaining_gaps: [],
            files_changed: [],
            validation: [{ command: "npm test -- demo", result: "PASS", purpose: "task validation" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "qc",
      message: [
        "## QC Report",
        "Overall Verdict: PASS",
        "Phase: tester",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "qc",
            status: "complete",
            phase: "tester",
            verdict: "PASS",
            categories: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");

  assert.equal(submitAction, undefined);
}

function testNewDeliveryPolicyKeyOverridesLegacyFallback() {
  const dir = makeTempDir("codex-starter-new-policy-precedence-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  writeJson(path.join(dir, ".codex", "delivery-policy.json"), {
    version: 1,
    status: "compat-precedence",
    submit: {
      enabled: true,
      queue_after: {
        coder_complete_without_qc: false,
        tester_complete_without_qc: true
      }
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "tester",
      message: [
        "## Task Validation Handoff",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "tester",
            status: "complete",
            needs_qc: true,
            workflow_chain_id: "chain-new-policy-key",
            validation_targets: ["new key precedence"],
            coverage_rationale: "smoke",
            remaining_gaps: [],
            files_changed: [],
            validation: [{ command: "npm test -- demo", result: "PASS", purpose: "smoke" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");

  assert.ok(submitAction);
  assert.equal(submitAction.trigger, "tester_complete_without_qc");
}

function testSessionContextShowsPendingSubmitReminder() {
  const dir = makeTempDir("codex-starter-submit-reminder-");

  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: true
    },
    task: {
      current_task: "Deliver the current change",
      status: "active",
      class: "bugfix",
      risk: "medium",
      delivery_mode: "lightweight",
      route_rationale: "delivery is pending",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["lightweight execution", "/submit"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "run-submit:current-task",
        type: "run_submit",
        storyPath: null,
        trigger: "tester_complete_without_qc",
        note: "Run /submit."
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  const stdout = runNode(sessionContextScript, { cwd: dir }, { CODEX_PROJECT_DIR: dir });
  assert.match(stdout, /Pending submit: run \/submit/);
}

function testSessionContextShowsPendingTesterReminder() {
  const dir = makeTempDir("codex-starter-tester-reminder-");

  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: true
    },
    task: {
      current_task: "Validate coder handoff",
      status: "active",
      class: "bugfix",
      risk: "medium",
      delivery_mode: "lightweight",
      route_rationale: "tester handoff is pending",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["lightweight execution"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "run-tester:current-task",
        type: "run_tester",
        phase: "tester",
        storyPath: null,
        trigger: "coder_complete_requires_tester",
        note: "Coder completed. Route to tester for required validation handoff."
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  const stdout = runNode(sessionContextScript, { cwd: dir }, { CODEX_PROJECT_DIR: dir });
  const state = readRuntimeState(dir);

  assert.match(stdout, /Pending tester handoff/);
  assert.match(state.sessionContext.lastReminderText, /Pending tester handoff/);
}

function testSessionContextKeepsRetrospectiveReminderForDoneTask() {
  const dir = makeTempDir("codex-starter-retro-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [
    ["- Task status: `idle`", "- Task status: `done`"],
    ["- Selected delivery mode: `lightweight`", "- Selected delivery mode: `long-running`"]
  ]);
  fs.writeFileSync(
    path.join(dir, "PROGRESS.md"),
    [
      "# Project Progress",
      "",
      "## Current Work",
      "",
      "### Demo",
      "**Story**: `plans/demo.md`",
      "",
      "---",
      "## Completed"
    ].join("\n"),
    "utf8"
  );
  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "session-retrospective:plans/demo.md",
        type: "session_retrospective",
        storyPath: "plans/demo.md",
        trigger: "session_close",
        note: "capture decisions"
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  const stdout = runNode(sessionContextScript, { cwd: dir }, { CODEX_PROJECT_DIR: dir });
  const state = readRuntimeState(dir);

  assert.match(stdout, /Retrospective pending/);
  assert.match(state.sessionContext.lastReminderText, /Retrospective pending/);
}

function testSessionContextWritesFullInvocationLogs() {
  const dir = makeTempDir("codex-starter-session-log-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [
    ["- Task status: `idle`", "- Task status: `active`"]
  ]);
  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "run-submit:current-task",
        type: "run_submit",
        storyPath: null,
        trigger: "tester_complete_without_qc",
        note: "Run /submit."
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  runNode(sessionContextScript, { cwd: dir }, { CODEX_PROJECT_DIR: dir });

  const logFiles = listRuntimeLogFiles(dir);
  const logs = readRuntimeLogEntries(dir);
  const start = logs.find((entry) => entry.script === "session-context.mjs" && entry.type === "invocation_start");
  const write = logs.find((entry) => entry.script === "session-context.mjs" && entry.type === "file_write");
  const finish = logs.find((entry) => entry.script === "session-context.mjs" && entry.type === "invocation_finish");

  assert.equal(logFiles.length, 1);
  assert.match(logFiles[0], /^\d{4}-\d{2}-\d{2}\.jsonl$/);
  assert.ok(start);
  assert.equal(start.input.cwd, dir);
  assert.match(start.rawInput, /"cwd"/);
  assert.ok(write);
  assert.equal(write.target, ".codex/state/runtime-state.json");
  assert.match(JSON.stringify(write.content), /run_submit/);
  assert.ok(finish);
  assert.equal(finish.status, "ok");
  assert.match(finish.output.stdout, /Pending submit: run \/submit/);
  assert.equal(finish.output.stderr, "");
}

function testStartupContextRunsStartupChainAndWritesInvocationLogs() {
  const dir = makeTempDir("codex-starter-startup-chain-");

  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: false
    },
    task: {
      current_task: "",
      status: "idle",
      class: "unknown",
      risk: "unknown",
      delivery_mode: "lightweight",
      route_rationale: "",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["startup scan or cached repo context", "lightweight execution"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "not-set",
      open_questions: []
    }
  });

  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "run-submit:current-task",
        type: "run_submit",
        storyPath: null,
        trigger: "tester_complete_without_qc",
        note: "Run /submit."
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  const stdout = runNode(startupContextScript, { cwd: dir }, { CODEX_PROJECT_DIR: dir });
  const logs = readRuntimeLogEntries(dir);
  const state = readRuntimeState(dir);

  assert.match(stdout, /Task overview:/);
  assert.match(stdout, /Aide evolution sweep:/);
  assert.match(stdout, /Pending submit: run \/submit/);
  assert.match(state.sessionContext.lastReminderText, /Pending submit: run \/submit/);

  const invokedScripts = new Set(
    logs.filter((entry) => entry.type === "invocation_start").map((entry) => entry.script)
  );
  assert.ok(invokedScripts.has("startup-context.mjs"));
  assert.ok(invokedScripts.has("task-overview.mjs"));
  assert.ok(invokedScripts.has("aide-evolution.mjs"));
  assert.ok(invokedScripts.has("session-context.mjs"));

  const finish = logs.find((entry) => entry.script === "startup-context.mjs" && entry.type === "invocation_finish");
  assert.ok(finish);
  assert.equal(finish.status, "ok");
}

function testCodexHookLoggerCapturesSessionStartAndStopEvents() {
  const dir = makeTempDir("codex-starter-hook-log-");
  fs.mkdirSync(path.join(dir, ".codex"), { recursive: true });

  const startupStdout = runNode(hookLogScript, {
    cwd: dir,
    hook_event_name: "SessionStart",
    source: "startup",
    session_id: "session-1",
    transcript_path: path.join(dir, "transcript.jsonl")
  });
  const stopStdout = runNode(hookLogScript, {
    cwd: dir,
    hook_event_name: "Stop",
    session_id: "session-1",
    turn_id: "turn-1",
    last_assistant_message: "done"
  });
  const logs = readCodexHookLogEntries(dir);
  const start = logs.find((entry) => entry.hookEventName === "SessionStart");
  const stop = logs.find((entry) => entry.hookEventName === "Stop");

  assert.equal(startupStdout, "");
  assert.deepEqual(JSON.parse(stopStdout), { continue: true });
  assert.ok(start);
  assert.equal(start.payload.source, "startup");
  assert.equal(start.sessionId, "session-1");
  assert.equal(start.projectDir, dir);
  assert.ok(stop);
  assert.equal(stop.payload.last_assistant_message, "done");
  assert.equal(stop.turnId, "turn-1");
}

function testRuntimeLogWriteMigratesLegacyTopLevelFile() {
  const dir = makeTempDir("codex-starter-legacy-runtime-log-");
  fs.mkdirSync(path.join(dir, ".codex", "logs"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, ".codex", "logs", "runtime-hooks.jsonl"),
    [
      JSON.stringify({
        timestamp: "2026-03-28T09:47:51.615Z",
        invocationId: "legacy-invocation-1",
        script: "validate-git.mjs",
        pid: 1,
        type: "invocation_start",
        cwd: dir,
        projectDir: dir,
        nodeVersion: process.version,
        rawInput: "{\"command\":\"git add .\"}\n",
        input: { command: "git add ." },
        metadata: {}
      }),
      JSON.stringify({
        timestamp: "2026-03-28T09:47:51.617Z",
        invocationId: "legacy-invocation-1",
        script: "validate-git.mjs",
        pid: 1,
        type: "invocation_finish",
        status: "blocked",
        durationMs: 2,
        output: {
          stdout: "{\"ok\":false}\n",
          stderr: ""
        },
        error: null,
        metadata: {
          blocked: true,
          command: "git add ."
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const result = runNodeResult(validateGitScript, { command: "git add .", cwd: dir }, { CODEX_PROJECT_DIR: dir });
  const logFiles = listRuntimeLogFiles(dir);
  const logs = readRuntimeLogEntries(dir);

  assert.equal(result.status, 2);
  assert.ok(!fs.existsSync(path.join(dir, ".codex", "logs", "runtime-hooks.jsonl")));
  assert.ok(logFiles.includes("2026-03-28.jsonl"));
  assert.ok(logs.find((entry) => entry.invocationId === "legacy-invocation-1" && entry.type === "invocation_start"));
  assert.ok(
    logs.find(
      (entry) =>
        entry.script === "validate-git.mjs" &&
        entry.type === "invocation_finish" &&
        entry.metadata?.command === "git add ."
    )
  );
}

function testRuntimeLogSplitsLargeDailyLogsIntoChunks() {
  const dir = makeTempDir("codex-starter-runtime-log-chunks-");
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });

  const env = {
    CODEX_PROJECT_DIR: dir,
    CODEX_RUNTIME_LOG_MAX_BYTES: "256"
  };

  const first = runNodeResult(validateGitScript, { command: "git add .", cwd: dir }, env);
  const second = runNodeResult(validateGitScript, { command: "git add .", cwd: dir }, env);
  const logFiles = listRuntimeLogFiles(dir);
  const logs = readRuntimeLogEntries(dir);

  assert.equal(first.status, 2);
  assert.equal(second.status, 2);
  assert.ok(logFiles.length >= 2);
  assert.ok(logFiles.includes(`${new Date().toISOString().slice(0, 10)}.jsonl`));
  assert.ok(logFiles.some((name) => /^\d{4}-\d{2}-\d{2}\.part-\d{3}\.jsonl$/.test(name)));
  assert.equal(logs.filter((entry) => entry.script === "validate-git.mjs" && entry.type === "invocation_start").length, 2);
  assert.equal(logs.filter((entry) => entry.script === "validate-git.mjs" && entry.type === "invocation_finish").length, 2);
}

function testValidateGitRejectsBroadAdd() {
  const result = runNodeResult(validateGitScript, { command: "git add ." });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /broad_git_add_denied/);
}

function testValidateGitWritesBlockedInvocationLog() {
  const dir = makeTempDir("codex-starter-validate-log-");
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });

  const result = runNodeResult(validateGitScript, { command: "git add .", cwd: dir }, { CODEX_PROJECT_DIR: dir });
  const logs = readRuntimeLogEntries(dir);
  const start = logs.find((entry) => entry.script === "validate-git.mjs" && entry.type === "invocation_start");
  const finish = logs.find((entry) => entry.script === "validate-git.mjs" && entry.type === "invocation_finish");

  assert.equal(result.status, 2);
  assert.ok(start);
  assert.equal(start.input.command, "git add .");
  assert.ok(finish);
  assert.equal(finish.status, "blocked");
  assert.match(finish.output.stdout, /broad_git_add_denied/);
}

function testValidateGitResolvesProjectDirFromWorkdirAlias() {
  const dir = makeTempDir("codex-starter-validate-workdir-");
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });

  const result = runNodeResult(validateGitScript, { command: "git add .", workdir: dir });
  const logs = readRuntimeLogEntries(dir);
  const start = logs.find((entry) => entry.script === "validate-git.mjs" && entry.type === "invocation_start");

  assert.equal(result.status, 2);
  assert.ok(start);
  assert.equal(start.projectDir, dir);
  assert.equal(start.metadata?.projectDirSource, "input.workdir");
}

function testInstallScriptCopiesStarterFilesAndUpdatesGitignore() {
  const dir = makeTempDir("codex-starter-install-");
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n", "utf8");
  fs.mkdirSync(path.join(dir, ".agents", "skills", "aide"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".codex", "hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".product", "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "stale agents\n", "utf8");
  fs.writeFileSync(path.join(dir, ".agents", "skills", "aide", "SKILL.md"), "stale skill\n", "utf8");
  fs.writeFileSync(path.join(dir, ".codex", "config.toml"), "[features]\ncodex_hooks = false\n", "utf8");
  fs.writeFileSync(path.join(dir, ".codex", "hooks.json"), "{\"stale\":true}\n", "utf8");
  fs.writeFileSync(path.join(dir, ".codex", "hooks", "stale.mjs"), "stale\n", "utf8");
  fs.writeFileSync(path.join(dir, ".codex", "state", "stale.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(dir, ".product", "templates", "stale.md"), "stale template\n", "utf8");

  const result = spawnSync("bash", [installScriptPath], {
    cwd: dir,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Installed codex-starter files into/);
  assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
  assert.ok(fs.existsSync(path.join(dir, ".agents", "skills", "aide", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(dir, ".codex", "routing-policy.md")));
  assert.ok(fs.existsSync(path.join(dir, ".codex", "config.toml")));
  assert.match(fs.readFileSync(path.join(dir, ".codex", "config.toml"), "utf8"), /\[features\]\s+codex_hooks = true/);
  assert.ok(fs.existsSync(path.join(dir, ".codex", "hooks.json")));
  assert.ok(fs.existsSync(path.join(dir, ".codex", "hooks", "log-event.mjs")));
  assert.ok(fs.existsSync(path.join(dir, ".product", "registry.json")));
  assert.ok(fs.existsSync(path.join(dir, ".codex", "state", "stale.json")));
  assert.ok(fs.existsSync(path.join(dir, ".codex", "state", "task-context.json")));
  assert.ok(fs.existsSync(path.join(dir, ".codex", "state", "repo-context.json")));
  assert.ok(fs.existsSync(path.join(dir, ".codex", "state", "task-registry.json")));
  assert.ok(!fs.existsSync(path.join(dir, ".product", "templates", "stale.md")));
  assert.match(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), /Project-level Codex workflow starter/);
  assert.match(fs.readFileSync(path.join(dir, ".agents", "skills", "aide", "SKILL.md"), "utf8"), /name: aide/);

  const gitignore = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
  assert.match(gitignore, /node_modules\//);
  assert.match(gitignore, /# codex-starter/);
  assert.match(gitignore, /^AGENTS\.md$/m);
  assert.match(gitignore, /^\.agents\/$/m);
  assert.match(gitignore, /^\.codex\/$/m);
  assert.match(gitignore, /^\.product\/$/m);
}

function testInstallScriptSkipsSourceRuntimeArtifactsAndPreservesTargetRuntimeFiles() {
  const sandboxDir = makeTempDir("codex-starter-install-runtime-");
  const sourceDir = path.join(sandboxDir, "source");
  const targetDir = path.join(sandboxDir, "target");
  const freshTargetDir = path.join(sandboxDir, "fresh-target");

  fs.cpSync(rootDir, sourceDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(freshTargetDir, { recursive: true });

  fs.mkdirSync(path.join(sourceDir, ".codex", "logs", "runtime-hooks"), { recursive: true });
  fs.mkdirSync(path.join(sourceDir, ".codex", "logs", "codex-hooks"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, ".codex", "logs", "runtime-hooks.jsonl"), '{"legacy":"source"}\n', "utf8");
  fs.writeFileSync(
    path.join(sourceDir, ".codex", "logs", "runtime-hooks", "source-log.jsonl"),
    '{"daily":"source"}\n',
    "utf8"
  );
  fs.writeFileSync(path.join(sourceDir, ".codex", "logs", "codex-hooks", "source-hook-log.jsonl"), '{"hook":"source"}\n', "utf8");
  writeJson(path.join(sourceDir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: "2026-03-28T00:00:00Z",
    recentSubagentEvents: [],
    pendingActions: [],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: "source runtime state"
    }
  });
  writeJson(path.join(sourceDir, ".codex", "state", "evolution-registry.json"), {
    version: 1,
    updatedAt: "2026-03-28T00:00:00Z",
    lastSweep: {
      checkedAt: "2026-03-28T00:00:00Z",
      trigger: "startup",
      background: false,
      candidateCount: 0,
      settledTaskCount: 0,
      note: "source evolution state"
    },
    candidates: [],
    settledTaskReviews: []
  });
  writeJson(path.join(sourceDir, ".codex", "state", "task-context.json"), {
    version: 1,
    collaboration: {
      preferred_address: "Source Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: false
    },
    task: {
      current_task: "source task",
      status: "active"
    }
  });
  writeJson(path.join(sourceDir, ".codex", "state", "repo-context.json"), {
    version: 1,
    scan_status: "done",
    project_type: "Source Project",
    primary_languages: ["js"],
    frameworks: [],
    ci_or_deployment_signals: [],
    validation_signals: [],
    notes: []
  });
  writeJson(path.join(sourceDir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-28T00:00:00Z",
    currentTaskId: "source-task",
    tasks: [
      {
        id: "source-task",
        title: "source task",
        status: "active"
      }
    ]
  });
  writeJson(path.join(sourceDir, ".codex", "state", "source-only.json"), {
    from: "source"
  });

  fs.mkdirSync(path.join(targetDir, ".codex", "logs", "runtime-hooks"), { recursive: true });
  fs.mkdirSync(path.join(targetDir, ".codex", "logs", "codex-hooks"), { recursive: true });
  fs.writeFileSync(path.join(targetDir, ".codex", "logs", "runtime-hooks.jsonl"), '{"legacy":"target"}\n', "utf8");
  fs.writeFileSync(
    path.join(targetDir, ".codex", "logs", "runtime-hooks", "target-log.jsonl"),
    '{"daily":"target"}\n',
    "utf8"
  );
  fs.writeFileSync(path.join(targetDir, ".codex", "logs", "codex-hooks", "target-hook-log.jsonl"), '{"hook":"target"}\n', "utf8");
  writeJson(path.join(targetDir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: "2026-03-28T01:00:00Z",
    recentSubagentEvents: [],
    pendingActions: [],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: "target runtime state"
    }
  });
  writeJson(path.join(targetDir, ".codex", "state", "evolution-registry.json"), {
    version: 1,
    updatedAt: "2026-03-28T01:00:00Z",
    lastSweep: {
      checkedAt: "2026-03-28T01:00:00Z",
      trigger: "startup",
      background: false,
      candidateCount: 0,
      settledTaskCount: 0,
      note: "target evolution state"
    },
    candidates: [],
    settledTaskReviews: []
  });
  writeJson(path.join(targetDir, ".codex", "state", "task-context.json"), {
    version: 1,
    collaboration: {
      preferred_address: "Target Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: true
    },
    task: {
      current_task: "target task",
      status: "active"
    }
  });
  writeJson(path.join(targetDir, ".codex", "state", "repo-context.json"), {
    version: 1,
    scan_status: "done",
    project_type: "Target Project",
    primary_languages: ["ts"],
    frameworks: ["node"],
    ci_or_deployment_signals: [],
    validation_signals: [],
    notes: ["target repo"]
  });
  writeJson(path.join(targetDir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-28T01:00:00Z",
    currentTaskId: "target-task",
    tasks: [
      {
        id: "target-task",
        title: "target task",
        status: "active"
      }
    ]
  });
  writeJson(path.join(targetDir, ".codex", "state", "target-only.json"), {
    from: "target"
  });

  const result = spawnSync("bash", [path.join(sourceDir, "install.sh")], {
    cwd: targetDir,
    encoding: "utf8"
  });
  const freshResult = spawnSync("bash", [path.join(sourceDir, "install.sh")], {
    cwd: freshTargetDir,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.equal(freshResult.status, 0);
  assert.ok(!fs.existsSync(path.join(targetDir, ".codex", "logs", "runtime-hooks.jsonl")));
  assert.ok(!fs.existsSync(path.join(targetDir, ".codex", "logs", "runtime-hooks", "source-log.jsonl")));
  assert.ok(!fs.existsSync(path.join(targetDir, ".codex", "logs", "codex-hooks", "source-hook-log.jsonl")));
  assert.ok(fs.existsSync(path.join(targetDir, ".codex", "logs", "runtime-hooks", "target-log.jsonl")));
  assert.ok(fs.existsSync(path.join(targetDir, ".codex", "logs", "codex-hooks", "target-hook-log.jsonl")));
  assert.equal(readRuntimeState(targetDir).sessionContext.lastReminderText, "target runtime state");
  assert.equal(readEvolutionRegistry(targetDir).lastSweep.note, "target evolution state");
  assert.equal(readTaskContextFile(targetDir).collaboration.preferred_address, "Target Boss");
  assert.equal(readRepoContextFile(targetDir).project_type, "Target Project");
  assert.equal(readTaskRegistry(targetDir).currentTaskId, "target-task");
  assert.match(fs.readFileSync(path.join(targetDir, ".codex", "config.toml"), "utf8"), /\[features\]\s+codex_hooks = true/);
  assert.ok(fs.existsSync(path.join(targetDir, ".codex", "hooks.json")));
  assert.ok(fs.existsSync(path.join(targetDir, ".codex", "hooks", "log-event.mjs")));
  assert.ok(fs.existsSync(path.join(targetDir, ".codex", "state", "target-only.json")));
  assert.ok(!fs.existsSync(path.join(targetDir, ".codex", "state", "source-only.json")));
  assert.match(fs.readFileSync(path.join(freshTargetDir, ".codex", "config.toml"), "utf8"), /\[features\]\s+codex_hooks = true/);
  assert.ok(fs.existsSync(path.join(freshTargetDir, ".codex", "hooks.json")));
  assert.ok(fs.existsSync(path.join(freshTargetDir, ".codex", "hooks", "log-event.mjs")));
  assert.ok(fs.existsSync(path.join(freshTargetDir, ".codex", "state", "task-context.json")));
  assert.ok(fs.existsSync(path.join(freshTargetDir, ".codex", "state", "repo-context.json")));
  assert.ok(fs.existsSync(path.join(freshTargetDir, ".codex", "state", "task-registry.json")));
  assert.equal(readTaskContextFile(freshTargetDir).collaboration.preferred_address, "Boss");
  assert.equal(readRepoContextFile(freshTargetDir).scan_status, "not-scanned");
  assert.equal(readTaskRegistry(freshTargetDir).currentTaskId, null);
  assert.ok(!fs.existsSync(path.join(freshTargetDir, ".codex", "state", "runtime-state.json")));
  assert.ok(!fs.existsSync(path.join(freshTargetDir, ".codex", "state", "evolution-registry.json")));
  assert.ok(!fs.existsSync(path.join(freshTargetDir, ".codex", "state", "source-only.json")));
}

function testQcReviewerAliasRecordsStructuredFail() {
  const dir = makeTempDir("codex-starter-qc-review-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [
    ["- QC policy: `disabled`", "- QC policy: `enabled`"]
  ]);

  runNode(
    runtimeStateScript,
    {
      event: "subagent_stop",
      cwd: dir,
      agent_type: "qc_reviewer",
      last_assistant_message: [
        "## QC Report",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "qc_reviewer",
            verdict: "FAIL",
            phase: "coder",
            categories: ["missing-test"]
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const latest = state.recentSubagentEvents[state.recentSubagentEvents.length - 1];

  assert.equal(latest.agentType, "qc");
  assert.equal(state.qualityMetrics.qcRuns, 1);
  assert.equal(state.qualityMetrics.qcFails, 1);
  assert.equal(state.qualityMetrics.qcByPhase.coder.fails, 1);
  assert.equal(state.qualityMetrics.failureCategoryCounts["missing-test"], 1);
}

function testLegacyDeliveryModeNamesNormalizeToCurrentNames() {
  const dir = makeTempDir("codex-starter-legacy-modes-");
  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: false
    },
    task: {
      current_task: "Legacy route",
      status: "active",
      class: "feature",
      risk: "medium",
      delivery_mode: "plan-driven",
      route_rationale: "legacy starter state",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["direct implementation"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  const profile = loadProjectProfileState(dir);
  assert.equal(profile.deliveryMode, "standard");
  assert.deepEqual(profile.enabledModules, ["lightweight execution"]);
}

function testTaskOverviewShowsCurrentAndHistoricalUnfinishedTasks() {
  const dir = makeTempDir("codex-starter-task-overview-");

  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: true
    },
    task: {
      current_task: "New routing cleanup",
      status: "active",
      class: "refactor",
      risk: "medium",
      delivery_mode: "standard",
      route_rationale: "current hot task",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["plan", "tester", "coder"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  writeJson(path.join(dir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-24T00:00:00Z",
    currentTaskId: "old-task-1",
    tasks: [
      {
        id: "old-task-1",
        matchKey: "task:old-routing-cleanup",
        title: "Old routing cleanup",
        status: "active",
        createdAt: "2026-03-24T00:00:00Z",
        updatedAt: "2026-03-24T00:00:00Z",
        lastSeenAt: "2026-03-24T00:00:00Z",
        source: "task-context"
      }
    ]
  });

  const stdout = runNode(taskOverviewScript, { cwd: dir }, { CODEX_PROJECT_DIR: dir });
  assert.match(stdout, /Current task: New routing cleanup \[active\]/);
  assert.match(stdout, /Historical unfinished tasks: 1/);
  assert.match(stdout, /Unfinished: Old routing cleanup \[parked\]/);
  assert.doesNotMatch(stdout, /Completed tasks:/);
}

function testTaskOverviewKeepsClearedHotTaskAsHistoricalUnfinished() {
  const dir = makeTempDir("codex-starter-task-reconcile-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  writeJson(path.join(dir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-24T00:00:00Z",
    currentTaskId: "dangling-task-1",
    tasks: [
      {
        id: "dangling-task-1",
        matchKey: "task:manual-cleanup",
        title: "Manual cleanup",
        status: "active",
        createdAt: "2026-03-24T00:00:00Z",
        updatedAt: "2026-03-24T00:00:00Z",
        lastSeenAt: "2026-03-24T00:00:00Z",
        source: "task-context"
      }
    ]
  });

  const stdout = runNode(taskOverviewScript, { cwd: dir }, { CODEX_PROJECT_DIR: dir });
  assert.match(stdout, /Current task: none/);
  assert.match(stdout, /Historical unfinished tasks: 1/);
  assert.match(stdout, /Unfinished: Manual cleanup \[parked\]/);
}

function testTaskOverviewCanQueryCompletedTasksOnDemand() {
  const dir = makeTempDir("codex-starter-task-history-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  writeJson(path.join(dir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-24T00:00:00Z",
    currentTaskId: null,
    tasks: [
      {
        id: "completed-task-1",
        matchKey: "task:release-cleanup",
        title: "Release cleanup",
        status: "done",
        createdAt: "2026-03-24T00:00:00Z",
        updatedAt: "2026-03-25T00:00:00Z",
        completedAt: "2026-03-25T00:00:00Z",
        summary: "Closed the rollout tasks.",
        source: "runtime-state"
      }
    ]
  });

  const stdout = runNode(taskOverviewScript, { cwd: dir, status: "done" }, { CODEX_PROJECT_DIR: dir });

  assert.match(stdout, /Task history:/);
  assert.match(stdout, /Completed tasks: 1/);
  assert.match(stdout, /Completed: Release cleanup \[done\]/);
}

function testTaskOverviewDoesNotWriteTaskRegistryForReadOnlyQuery() {
  const dir = makeTempDir("codex-starter-task-overview-read-only-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));
  writeJson(path.join(dir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: null,
    currentTaskId: null,
    tasks: []
  });

  const registryPath = path.join(dir, ".codex", "state", "task-registry.json");
  const before = fs.readFileSync(registryPath, "utf8");
  const stdout = runNode(taskOverviewScript, {}, { CODEX_PROJECT_DIR: dir });
  const after = fs.readFileSync(registryPath, "utf8");

  assert.match(stdout, /Task overview:/);
  assert.equal(after, before);
}

function testRuntimeStateSyncsCompletedTasksIntoTaskRegistry() {
  const dir = makeTempDir("codex-starter-task-registry-sync-");

  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: true
    },
    task: {
      current_task: "Finish API cleanup",
      status: "active",
      class: "bugfix",
      risk: "medium",
      delivery_mode: "lightweight",
      route_rationale: "close the current hot task",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["lightweight execution"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "session_end",
      cwd: dir,
      message: "Task status: done"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const registry = readTaskRegistry(dir);
  const task = registry.tasks.find((entry) => entry.title === "Finish API cleanup");

  assert.equal(task.status, "active");
  assert.equal(registry.currentTaskId, task.id);
}

function testTaskSettledEventSyncsCompletedTasksIntoTaskRegistry() {
  const dir = makeTempDir("codex-starter-task-settled-sync-");

  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "Boss",
      greeting_style: "warm",
      first_startup_greeting_completed: true
    },
    task: {
      current_task: "Finish task without session-end hook",
      status: "active",
      class: "bugfix",
      risk: "medium",
      delivery_mode: "lightweight",
      route_rationale: "task-settled should be enough",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["lightweight execution"],
      qc_policy: "disabled",
      submit_policy: "enabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "task_settled",
      cwd: dir,
      message: "Task status: done"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const registry = readTaskRegistry(dir);
  const task = registry.tasks.find((entry) => entry.title === "Finish task without session-end hook");

  assert.equal(task.status, "active");
  assert.equal(registry.currentTaskId, task.id);
}

function testTaskSettledDoesNotBypassRequiredTesterHandoff() {
  const dir = makeTempDir("codex-starter-task-settled-missing-tester-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "coder",
      message: [
        "## Implementation Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "coder",
            status: "complete",
            needs_qc: true,
            files_changed: ["src/demo.ts"],
            validation: [{ command: "npm test -- demo", result: "PASS" }],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  runNode(
    runtimeStateScript,
    {
      event: "task_settled",
      cwd: dir,
      message: "Task status: done"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");

  assert.ok(testerAction);
  assert.ok(blocked);
  assert.match(blocked.note, /cannot replace tester/i);
  assert.equal(submitAction, undefined);
}

function testTaskSettledWithStoryScopedTesterHandoffDoesNotQueueSubmit() {
  const dir = makeTempDir("codex-starter-task-settled-story-scoped-tester-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "run-tester:plans/a.md",
        type: "run_tester",
        phase: "tester",
        storyPath: "plans/a.md",
        trigger: "coder_complete_requires_tester",
        note: "Coder completed. Route to tester for required validation handoff."
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "task_settled",
      cwd: dir,
      message: "Task status: done"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");

  assert.equal(submitAction, undefined);
  assert.ok(blocked);
  assert.match(blocked.note, /cannot replace tester/i);
}

function testSessionEndWithStoryScopedTesterHandoffDoesNotQueueSubmit() {
  const dir = makeTempDir("codex-starter-session-end-story-scoped-tester-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "run-tester:plans/a.md",
        type: "run_tester",
        phase: "tester",
        storyPath: "plans/a.md",
        trigger: "coder_complete_requires_tester",
        note: "Coder completed. Route to tester for required validation handoff."
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "session_end",
      cwd: dir,
      message: "Task status: done"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");

  assert.equal(submitAction, undefined);
  assert.ok(blocked);
  assert.match(blocked.note, /cannot replace tester/i);
}

function testTaskSettledWorkflowGuardBlocksCloseoutWithoutPendingTesterAction() {
  const dir = makeTempDir("codex-starter-task-settled-workflow-guard-");

  saveTaskContext(dir, {
    task: {
      current_task: "Guarded task settlement",
      status: "active",
      workflow: {
        current_chain: "coder",
        expected_next_step: "tester_handoff",
        required_handoff: "tester",
        settlement_guard: "require_required_handoff",
        settlement_guard_reason: "Tester handoff is mandatory."
      }
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "task_settled",
      cwd: dir,
      message: "Task status: done"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");
  const workflow = readTaskContextFile(dir).task.workflow;

  assert.equal(submitAction, undefined);
  assert.equal(testerAction, undefined);
  assert.ok(blocked);
  assert.match(blocked.note, /cannot replace tester/i);
  assert.equal(workflow.required_handoff, "tester");
  assert.equal(workflow.expected_next_step, "tester_handoff");
}

function testSessionEndWorkflowGuardBlocksCloseoutWithoutPendingTesterAction() {
  const dir = makeTempDir("codex-starter-session-end-workflow-guard-");

  saveTaskContext(dir, {
    task: {
      current_task: "Guarded session closeout",
      status: "active",
      workflow: {
        current_chain: "coder",
        expected_next_step: "tester_handoff",
        required_handoff: "tester",
        settlement_guard: "require_required_handoff",
        settlement_guard_reason: "Tester handoff is mandatory."
      }
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "session_end",
      cwd: dir,
      message: "Task status: done"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");
  const workflow = readTaskContextFile(dir).task.workflow;

  assert.equal(submitAction, undefined);
  assert.equal(testerAction, undefined);
  assert.ok(blocked);
  assert.match(blocked.note, /cannot replace tester/i);
  assert.equal(workflow.required_handoff, "tester");
  assert.equal(workflow.expected_next_step, "tester_handoff");
}

function testSessionEndDoesNotAdvanceSubmitOrSettleWithoutTaskSettledEvent() {
  const dir = makeTempDir("codex-starter-session-end-best-effort-");

  saveTaskContext(dir, {
    task: {
      current_task: "Pause without task_settled",
      status: "active",
      workflow: {
        phase: "tester",
        chain_id: "chain-session-end-best-effort",
        workflow_chain_id: "chain-session-end-best-effort",
        current_chain: "tester",
        expected_next_step: "submit",
        required_handoff: "none",
        required_handoff_story_path: null,
        settlement_guard: "none",
        settlement_guard_reason: "",
        updated_at: "2026-03-29T09:00:00.000Z"
      }
    }
  });

  runNode(
    runtimeStateScript,
    {
      event: "session_end",
      cwd: dir,
      message: "Task status: done"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const workflow = readTaskContextFile(dir).task.workflow;
  const submitAction = state.pendingActions.find((item) => item.type === "run_submit");

  assert.equal(submitAction, undefined);
  assert.equal(workflow.phase, "tester");
  assert.equal(workflow.current_chain, "tester");
  assert.equal(workflow.expected_next_step, "none");
}

function testAideEvolutionSweepReviewsSettledTasksWithoutBlockingSignals() {
  const dir = makeTempDir("codex-starter-evolution-sweep-");

  writeJson(path.join(dir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-25T00:00:00Z",
    currentTaskId: null,
    tasks: [
      {
        id: "demo-task-1",
        matchKey: "task:demo-task",
        title: "Demo settled task",
        status: "done",
        createdAt: "2026-03-25T00:00:00Z",
        updatedAt: "2026-03-25T00:30:00Z",
        completedAt: "2026-03-25T00:30:00Z",
        source: "task-context"
      }
    ]
  });

  runNode(aideEvolutionScript, { cwd: dir, trigger: "startup", background: true }, { CODEX_PROJECT_DIR: dir });

  const evolutionRegistry = readEvolutionRegistry(dir);

  assert.equal(evolutionRegistry.lastSweep.trigger, "startup");
  assert.equal(evolutionRegistry.lastSweep.background, true);
  assert.equal(evolutionRegistry.settledTaskReviews.length, 1);
  assert.equal(evolutionRegistry.settledTaskReviews[0].outcome, "no-candidates");
}

function testAideEvolutionSweepPromotesSettledTasksWithGovernanceSignals() {
  const dir = makeTempDir("codex-starter-evolution-task-signal-");

  writeJson(path.join(dir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-25T00:00:00Z",
    currentTaskId: null,
    tasks: [
      {
        id: "story-demo-1",
        matchKey: "story:plans/demo.md",
        title: "Demo story",
        status: "done",
        storyPath: "plans/demo.md",
        createdAt: "2026-03-25T00:00:00Z",
        updatedAt: "2026-03-25T00:30:00Z",
        completedAt: "2026-03-25T00:30:00Z",
        source: "progress"
      }
    ]
  });

  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "aide-review:demo",
        type: "aide_review",
        severity: "L3",
        capability: "audit",
        storyPath: "plans/demo.md",
        note: "Review repeated missing-test failures before archiving.",
        createdAt: "2026-03-25T00:10:00Z",
        updatedAt: "2026-03-25T00:10:00Z"
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  runNode(aideEvolutionScript, { cwd: dir, trigger: "startup" }, { CODEX_PROJECT_DIR: dir });

  const evolutionRegistry = readEvolutionRegistry(dir);
  const queuedIds = evolutionRegistry.candidates
    .filter((item) => item.status === "queued")
    .map((item) => item.id);

  assert.ok(queuedIds.includes("aide-review:aide-review:demo"));
  assert.ok(queuedIds.includes("task-settled:story-demo-1"));
  assert.equal(evolutionRegistry.settledTaskReviews[0].outcome, "signals-present");
}

function testAideEvolutionAutoAppliesKnownLearningGuidance() {
  const dir = makeTempDir("codex-starter-evolution-auto-apply-");
  fs.mkdirSync(path.join(dir, ".codex", "agents"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });
  fs.copyFileSync(testerAgentPath, path.join(dir, ".codex", "agents", "tester.toml"));
  fs.copyFileSync(evolutionPolicyPath, path.join(dir, ".codex", "evolution-policy.json"));

  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [],
    failurePatterns: {},
    learningQueue: [
      {
        id: "lesson-demo-missing-test",
        source: "plans/demo.md",
        category: "missing-test",
        triggerCount: 2,
        suggestedRoute: [".codex/agents/tester.toml"],
        lesson: "Every requirement needs a real test.",
        status: "queued"
      }
    ],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  runNode(aideEvolutionScript, { cwd: dir, trigger: "startup" }, { CODEX_PROJECT_DIR: dir });

  const evolutionRegistry = readEvolutionRegistry(dir);
  const appliedCandidate = evolutionRegistry.candidates.find((item) => item.id === "learning-queue:lesson-demo-missing-test");
  const testerText = fs.readFileSync(path.join(dir, ".codex", "agents", "tester.toml"), "utf8");

  assert.equal(appliedCandidate.status, "applied");
  assert.match(
    testerText,
    /Do not mark validation complete until every claimed requirement has at least one real test or explicit justified gap\./
  );
}

function testArchitectCompletionQueuesGovernanceRetrospective() {
  const dir = makeTempDir("codex-starter-architect-review-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "architect",
      message: [
        "## Architecture Complete",
        "",
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "architect",
            status: "complete",
            architecture_path: "plans/demo-architecture.md",
            key_decisions: ["Use a service boundary between API and UI."],
            wrong_assumptions: ["The existing UI hook was reusable without a contract change."],
            writeback_candidates: [
              {
                target: ".agents/skills/architect/SKILL.md",
                reason: "Keep the retrospective footer mandatory for every architect session.",
                capability: "writeback",
                severity: "L2"
              }
            ],
            technical_tradeoffs: ["Slightly more setup now for less boundary drift later."],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const retrospective = state.pendingActions.find((item) => item.type === "session_retrospective" && item.role === "architect");
  const aideReview = state.pendingActions.find((item) => item.type === "aide_review" && item.sourceRole === "architect");

  assert.ok(retrospective);
  assert.ok(aideReview);
  assert.equal(aideReview.capability, "writeback");
  assert.equal(aideReview.severity, "L2");
}

function testRepeatedQcFailuresQueueAideAuditReview() {
  const dir = makeTempDir("codex-starter-aide-audit-review-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [
    ["- Selected delivery mode: `lightweight`", "- Selected delivery mode: `long-running`"],
    ["- QC policy: `disabled`", "- QC policy: `enabled`"]
  ]);
  fs.writeFileSync(
    path.join(dir, "PROGRESS.md"),
    [
      "# Project Progress",
      "",
      "## Current Work",
      "",
      "### Demo",
      "**Story**: `plans/demo.md`",
      "",
      "---",
      "## Completed"
    ].join("\n"),
    "utf8"
  );

  const qcMessage = [
    "## QC Report",
    "Overall Verdict: FAIL",
    "",
    "## Structured Result",
    "```json",
    JSON.stringify(
      {
        role: "qc",
        status: "complete",
        phase: "coder",
        verdict: "FAIL",
        categories: ["missing-test"]
      },
      null,
      2
    ),
    "```"
  ].join("\n");

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "qc",
      message: qcMessage,
      story_path: "plans/demo.md"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "qc",
      message: qcMessage,
      story_path: "plans/demo.md"
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const aideReview = state.pendingActions.find((item) => item.type === "aide_review" && item.sourceRole === "qc");

  assert.ok(aideReview);
  assert.equal(aideReview.capability, "audit");
  assert.equal(aideReview.severity, "L3");
}

function testProductAssistantCompletionQueuesAideReviewWhenWritebackExists() {
  const dir = makeTempDir("codex-starter-product-review-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "product_assistant",
      message: [
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "product_assistant",
            status: "complete",
            artifacts_changed: ["docs/api.md"],
            sources_used: [{ kind: "doc", path: "README.md", note: "existing entrypoints" }],
            template_updates_applied: [
              {
                id: "http-api-basic",
                path: ".product/templates/api/http-api-basic.md",
                artifact_type: "api_doc",
                description: "Reusable HTTP API doc skeleton",
                audience: "developer",
                triggers: ["api", "http"],
                updatedAt: null,
                lastUsedAt: null,
                notes: ""
              }
            ],
            memory_updates_applied: {
              user_preferences: [
                {
                  id: "pref-concise-api-docs",
                  preference: "Prefer concise step-by-step API docs.",
                  applies_to: "api_doc",
                  source: "repeated",
                  evidence: ["User repeated the same preference in this task family."],
                  updatedAt: null,
                  supersedes: []
                }
              ],
              repo_preferences: []
            },
            evolution_candidates: [
              {
                id: "memory-gap-api-docs",
                category: "memory_gap",
                summary: "The same API doc preference had to be restated.",
                source: "product_assistant",
                evidence: ["Repeated restatement across similar API doc tasks."],
                occurrences: 2,
                status: "queued",
                updatedAt: null
              }
            ],
            open_gaps: [],
            validation: [],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const aideReview = state.pendingActions.find((item) => item.type === "aide_review" && item.sourceRole === "product_assistant");

  assert.ok(aideReview);
  assert.equal(aideReview.capability, "writeback");
  assert.equal(aideReview.issueType, "product_review");
}

function testProductAssistantBlockedQueuesInvestigationReview() {
  const dir = makeTempDir("codex-starter-product-blocked-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "product_assistant",
      message: [
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "product_assistant",
            status: "blocked",
            artifacts_changed: [],
            sources_used: [],
            template_updates_applied: [],
            memory_updates_applied: {
              user_preferences: [],
              repo_preferences: []
            },
            evolution_candidates: [],
            open_gaps: ["Need the current API error code table."],
            validation: [],
            blockers: ["Missing source material."]
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  const blockedReview = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "product_assistant");
  const aideReview = state.pendingActions.find((item) => item.type === "aide_review" && item.sourceRole === "product_assistant");

  assert.ok(blockedReview);
  assert.ok(aideReview);
  assert.equal(aideReview.capability, "investigation");
  assert.equal(aideReview.severity, "L2");
}

function testProductFilesSupportRealisticWritebackEntries() {
  const dir = makeTempDir("codex-starter-product-writeback-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  fs.mkdirSync(path.join(dir, ".product", "templates", "api"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".product", "templates", "api", "http-api-basic.md"), "# HTTP API Basic\n", "utf8");

  const registry = JSON.parse(fs.readFileSync(productRegistryPath, "utf8"));
  registry.updatedAt = "2026-03-27T00:00:00Z";
  registry.templates.push({
    id: "http-api-basic",
    path: ".product/templates/api/http-api-basic.md",
    artifact_type: "api_doc",
    description: "Reusable HTTP API doc skeleton",
    audience: "developer",
    triggers: ["api", "http"],
    updatedAt: "2026-03-27T00:00:00Z",
    lastUsedAt: "2026-03-27T00:00:00Z",
    notes: "Created from repeated API doc work."
  });
  writeJson(path.join(dir, ".product", "registry.json"), registry);

  const memory = JSON.parse(fs.readFileSync(productMemoryPath, "utf8"));
  memory.updatedAt = "2026-03-27T00:00:00Z";
  memory.user_preferences.push({
    id: "pref-concise-api-docs",
    preference: "Prefer concise step-by-step API docs.",
    applies_to: "api_doc",
    source: "repeated",
    evidence: ["Restated in several API doc tasks."],
    updatedAt: "2026-03-27T00:00:00Z",
    supersedes: []
  });
  writeJson(path.join(dir, ".product", "memory.json"), memory);

  const evolution = JSON.parse(fs.readFileSync(productEvolutionPath, "utf8"));
  evolution.updatedAt = "2026-03-27T00:00:00Z";
  evolution.candidates.push({
    id: "memory-gap-api-docs",
    category: "memory_gap",
    summary: "The same API doc preference had to be restated.",
    source: "product_assistant",
    evidence: ["Repeated restatement across similar API doc tasks."],
    occurrences: 2,
    status: "queued",
    updatedAt: "2026-03-27T00:00:00Z"
  });
  writeJson(path.join(dir, ".product", "evolution.json"), evolution);

  runNode(
    runtimeStateScript,
    {
      event: "subagent_result",
      cwd: dir,
      role: "product_assistant",
      message: [
        "## Structured Result",
        "```json",
        JSON.stringify(
          {
            role: "product_assistant",
            status: "complete",
            artifacts_changed: ["docs/api.md"],
            sources_used: [{ kind: "doc", path: "README.md", note: "existing entrypoints" }],
            template_updates_applied: [
              {
                id: "http-api-basic",
                path: ".product/templates/api/http-api-basic.md",
                artifact_type: "api_doc",
                description: "Reusable HTTP API doc skeleton",
                audience: "developer",
                triggers: ["api", "http"],
                updatedAt: "2026-03-27T00:00:00Z",
                lastUsedAt: "2026-03-27T00:00:00Z",
                notes: "Created from repeated API doc work."
              }
            ],
            memory_updates_applied: {
              user_preferences: [
                {
                  id: "pref-concise-api-docs",
                  preference: "Prefer concise step-by-step API docs.",
                  applies_to: "api_doc",
                  source: "repeated",
                  evidence: ["Restated in several API doc tasks."],
                  updatedAt: "2026-03-27T00:00:00Z",
                  supersedes: []
                }
              ],
              repo_preferences: []
            },
            evolution_candidates: [
              {
                id: "memory-gap-api-docs",
                category: "memory_gap",
                summary: "The same API doc preference had to be restated.",
                source: "product_assistant",
                evidence: ["Repeated restatement across similar API doc tasks."],
                occurrences: 2,
                status: "queued",
                updatedAt: "2026-03-27T00:00:00Z"
              }
            ],
            open_gaps: [],
            validation: [],
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    { CODEX_PROJECT_DIR: dir }
  );

  const savedRegistry = JSON.parse(fs.readFileSync(path.join(dir, ".product", "registry.json"), "utf8"));
  const savedMemory = JSON.parse(fs.readFileSync(path.join(dir, ".product", "memory.json"), "utf8"));
  const savedEvolution = JSON.parse(fs.readFileSync(path.join(dir, ".product", "evolution.json"), "utf8"));
  const state = readRuntimeState(dir);
  const aideReview = state.pendingActions.find((item) => item.type === "aide_review" && item.sourceRole === "product_assistant");

  assert.equal(savedRegistry.templates[0].id, "http-api-basic");
  assert.equal(savedRegistry.templates[0].path, ".product/templates/api/http-api-basic.md");
  assert.equal(savedMemory.user_preferences[0].id, "pref-concise-api-docs");
  assert.equal(savedMemory.user_preferences[0].source, "repeated");
  assert.equal(savedEvolution.candidates[0].id, "memory-gap-api-docs");
  assert.equal(savedEvolution.candidates[0].status, "queued");
  assert.ok(aideReview);
  assert.match(aideReview.note, /template changes: \.product\/templates\/api\/http-api-basic\.md/);
}

function testAideGovernanceInvestigateReportsPendingReviews() {
  const dir = makeTempDir("codex-starter-aide-governance-investigate-");
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });
  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "aide-review:test",
        type: "aide_review",
        severity: "L3",
        capability: "investigation",
        note: "Workflow break detected.",
        createdAt: "2026-03-25T00:00:00Z",
        updatedAt: "2026-03-25T00:00:00Z"
      }
    ],
    failurePatterns: {},
    learningQueue: [],
    completedTasks: [],
    qualityMetrics: {
      qcRuns: 0,
      qcPasses: 0,
      qcFails: 0,
      qcByPhase: {
        tester: { runs: 0, passes: 0, fails: 0 },
        coder: { runs: 0, passes: 0, fails: 0 },
        manual: { runs: 0, passes: 0, fails: 0 }
      },
      failureCategoryCounts: {},
      recentQcRuns: []
    },
    sessionContext: {
      lastReminderText: ""
    }
  });

  const stdout = runNode(aideGovernanceScript, { cwd: dir, mode: "investigate" }, { CODEX_PROJECT_DIR: dir });

  assert.match(stdout, /Pending \/Aide reviews:/);
  assert.match(stdout, /\[L3\] \[investigation\] Workflow break detected\./);
}

function testAideGovernanceAuditDetectsBrokenContracts() {
  const dir = makeTempDir("codex-starter-aide-governance-audit-");
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".agents", "skills", "aide"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".agents", "skills", "architect"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".codex", "agents"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, ".agents", "skills", "aide", "SKILL.md"),
    [
      "---",
      "name: aide",
      "description: governance entry",
      "---",
      "",
      "## Read Order",
      "",
      "1. repo state"
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, ".agents", "skills", "architect", "SKILL.md"),
    [
      "---",
      "name: architect",
      "description: design helper",
      "---",
      "",
      "## Sources of truth",
      "",
      "- code"
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, ".codex", "agents", "coder.toml"),
    [
      'name = "coder"',
      'description = "writer"',
      'sandbox_mode = "workspace-write"',
      'developer_instructions = """',
      "Do the work.",
      '"""'
    ].join("\n"),
    "utf8"
  );

  const stdout = runNode(aideGovernanceScript, { cwd: dir, mode: "audit" }, { CODEX_PROJECT_DIR: dir });

  assert.match(stdout, /Aide governance contract is incomplete/);
  assert.match(stdout, /Architect knowledge-capture contract is incomplete/);
  assert.match(stdout, /Write-capable agent lacks a structured result footer/);
}

function testAideGovernanceDedupFindsSharedAuthorityCandidates() {
  const dir = makeTempDir("codex-starter-aide-governance-dedup-");
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".agents", "skills", "aide"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".agents", "skills", "submit"), { recursive: true });

  const sharedLine = "Only the main agent updates shared state files during governed workflows.";

  fs.writeFileSync(path.join(dir, "AGENTS.md"), `${sharedLine}\n`, "utf8");
  fs.writeFileSync(
    path.join(dir, ".agents", "skills", "aide", "SKILL.md"),
    [
      "---",
      "name: aide",
      "description: governance entry",
      "---",
      "",
      sharedLine
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, ".agents", "skills", "submit", "SKILL.md"),
    [
      "---",
      "name: submit",
      "description: submit entry",
      "---",
      "",
      sharedLine
    ].join("\n"),
    "utf8"
  );

  const stdout = runNode(aideGovernanceScript, { cwd: dir, mode: "dedup" }, { CODEX_PROJECT_DIR: dir });

  assert.match(stdout, /Dedup candidates:/);
  assert.match(stdout, /Only the main agent updates shared state files during governed workflows/);
}

testQcDetectionRequiresQcMarkers();
testValidationProfileDefinesRepoBaselineAndTesterOwnership();
testTesterContractIncludesTaskValidationHandoff();
testProductAssistantContractAndDefaultsExist();
testAideContractHidesInternalWorkflowTermsAndDelegatesExecution();
testProgressSyncSupportsLegacyShape();
testTaskContextJsonOverridesMarkdownProfile();
testTaskContextRemainsHotStateAuthorityForCollaborationFields();
testTaskContextHelpersWriteNormalizedState();
testRepoContextHelpersWriteNormalizedState();
testLegacyDeliveryModeNamesNormalizeToCurrentNames();
testTrimRuntimeStateDropsOldFailurePatterns();
testCoderCompletionQueuesTesterWithoutStory();
testCoderAndTesterCompletionUpdateWorkflowHotState();
testTesterCompletionWithMismatchedWorkflowChainIdKeepsGuard();
testTesterCompletionWithoutWorkflowChainIdKeepsGuard();
testCoderCompletionDoesNotQueueSubmitBeforeTester();
testRuntimeRejectsCoderCompletionWithoutStructuredFooter();
testRuntimeRejectsCoderCompletionWithoutNeedsQcTrue();
testRuntimeRejectsStructuredResultBypassWithPostSectionJson();
testRuntimeRejectsTesterCompletionWithoutStructuredFooter();
testQcBeforeTesterCannotQueueSubmit();
testQcPassQueuesSubmitAfterTesterAudit();
testLegacyDeliveryPolicyBlocksTesterSubmitTrigger();
testLegacyDeliveryPolicyBlocksSubmitAfterQcPass();
testNewDeliveryPolicyKeyOverridesLegacyFallback();
testSessionContextShowsPendingTesterReminder();
testSessionContextShowsPendingSubmitReminder();
testSessionContextKeepsRetrospectiveReminderForDoneTask();
testSessionContextWritesFullInvocationLogs();
testStartupContextRunsStartupChainAndWritesInvocationLogs();
testCodexHookLoggerCapturesSessionStartAndStopEvents();
testRuntimeLogWriteMigratesLegacyTopLevelFile();
testRuntimeLogSplitsLargeDailyLogsIntoChunks();
testValidateGitRejectsBroadAdd();
testValidateGitWritesBlockedInvocationLog();
testValidateGitResolvesProjectDirFromWorkdirAlias();
testInstallScriptCopiesStarterFilesAndUpdatesGitignore();
testInstallScriptSkipsSourceRuntimeArtifactsAndPreservesTargetRuntimeFiles();
testQcReviewerAliasRecordsStructuredFail();
testTaskOverviewShowsCurrentAndHistoricalUnfinishedTasks();
testTaskOverviewKeepsClearedHotTaskAsHistoricalUnfinished();
testTaskOverviewCanQueryCompletedTasksOnDemand();
testTaskOverviewDoesNotWriteTaskRegistryForReadOnlyQuery();
testRuntimeStateSyncsCompletedTasksIntoTaskRegistry();
testTaskSettledEventSyncsCompletedTasksIntoTaskRegistry();
testTaskSettledDoesNotBypassRequiredTesterHandoff();
testTaskSettledWithStoryScopedTesterHandoffDoesNotQueueSubmit();
testSessionEndWithStoryScopedTesterHandoffDoesNotQueueSubmit();
testTaskSettledWorkflowGuardBlocksCloseoutWithoutPendingTesterAction();
testSessionEndWorkflowGuardBlocksCloseoutWithoutPendingTesterAction();
testSessionEndDoesNotAdvanceSubmitOrSettleWithoutTaskSettledEvent();
testAideEvolutionSweepReviewsSettledTasksWithoutBlockingSignals();
testAideEvolutionSweepPromotesSettledTasksWithGovernanceSignals();
testAideEvolutionAutoAppliesKnownLearningGuidance();
testArchitectCompletionQueuesGovernanceRetrospective();
testRepeatedQcFailuresQueueAideAuditReview();
testProductAssistantCompletionQueuesAideReviewWhenWritebackExists();
testProductAssistantBlockedQueuesInvestigationReview();
testProductFilesSupportRealisticWritebackEntries();
testAideGovernanceInvestigateReportsPendingReviews();
testAideGovernanceAuditDetectsBrokenContracts();
testAideGovernanceDedupFindsSharedAuthorityCandidates();

process.stdout.write("runtime helper smoke tests passed\n");
