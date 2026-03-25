import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  detectQcFail,
  parseActiveStories,
  syncProgressFromState
} from "../.claude/hooks/hook-utils.mjs";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runtimeStateScript = path.join(rootDir, ".claude", "hooks", "runtime-state.mjs");
const sessionContextScript = path.join(rootDir, ".claude", "hooks", "session-context.mjs");
const progressTemplatePath = path.join(rootDir, ".claude", "templates", "progress.md");
const projectProfilePath = path.join(rootDir, ".claude", "project-profile.md");

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

function readRuntimeState(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".claude", "state", "runtime-state.json"), "utf8"));
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

function testProgressSyncSupportsLegacyShape() {
  const dir = makeTempDir("claude-starter-progress-");
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
        suggestedRoute: ["tester.md"],
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
  assert.match(next, /## Session Retrospective \(Optional\)/);
  assert.match(next, /## Learning Queue \(Optional\)/);
  assert.match(next, /### retrospective-demo-md/);
  assert.match(next, /### lesson-demo/);
}

function testSubagentStopQueuesQcWithoutStory() {
  const dir = makeTempDir("claude-starter-qc-");
  prepareProjectProfile(path.join(dir, ".claude", "project-profile.md"), [
    ["- QC policy: `disabled`", "- QC policy: `enabled`"],
    ["- Selected delivery mode: `direct`", "- Selected delivery mode: `plan-driven`"]
  ]);

  runNode(
    runtimeStateScript,
    {
      hook_event_name: "SubagentStop",
      cwd: dir,
      agent_type: "coder",
      last_assistant_message: "## Implementation Complete"
    },
    { CLAUDE_PROJECT_DIR: dir }
  );

  const state = readRuntimeState(dir);
  assert.equal(state.pendingActions.length, 1);
  assert.equal(state.pendingActions[0].type, "run_qc");
  assert.equal(state.pendingActions[0].phase, "coder");
  assert.equal(state.pendingActions[0].storyPath, null);
}

function testSessionContextKeepsRetrospectiveReminderForDoneTask() {
  const dir = makeTempDir("claude-starter-retro-");
  prepareProjectProfile(path.join(dir, ".claude", "project-profile.md"), [
    ["- Task status: `idle`", "- Task status: `done`"],
    ["- Selected delivery mode: `direct`", "- Selected delivery mode: `orchestrated`"]
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
  writeJson(path.join(dir, ".claude", "state", "runtime-state.json"), {
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

  const stdout = runNode(sessionContextScript, { cwd: dir }, { CLAUDE_PROJECT_DIR: dir });
  const state = readRuntimeState(dir);

  assert.match(stdout, /Retrospective pending/);
  assert.match(state.sessionContext.lastReminderText, /Retrospective pending/);
}

testQcDetectionRequiresQcMarkers();
testProgressSyncSupportsLegacyShape();
testSubagentStopQueuesQcWithoutStory();
testSessionContextKeepsRetrospectiveReminderForDoneTask();

process.stdout.write("runtime hooks smoke tests passed\n");
