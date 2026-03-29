import assert from "node:assert/strict";
import {
  detectQcFail,
  fs,
  loadProjectProfileState,
  loadRepoContext,
  makeTempDir,
  path,
  prepareProjectProfile,
  readRuntimeState,
  readTaskRegistry,
  readTaskContextFile,
  runNode,
  runtimeStateScript,
  saveRepoContext,
  saveTaskContext,
  writeJson
} from "../helpers/runtime-smoke-helpers.mjs";

function testQcDetectionRequiresQcMarkers() {
  assert.equal(detectQcFail("The feature is NOT IMPLEMENTED yet."), false);
  assert.equal(detectQcFail("Overall Verdict: FAIL\n- NOT IMPLEMENTED"), true);
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
      open_questions: ["Should technical_manager run?"]
    }
  });

  const saved = JSON.parse(fs.readFileSync(path.join(dir, ".codex", "state", "task-context.json"), "utf8"));
  assert.equal(saved.version, 1);
  assert.equal(saved.collaboration.preferred_address, "Boss");
  assert.equal(saved.collaboration.greeting_style, "warm");
  assert.equal(saved.collaboration.first_startup_greeting_completed, true);
  assert.equal(saved.task.current_task, "Review the routing flow");
  assert.deepEqual(saved.task.enabled_roles, ["Aide"]);
  assert.deepEqual(saved.task.open_questions, ["Should technical_manager run?"]);
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

function testCoderCompletionWithBriefPathQueuesTester() {
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
            plan_path: "docs/plans/coder-queues-tester.md",
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
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "coder");

  assert.ok(testerAction);
  assert.equal(testerAction.phase, "tester");
  assert.equal(typeof testerAction.workflow_chain_id, "string");
  assert.notEqual(testerAction.workflow_chain_id, "");
  assert.equal(blocked, undefined);
  assert.equal(state.pendingActions.some((item) => item.type === "run_submit"), false);
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
            plan_path: "docs/plans/runtime-flow-v1.md",
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
  const registryAfterCoder = readTaskRegistry(dir);
  const currentTaskIdAfterCoder = registryAfterCoder.currentTaskId;
  assert.equal(typeof currentTaskIdAfterCoder, "string");
  assert.notEqual(currentTaskIdAfterCoder, "");

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
            plan_path: "docs/plans/runtime-flow-v1.md",
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
  assert.equal(workflowAfterTester.workflow_chain_id, workflowChainId);
  assert.equal(workflowAfterTester.required_handoff, "none");
  assert.equal(workflowAfterTester.settlement_guard, "none");
  assert.equal(workflowAfterTester.expected_next_step, "submit");
  const stateAfterTester = readRuntimeState(dir);
  const registryAfterTester = readTaskRegistry(dir);
  const currentTask = registryAfterTester.tasks.find((item) => item.id === currentTaskIdAfterCoder);
  const blocked = stateAfterTester.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");

  assert.equal(blocked, undefined);
  assert.equal(registryAfterTester.currentTaskId, currentTaskIdAfterCoder);
  assert.ok(currentTask);
  assert.match(currentTask.matchKey, /^task:/);
  assert.equal(currentTask.matchKey.includes("docs/plans/"), false);
}

