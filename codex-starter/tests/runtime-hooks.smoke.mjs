import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  detectQcFail,
  loadProjectProfileState,
  parseActiveStories,
  syncProgressFromState
} from "../.codex/scripts/runtime-utils.mjs";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runtimeStateScript = path.join(rootDir, ".codex", "scripts", "runtime-state.mjs");
const sessionContextScript = path.join(rootDir, ".codex", "scripts", "session-context.mjs");
const taskOverviewScript = path.join(rootDir, ".codex", "scripts", "task-overview.mjs");
const aideGovernanceScript = path.join(rootDir, ".codex", "scripts", "aide-governance.mjs");
const validateGitScript = path.join(rootDir, ".codex", "scripts", "validate-git.mjs");
const progressTemplatePath = path.join(rootDir, ".codex", "templates", "progress.md");
const projectProfilePath = path.join(rootDir, ".codex", "project-profile.md");
const validationProfilePath = path.join(rootDir, ".codex", "validation-profile.json");
const testerAgentPath = path.join(rootDir, ".codex", "agents", "tester.toml");
const validationHandoffTemplatePath = path.join(rootDir, ".codex", "templates", "validation-handoff.md");

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
  assert.match(testerAgent, /"validation_targets": \[\]/);
  assert.match(testerAgent, /"coverage_rationale": ""/);
  assert.match(testerAgent, /"remaining_gaps": \[\]/);
  assert.match(handoffTemplate, /## Validation Targets/);
  assert.match(handoffTemplate, /## Selected Checks/);
  assert.match(handoffTemplate, /## Coverage Rationale/);
  assert.match(handoffTemplate, /## Remaining Gaps/);
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
      preferred_address: "boss",
      greeting_style: "brief",
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
      enabled_modules: ["lightweight implementation"],
      qc_policy: "disabled",
      follow_policy: "disabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  const profile = loadProjectProfileState(dir);
  assert.equal(profile.task, "Tighten hot runtime context");
  assert.equal(profile.taskStatus, "active");
  assert.equal(profile.deliveryMode, "lightweight");
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

function testSubagentStopQueuesQcWithoutStory() {
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
  assert.equal(state.pendingActions[0].type, "run_qc");
  assert.equal(state.pendingActions[0].phase, "coder");
  assert.equal(state.pendingActions[0].storyPath, null);
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

function testValidateGitRejectsBroadAdd() {
  const result = runNodeResult(validateGitScript, { command: "git add ." });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /broad_git_add_denied/);
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
      preferred_address: "boss",
      greeting_style: "brief",
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
      follow_policy: "disabled",
      validation_profile_status: "inferred",
      open_questions: []
    }
  });

  const profile = loadProjectProfileState(dir);
  assert.equal(profile.deliveryMode, "standard");
  assert.deepEqual(profile.enabledModules, ["lightweight implementation"]);
}

function testTaskOverviewShowsCurrentAndHistoricalUnfinishedTasks() {
  const dir = makeTempDir("codex-starter-task-overview-");

  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "boss",
      greeting_style: "brief",
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
      follow_policy: "disabled",
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
  const registry = readTaskRegistry(dir);
  const oldTask = registry.tasks.find((task) => task.title === "Old routing cleanup");
  const currentTask = registry.tasks.find((task) => task.title === "New routing cleanup");

  assert.match(stdout, /Current task: New routing cleanup \[active\]/);
  assert.match(stdout, /Historical unfinished tasks: 1/);
  assert.match(stdout, /Unfinished: Old routing cleanup \[parked\]/);
  assert.doesNotMatch(stdout, /Completed tasks:/);
  assert.equal(oldTask.status, "parked");
  assert.equal(currentTask.status, "active");
  assert.equal(registry.currentTaskId, currentTask.id);
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
  const registry = readTaskRegistry(dir);
  const task = registry.tasks.find((entry) => entry.title === "Manual cleanup");

  assert.match(stdout, /Current task: none/);
  assert.match(stdout, /Historical unfinished tasks: 1/);
  assert.match(stdout, /Unfinished: Manual cleanup \[parked\]/);
  assert.equal(task.status, "parked");
  assert.match(task.reason, /Hot task cleared without explicit closure/);
  assert.equal(registry.currentTaskId, null);
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

function testRuntimeStateSyncsCompletedTasksIntoTaskRegistry() {
  const dir = makeTempDir("codex-starter-task-registry-sync-");

  writeJson(path.join(dir, ".codex", "state", "task-context.json"), {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "boss",
      greeting_style: "brief",
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
      enabled_modules: ["lightweight implementation"],
      qc_policy: "disabled",
      follow_policy: "disabled",
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

  assert.equal(task.status, "done");
  assert.equal(registry.currentTaskId, null);
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
  fs.mkdirSync(path.join(dir, ".agents", "skills", "follow"), { recursive: true });

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
    path.join(dir, ".agents", "skills", "follow", "SKILL.md"),
    [
      "---",
      "name: follow",
      "description: follow entry",
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
testProgressSyncSupportsLegacyShape();
testTaskContextJsonOverridesMarkdownProfile();
testLegacyDeliveryModeNamesNormalizeToCurrentNames();
testTrimRuntimeStateDropsOldFailurePatterns();
testSubagentStopQueuesQcWithoutStory();
testSessionContextKeepsRetrospectiveReminderForDoneTask();
testValidateGitRejectsBroadAdd();
testQcReviewerAliasRecordsStructuredFail();
testTaskOverviewShowsCurrentAndHistoricalUnfinishedTasks();
testTaskOverviewKeepsClearedHotTaskAsHistoricalUnfinished();
testTaskOverviewCanQueryCompletedTasksOnDemand();
testRuntimeStateSyncsCompletedTasksIntoTaskRegistry();
testArchitectCompletionQueuesGovernanceRetrospective();
testRepeatedQcFailuresQueueAideAuditReview();
testAideGovernanceInvestigateReportsPendingReviews();
testAideGovernanceAuditDetectsBrokenContracts();
testAideGovernanceDedupFindsSharedAuthorityCandidates();

process.stdout.write("runtime helper smoke tests passed\n");
