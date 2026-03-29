import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  fs,
  hookLogScript,
  installScriptPath,
  listRuntimeLogFiles,
  makeTempDir,
  path,
  prepareProjectProfile,
  readCodexHookLogEntries,
  readEvolutionRegistry,
  readRepoContextFile,
  readRuntimeLogEntries,
  readRuntimeState,
  readTaskContextFile,
  readTaskRegistry,
  rootDir,
  runNode,
  runNodeResult,
  sessionContextScript,
  startupContextScript,
  validateGitScript,
  writeJson
} from "../helpers/runtime-smoke-helpers.mjs";

function testSessionContextWritesFullInvocationLogs() {
  const dir = makeTempDir("codex-starter-session-log-");
  prepareProjectProfile(path.join(dir, ".codex", "project-profile.md"), [["- Task status: `idle`", "- Task status: `active`"]]);
  writeJson(path.join(dir, ".codex", "state", "runtime-state.json"), {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [
      {
        id: "run-submit:current-task",
        type: "run_submit",
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
  assert.match(stdout, /Pending submit: run \/submit/);
  assert.match(state.sessionContext.lastReminderText, /Pending submit: run \/submit/);

  const invokedScripts = new Set(logs.filter((entry) => entry.type === "invocation_start").map((entry) => entry.script));
  assert.ok(invokedScripts.has("startup-context.mjs"));
  assert.ok(invokedScripts.has("task-overview.mjs"));
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

function testInstallScriptCopiesStarterFilesAndUpdatesGitignore() {
  const dir = makeTempDir("codex-starter-install-");
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n", "utf8");
  fs.mkdirSync(path.join(dir, ".agents", "skills", "conduct"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".codex", "hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".codex", "state"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".product", "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "stale agents\n", "utf8");
  fs.writeFileSync(path.join(dir, ".agents", "skills", "conduct", "SKILL.md"), "stale skill\n", "utf8");
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
  assert.ok(fs.existsSync(path.join(dir, ".agents", "skills", "conduct", "SKILL.md")));
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
  assert.equal(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), fs.readFileSync(path.join(rootDir, "AGENTS.md"), "utf8"));

  const gitignore = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
  assert.match(gitignore, /node_modules\//);
  assert.match(gitignore, /# codex-starter/);
  assert.match(gitignore, /^AGENTS\.md$/m);
  assert.match(gitignore, /^\.agents\/$/m);
  assert.match(gitignore, /^\.codex\/$/m);
  assert.match(gitignore, /^\.product\/$/m);
}

function testInstalledRuntimeAuthorityUsesMiddleLayerSemantics() {
  const dir = makeTempDir("codex-starter-middle-layer-semantics-");
  const result = spawnSync("bash", [installScriptPath], {
    cwd: dir,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);

  const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  const routingPolicy = fs.readFileSync(path.join(dir, ".codex", "routing-policy.md"), "utf8");
  const conductSkill = fs.readFileSync(path.join(dir, ".agents", "skills", "conduct", "SKILL.md"), "utf8");
  const prdSkill = fs.readFileSync(path.join(dir, ".agents", "skills", "prd", "SKILL.md"), "utf8");
  const architectSkill = fs.readFileSync(path.join(dir, ".agents", "skills", "architect", "SKILL.md"), "utf8");
  const planSkill = fs.readFileSync(path.join(dir, ".agents", "skills", "plan", "SKILL.md"), "utf8");
  const coderAgent = fs.readFileSync(path.join(dir, ".codex", "agents", "coder.toml"), "utf8");
  const testerAgent = fs.readFileSync(path.join(dir, ".codex", "agents", "tester.toml"), "utf8");
  const authorityText = `${agents}\n${routingPolicy}\n${conductSkill}`;

  assert.match(
    authorityText,
    /Aide[\s\S]{0,180}(must not|do not|不直接)[\s\S]{0,180}(coder|tester|\/qc|\/submit)/i
  );
  assert.match(
    authorityText,
    /(route|handoff|through|先|进入|交给)[\s\S]{0,220}(conduct|technical-manager|技术经理)[\s\S]{0,220}(coder|tester|qc|submit)/i
  );
  assert.match(
    authorityText,
    /(repo_explorer|repository exploration|environment setup|setup|环境准备|环境设置)[\s\S]{0,200}(action|capabilit|helper|非主角色|not (a )?primary role)/i
  );
  assert.doesNotMatch(agents, /Prefer real subagents for[^\n]*repo_explorer/i);

  assert.match(prdSkill, /(product manager|product owner|产品经理)/i);
  assert.match(architectSkill, /(architect|架构师)/i);
  assert.match(planSkill, /(任务实施说明|Task Implementation Brief|implementation brief)/i);
  assert.match(
    `${planSkill}\n${routingPolicy}`,
    /(任务实施说明|Task Implementation Brief|implementation brief)[\s\S]{0,220}(coder|tester)/i
  );
  assert.doesNotMatch(coderAgent, /"plan_path":\s*null/i);
  assert.doesNotMatch(testerAgent, /"plan_path":\s*null/i);
  assert.match(
    `${coderAgent}\n${testerAgent}`,
    /status=complete[\s\S]{0,220}plan_path[\s\S]{0,220}non-empty[\s\S]{0,220}Task Implementation Brief/i
  );
  assert.match(
    `${coderAgent}\n${testerAgent}`,
    /(brief|path)[\s\S]{0,220}(missing|unreadable)[\s\S]{0,220}(blocked|blocker)/i
  );
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
  fs.writeFileSync(path.join(sourceDir, ".codex", "logs", "runtime-hooks", "source-log.jsonl"), '{"daily":"source"}\n', "utf8");
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
    tasks: [{ id: "source-task", title: "source task", status: "active" }]
  });
  writeJson(path.join(sourceDir, ".codex", "state", "source-only.json"), { from: "source" });

  fs.mkdirSync(path.join(targetDir, ".codex", "logs", "runtime-hooks"), { recursive: true });
  fs.mkdirSync(path.join(targetDir, ".codex", "logs", "codex-hooks"), { recursive: true });
  fs.writeFileSync(path.join(targetDir, ".codex", "logs", "runtime-hooks.jsonl"), '{"legacy":"target"}\n', "utf8");
  fs.writeFileSync(path.join(targetDir, ".codex", "logs", "runtime-hooks", "target-log.jsonl"), '{"daily":"target"}\n', "utf8");
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
    tasks: [{ id: "target-task", title: "target task", status: "active" }]
  });
  writeJson(path.join(targetDir, ".codex", "state", "target-only.json"), { from: "target" });

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

testSessionContextWritesFullInvocationLogs();
testStartupContextRunsStartupChainAndWritesInvocationLogs();
testCodexHookLoggerCapturesSessionStartAndStopEvents();
testRuntimeLogSplitsLargeDailyLogsIntoChunks();
testValidateGitRejectsBroadAdd();
testValidateGitWritesBlockedInvocationLog();
testInstallScriptCopiesStarterFilesAndUpdatesGitignore();
testInstalledRuntimeAuthorityUsesMiddleLayerSemantics();
testInstallScriptSkipsSourceRuntimeArtifactsAndPreservesTargetRuntimeFiles();

process.stdout.write("runtime ops smoke tests passed\n");
