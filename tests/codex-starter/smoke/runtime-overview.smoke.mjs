import assert from "node:assert/strict";
import {
  fs,
  makeTempDir,
  path,
  prepareProjectProfile,
  readRuntimeState,
  readTaskContextFile,
  runNode,
  runtimeStateScript,
  saveTaskContext,
  taskOverviewScript,
  writeJson
} from "../helpers/runtime-smoke-helpers.mjs";

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

function testTaskSettledFallbackBindsMissingTesterSignalsToRequiredTaskId() {
  const dir = makeTempDir("codex-starter-task-settled-fallback-taskid-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"));

  saveTaskContext(dir, {
    task: {
      current_task: "Fallback settlement scope",
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
            plan_path: "docs/plans/fallback-settlement-task.md",
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

  const requiredTaskId = readTaskContextFile(dir).task.workflow.required_handoff_task_id;
  assert.equal(typeof requiredTaskId, "string");
  assert.notEqual(requiredTaskId, "");

  writeJson(path.join(dir, ".codex", "state", "task-registry.json"), {
    version: 1,
    updatedAt: "2026-03-29T10:05:00.000Z",
    currentTaskId: null,
    tasks: []
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
  const blocked = state.pendingActions.find((item) => item.type === "blocked_review" && item.phase === "tester");
  const governanceReview = state.pendingActions.find(
    (item) => item.type !== "blocked_review" && /review$/i.test(String(item.type || "")) && item.taskId === requiredTaskId
  );

  assert.ok(blocked);
  assert.equal(blocked.taskId, requiredTaskId);
  assert.ok(governanceReview);
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

testTaskOverviewShowsCurrentAndHistoricalUnfinishedTasks();
testTaskOverviewDoesNotWriteTaskRegistryForReadOnlyQuery();
testTaskSettledDoesNotBypassRequiredTesterHandoff();
testTaskSettledWorkflowGuardBlocksCloseoutWithoutPendingTesterAction();
testTaskSettledFallbackBindsMissingTesterSignalsToRequiredTaskId();
testSessionEndWorkflowGuardBlocksCloseoutWithoutPendingTesterAction();
testSessionEndDoesNotAdvanceSubmitOrSettleWithoutTaskSettledEvent();

process.stdout.write("runtime overview smoke tests passed\n");
