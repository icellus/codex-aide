#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultTaskContext, defaultTaskState } from "../starter/aide/scripts/shared/task-context.mjs";
import { syncTaskProgressArtifacts } from "../starter/aide/scripts/shared/task-progress.mjs";

const defaultRepoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function parseArgs(argv) {
  let repoRoot = defaultRepoRoot;
  let checkOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo-root") {
      repoRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--check") {
      checkOnly = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return {
    repoRoot,
    checkOnly
  };
}

function progressDemoPath(repoRoot, fileName) {
  return path.join(repoRoot, "starter", "aide", "progress", fileName);
}

function runtimePath(projectDir, relativePath) {
  return path.join(projectDir, relativePath);
}

function buildTask(projectDir, overrides) {
  return {
    ...defaultTaskState(),
    ...overrides,
    prd_path: overrides.prd_path ? runtimePath(projectDir, overrides.prd_path) : "",
    architecture_path: overrides.architecture_path ? runtimePath(projectDir, overrides.architecture_path) : "",
    implementation_brief_path: overrides.implementation_brief_path
      ? runtimePath(projectDir, overrides.implementation_brief_path)
      : ""
  };
}

function buildState(task) {
  const state = defaultTaskContext();
  state.updated_at = task.updated_at;
  state.task = task;
  return state;
}

function findSingleGeneratedFile(rootDir) {
  const entries = fs.readdirSync(rootDir).filter((name) => name.endsWith(".md")).sort();
  if (entries.length !== 1) {
    throw new Error(`expected exactly one generated markdown file in ${rootDir}, got ${entries.length}`);
  }
  return path.join(rootDir, entries[0]);
}