function testTesterCompletionFallsBackToRequiredHandoffTaskIdWhenTaskLookupIsMissing() {
  const dir = makeTempDir("codex-starter-workflow-taskid-fallback-");

  saveTaskContext(dir, {
    task: {
      current_task: "Fallback tester task scope",
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
            plan_path: "docs/plans/fallback-tester-task.md",
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
  const workflowChainId = workflowAfterCoder.workflow_chain_id;
  const requiredTaskId = workflowAfterCoder.required_handoff_task_id;

  assert.equal(typeof workflowChainId, "string");
  assert.notEqual(workflowChainId, "");
  assert.equal(typeof requiredTaskId, "string");
  assert.notEqual(requiredTaskId, "");

  writeJson(path.join(dir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-29T10:00:00.000Z",
    currentTaskId: null,
    tasks: []
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
            plan_path: "docs/plans/fallback-tester-task.md",
            workflow_chain_id: workflowChainId,
            validation_targets: ["fallback task scope"],
            coverage_rationale: "required handoff task id should bind the tester result",
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

  const stateAfterTester = readRuntimeState(dir);
  const workflowAfterTester = readTaskContextFile(dir).task.workflow;
  const testerAction = stateAfterTester.pendingActions.find((item) => item.type === "run_tester");
  const submitAction = stateAfterTester.pendingActions.find((item) => item.type === "run_submit");

  assert.equal(testerAction, undefined);
  assert.ok(submitAction);
  assert.equal(submitAction.taskId, requiredTaskId);
  assert.equal(workflowAfterTester.required_handoff, "none");
  assert.equal(workflowAfterTester.expected_next_step, "submit");
}

function testTesterCompletionWithoutWorkflowChainIdKeepsGuardEvenWithPlanPath() {
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
            plan_path: "docs/plans/workflow-chain-missing.md",
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
            plan_path: "docs/plans/another-path.md",
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
  const signalNote = blocked?.note || "";

  assert.equal(workflowAfterTester.workflow_chain_id, activeChainId);
  assert.equal(workflowAfterTester.required_handoff, "tester");
  assert.equal(workflowAfterTester.settlement_guard, "require_required_handoff");
  assert.equal(workflowAfterTester.expected_next_step, "tester_handoff");
  assert.equal(state.pendingActions.some((item) => item.type === "run_submit"), false);
  assert.ok(blocked);
  assert.match(signalNote, /workflow_chain_id|chain|required|missing/i);
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
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");

  assert.ok(blocked);
  assert.match(blocked.note, /missing required "## Structured Result" section/i);
  assert.equal(testerAction, undefined);
}

function testRuntimeRejectsCoderCompletionWithoutPlanPath() {
  const dir = makeTempDir("codex-starter-plan-path-missing-");
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

  const state = readRuntimeState(dir);
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "coder");
  const testerAction = state.pendingActions.find((item) => item.type === "run_tester");

  assert.ok(blocked);
  assert.match(blocked.note, /plan_path/i);
  assert.match(blocked.note, /technical_manager/i);
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
            plan_path: "docs/plans/qc-after-tester.md",
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
            plan_path: "docs/plans/qc-before-tester.md",
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
            plan_path: "docs/plans/qc-after-tester.md",
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

  const workflow = readTaskContextFile(dir).task.workflow;
  const workflowChainId = workflow.workflow_chain_id;
  assert.equal(typeof workflowChainId, "string");
  assert.notEqual(workflowChainId, "");

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
            plan_path: "docs/plans/qc-after-tester.md",
            needs_qc: true,
            workflow_chain_id: workflowChainId,
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

testQcDetectionRequiresQcMarkers();
testTaskContextJsonOverridesMarkdownProfile();
testTaskContextHelpersWriteNormalizedState();
testRepoContextHelpersWriteNormalizedState();
testCoderCompletionWithBriefPathQueuesTester();
testCoderAndTesterCompletionUpdateWorkflowHotState();
testTesterCompletionFallsBackToRequiredHandoffTaskIdWhenTaskLookupIsMissing();
testTesterCompletionWithoutWorkflowChainIdKeepsGuardEvenWithPlanPath();
testRuntimeRejectsCoderCompletionWithoutStructuredFooter();
testRuntimeRejectsCoderCompletionWithoutPlanPath();
testRuntimeRejectsStructuredResultBypassWithPostSectionJson();
testRuntimeRejectsTesterCompletionWithoutStructuredFooter();
testQcBeforeTesterCannotQueueSubmit();
testQcPassQueuesSubmitAfterTesterAudit();

process.stdout.write("runtime workflow smoke tests passed\n");