function generateDemoOutputs() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-aide-progress-demo-"));

  try {
    const projectDir = path.join(tempRoot, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    const outputs = new Map();

    // 常规长任务示例：展示当前 runtime 对 handoff 中任务的真实渲染结果。
    const currentTask = buildTask(projectDir, {
      current_task: "Implement payment retry safeguards",
      task_id: "payment-retry-hardening",
      status: "handoff",
      class: "feature",
      delivery_mode: "long-running",
      route_rationale: "Coder handoff completed; task-level validation is next.",
      checkpoint: "validate",
      next_step: "Run tester handoff against the latest implementation brief.",
      next_owner: "tester",
      sticky_owner: "technical_manager",
      sticky_reason: "same-task source-code follow-up stays on the technical delivery owner",
      sticky_since: "2026-04-01T09:00:00.000Z",
      waiting_on: "none",
      activated_roles: ["technical_manager", "coder", "tester"],
      completed_roles: ["coder"],
      subagent_roles: ["coder"],
      product_decision: "skip",
      enabled_roles: ["technical_manager", "coder", "tester"],
      enabled_modules: ["technical delivery", "task validation"],
      implementation_brief_path: "plans/payment-retry-hardening-implementation-brief.md",
      created_at: "2026-04-01T09:00:00.000Z",
      started_at: "2026-04-01T09:00:00.000Z",
      updated_at: "2026-04-01T09:30:00.000Z",
      last_event: "handoff-switch",
      last_actor: "technical_manager"
    });
    const currentState = buildState(currentTask);
    syncTaskProgressArtifacts({
      projectDir,
      previousState: defaultTaskContext(),
      nextState: currentState
    });
    outputs.set(
      "current.demo.md",
      fs.readFileSync(
        path.join(projectDir, ".codex", "aide", "progress", "active", "payment-retry-hardening", "current.md"),
        "utf8"
      )
    );

    // release 形态示例：runtime 目前仍使用同一套 current snapshot 结构。
    const releaseTask = buildTask(projectDir, {
      current_task: "Prepare 2.4.0 release rollout",
      task_id: "release-2-4-0",
      status: "blocked",
      class: "feature",
      delivery_mode: "long-running",
      route_rationale: "Release handoff is blocked until the production cutover window is confirmed.",
      checkpoint: "closeout",
      next_step: "Confirm the production cutover window before governed delivery continues.",
      next_owner: "technical_manager",
      sticky_owner: "technical_manager",
      sticky_reason: "same-task source-code follow-up stays on the technical delivery owner",
      sticky_since: "2026-04-02T08:00:00.000Z",
      waiting_on: "external",
      blocked_reason: "Awaiting production cutover window confirmation from operations.",
      activated_roles: ["technical_manager", "tester", "submit"],
      completed_roles: ["tester"],
      subagent_roles: ["tester"],
      product_decision: "skip",
      enabled_roles: ["technical_manager", "tester", "submit"],
      enabled_modules: ["release coordination", "governed delivery"],
      implementation_brief_path: "plans/release-2-4-0-implementation-brief.md",
      created_at: "2026-04-02T08:00:00.000Z",
      started_at: "2026-04-02T08:00:00.000Z",
      updated_at: "2026-04-02T11:15:00.000Z",
      last_event: "blocked",
      last_actor: "technical_manager"
    });
    const releaseState = buildState(releaseTask);
    syncTaskProgressArtifacts({
      projectDir,
      previousState: defaultTaskContext(),
      nextState: releaseState
    });
    outputs.set(
      "release-current.demo.md",
      fs.readFileSync(path.join(projectDir, ".codex", "aide", "progress", "active", "release-2-4-0", "current.md"), "utf8")
    );

    // 历史示例：展示完成后归档路径与实际 Written By 字段来自运行时 last_actor。
    const previousHistoryTask = buildTask(projectDir, {
      current_task: "Finalize governed delivery for payment retry safeguards",
      task_id: "payment-retry-delivery",
      status: "handoff",
      class: "feature",
      delivery_mode: "long-running",
      route_rationale: "Validation completed; governed submit is next.",
      checkpoint: "closeout",
      next_step: "Push the validated work branch through governed submit.",
      next_owner: "submit",
      sticky_owner: "technical_manager",
      sticky_reason: "same-task source-code follow-up stays on the technical delivery owner",
      sticky_since: "2026-04-02T13:00:00.000Z",
      waiting_on: "none",
      activated_roles: ["technical_manager", "coder", "tester", "submit"],
      completed_roles: ["coder", "tester"],
      subagent_roles: ["coder", "tester"],
      product_decision: "skip",
      enabled_roles: ["technical_manager", "coder", "tester", "submit"],
      enabled_modules: ["technical delivery", "governed delivery"],
      implementation_brief_path: "plans/payment-retry-delivery-implementation-brief.md",
      created_at: "2026-04-02T13:00:00.000Z",
      started_at: "2026-04-02T13:00:00.000Z",
      updated_at: "2026-04-02T14:10:00.000Z",
      last_event: "handoff-switch",
      last_actor: "technical_manager"
    });
    const nextHistoryTask = buildTask(projectDir, {
      ...previousHistoryTask,
      implementation_brief_path: "plans/payment-retry-delivery-implementation-brief.md",
      status: "completed",
      next_step: "",
      next_owner: "Aide",
      completion_reason: "submit delivery completed",
      updated_at: "2026-04-02T14:25:00.000Z",
      finished_at: "2026-04-02T14:25:00.000Z",
      last_event: "completed",
      last_actor: "submit"
    });
    syncTaskProgressArtifacts({
      projectDir,
      previousState: buildState(previousHistoryTask),
      nextState: buildState(nextHistoryTask)
    });
    const historyDir = path.join(projectDir, ".codex", "aide", "progress", "archive", "payment-retry-delivery", "history");
    outputs.set("history-entry.demo.md", fs.readFileSync(findSingleGeneratedFile(historyDir), "utf8"));

    return outputs;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeOutputs(repoRoot, outputs) {
  for (const [fileName, text] of outputs.entries()) {
    fs.writeFileSync(progressDemoPath(repoRoot, fileName), text, "utf8");
  }
}

function checkOutputs(repoRoot, outputs) {
  const mismatches = [];

  for (const [fileName, expectedText] of outputs.entries()) {
    const targetPath = progressDemoPath(repoRoot, fileName);
    if (!fs.existsSync(targetPath)) {
      mismatches.push(`${fileName}: file missing`);
      continue;
    }

    const actualText = fs.readFileSync(targetPath, "utf8");
    if (actualText !== expectedText) {
      mismatches.push(`${fileName}: content drift`);
    }
  }

  return mismatches;
}

function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write("Usage: node scripts/generate-codex-aide-progress-demos.mjs [--check] [--repo-root <path>]\n");
    return 2;
  }

  const outputs = generateDemoOutputs();

  if (options.checkOnly) {
    const mismatches = checkOutputs(options.repoRoot, outputs);
    if (mismatches.length > 0) {
      process.stderr.write(`progress demo mismatch:\n- ${mismatches.join("\n- ")}\n`);
      return 1;
    }

    process.stdout.write("progress demos are in sync\n");
    return 0;
  }

  writeOutputs(options.repoRoot, outputs);
  process.stdout.write(
    `updated progress demos:\n- ${Array.from(outputs.keys()).map((fileName) => `starter/aide/progress/${fileName}`).join("\n- ")}\n`
  );
  return 0;
}

process.exit(main());
