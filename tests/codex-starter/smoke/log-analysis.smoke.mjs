import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { starterRootDir } from "../helpers/test-paths.mjs";

const rootDir = starterRootDir;
const logAnalysisScript = path.join(rootDir, ".codex", "scripts", "log-analysis.mjs");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJsonl(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf8");
}

function buildMemoLikeReply() {
  const bullets = Array.from({ length: 8 }, (_, index) => `- 点${index + 1} [ref](/workspace/docker-infra/path-${index})`).join("\n");
  return `Boss，先给结论。\n\n${bullets}\n\n${"详细说明".repeat(220)}`;
}

function createTranscript(filePath, { id, role, forkedFromId = null, nickname = null }) {
  const payload = {
    id,
    cwd: "/workspace/docker-infra",
    agent_role: role,
    forked_from_id: forkedFromId,
    agent_nickname: nickname,
    source: forkedFromId
      ? {
          subagent: {
            thread_spawn: {
              parent_thread_id: forkedFromId,
              agent_role: role
            }
          }
        }
      : "cli"
  };
  writeJsonl(filePath, [{ timestamp: "2026-03-29T05:35:00.000Z", type: "session_meta", payload }]);
}

function runLogAnalysis(logsDir) {
  const output = execFileSync(
    "node",
    [
      logAnalysisScript,
      "--logs",
      logsDir,
      "--json",
      "--read-heavy-tool-threshold",
      "3",
      "--read-heavy-read-command-threshold",
      "2",
      "--memo-length-threshold",
      "500"
    ],
    {
      cwd: rootDir,
      encoding: "utf8"
    }
  );
  return JSON.parse(output);
}

function testImportedLogAnalysisDetectsKeySignals() {
  const dir = makeTempDir("codex-starter-log-analysis-");
  const logsDir = path.join(dir, "logs");
  const codexHooksPath = path.join(logsDir, "codex-hooks", "2026-03-29.jsonl");
  const runtimeHooksPath = path.join(logsDir, "runtime-hooks", "2026-03-29.jsonl");
  const transcriptDir = path.join(dir, "transcripts");
  const mainTranscriptPath = path.join(transcriptDir, "main.jsonl");
  const coderTranscriptPath = path.join(transcriptDir, "coder.jsonl");

  createTranscript(mainTranscriptPath, {
    id: "session-main",
    role: "main"
  });
  createTranscript(coderTranscriptPath, {
    id: "session-coder",
    role: "coder",
    forkedFromId: "session-main",
    nickname: "Hooke"
  });

  writeJsonl(codexHooksPath, [
    {
      capturedAt: "2026-03-29T05:35:08.440Z",
      hookEventName: "SessionStart",
      sessionId: "session-main",
      turnId: null,
      transcriptPath: mainTranscriptPath,
      payload: { model: "gpt-5.4" }
    },
    {
      capturedAt: "2026-03-29T05:36:02.763Z",
      hookEventName: "UserPromptSubmit",
      sessionId: "session-main",
      turnId: "turn-analysis",
      transcriptPath: mainTranscriptPath,
      payload: {
        model: "gpt-5.4",
        prompt: "先看一下 app/subx service。"
      }
    },
    {
      capturedAt: "2026-03-29T05:36:14.959Z",
      hookEventName: "PreToolUse",
      sessionId: "session-main",
      turnId: "turn-analysis",
      transcriptPath: mainTranscriptPath,
      payload: {
        model: "gpt-5.4",
        tool_name: "Bash",
        tool_use_id: "tool-1",
        tool_input: { command: "sed -n '1,220p' app/subx/Dockerfile" }
      }
    },
    {
      capturedAt: "2026-03-29T05:36:15.010Z",
      hookEventName: "PreToolUse",
      sessionId: "session-main",
      turnId: "turn-analysis",
      transcriptPath: mainTranscriptPath,
      payload: {
        model: "gpt-5.4",
        tool_name: "Bash",
        tool_use_id: "tool-2",
        tool_input: { command: "nl -ba app/docker-compose.yml | sed -n '1,120p'" }
      }
    },
    {
      capturedAt: "2026-03-29T05:36:15.040Z",
      hookEventName: "PreToolUse",
      sessionId: "session-main",
      turnId: "turn-analysis",
      transcriptPath: mainTranscriptPath,
      payload: {
        model: "gpt-5.4",
        tool_name: "Bash",
        tool_use_id: "tool-3",
        tool_input: { command: "find app/subx -maxdepth 2 -type f | sort" }
      }
    },
    {
      capturedAt: "2026-03-29T05:36:15.056Z",
      hookEventName: "PostToolUse",
      sessionId: "session-main",
      turnId: "turn-analysis",
      transcriptPath: mainTranscriptPath,
      payload: {
        model: "gpt-5.4",
        tool_name: "Bash",
        tool_use_id: "tool-1",
        tool_input: { command: "sed -n '1,220p' app/subx/Dockerfile" }
      }
    },
    {
      capturedAt: "2026-03-29T05:36:15.088Z",
      hookEventName: "PostToolUse",
      sessionId: "session-main",
      turnId: "turn-analysis",
      transcriptPath: mainTranscriptPath,
      payload: {
        model: "gpt-5.4",
        tool_name: "Bash",
        tool_use_id: "tool-2",
        tool_input: { command: "nl -ba app/docker-compose.yml | sed -n '1,120p'" }
      }
    },
    {
      capturedAt: "2026-03-29T05:38:08.476Z",
      hookEventName: "Stop",
      sessionId: "session-main",
      turnId: "turn-analysis",
      transcriptPath: mainTranscriptPath,
      payload: {
        model: "gpt-5.4",
        last_assistant_message: buildMemoLikeReply()
      }
    },
    {
      capturedAt: "2026-03-29T05:40:50.117Z",
      hookEventName: "SessionStart",
      sessionId: "session-coder",
      turnId: null,
      transcriptPath: coderTranscriptPath,
      payload: { model: "gpt-5.4-mini" }
    },
    {
      capturedAt: "2026-03-29T05:41:00.000Z",
      hookEventName: "UserPromptSubmit",
      sessionId: "session-coder",
      turnId: "turn-coder",
      transcriptPath: coderTranscriptPath,
      payload: {
        model: "gpt-5.4-mini",
        prompt: "你负责实现这轮改造。"
      }
    },
    {
      capturedAt: "2026-03-29T05:42:17.265Z",
      hookEventName: "Stop",
      sessionId: "session-coder",
      turnId: "turn-coder",
      transcriptPath: coderTranscriptPath,
      payload: {
        model: "gpt-5.4-mini",
        last_assistant_message: "已完成实现。"
      }
    }
  ]);

  writeJsonl(runtimeHooksPath, [
    {
      timestamp: "2026-03-29T05:35:08.441Z",
      script: "startup-context.mjs",
      type: "invocation_start"
    },
    {
      timestamp: "2026-03-29T05:35:08.563Z",
      script: "startup-context.mjs",
      type: "invocation_finish",
      durationMs: 122
    }
  ]);

  const report = runLogAnalysis(logsDir);

  assert.equal(report.summary.sessionCount, 2);
  assert.equal(report.summary.turnCount, 2);
  assert.equal(report.anomalies.prePostMismatches.length, 1);
  assert.equal(report.anomalies.prePostMismatches[0].toolUseId, "tool-3");

  assert.ok(report.anomalies.readHeavyTurns.some((turn) => turn.turnId === "turn-analysis"));
  assert.ok(report.anomalies.memoRiskTurns.some((turn) => turn.turnId === "turn-analysis"));

  assert.equal(report.tracks.subagents.roleCounts.coder, 1);
  assert.ok(report.tracks.subagents.hasSubagent);

  const issueTypes = new Set(report.anomalies.handoffIssues.map((item) => item.type));
  assert.ok(issueTypes.has("coder_without_tester"));
  assert.ok(issueTypes.has("runtime_missing_subagent_result"));
  assert.ok(issueTypes.has("runtime_missing_task_settled"));
}

function testOlderTesterDoesNotSatisfyLaterCoder() {
  const dir = makeTempDir("codex-starter-log-analysis-order-");
  const logsDir = path.join(dir, "logs");
  const codexHooksPath = path.join(logsDir, "codex-hooks", "2026-03-29.jsonl");
  const runtimeHooksPath = path.join(logsDir, "runtime-hooks", "2026-03-29.jsonl");
  const transcriptDir = path.join(dir, "transcripts");
  const mainTranscriptPath = path.join(transcriptDir, "main.jsonl");
  const testerOldTranscriptPath = path.join(transcriptDir, "tester-old.jsonl");
  const coderNewTranscriptPath = path.join(transcriptDir, "coder-new.jsonl");

  createTranscript(mainTranscriptPath, { id: "session-main-2", role: "main" });
  createTranscript(testerOldTranscriptPath, {
    id: "session-tester-old",
    role: "tester",
    forkedFromId: "session-main-2",
    nickname: "T1"
  });
  createTranscript(coderNewTranscriptPath, {
    id: "session-coder-new",
    role: "coder",
    forkedFromId: "session-main-2",
    nickname: "C1"
  });

  writeJsonl(codexHooksPath, [
    {
      capturedAt: "2026-03-29T05:35:00.000Z",
      hookEventName: "SessionStart",
      sessionId: "session-main-2",
      turnId: null,
      transcriptPath: mainTranscriptPath,
      payload: { model: "gpt-5.4" }
    },
    {
      capturedAt: "2026-03-29T05:35:10.000Z",
      hookEventName: "SessionStart",
      sessionId: "session-tester-old",
      turnId: null,
      transcriptPath: testerOldTranscriptPath,
      payload: { model: "gpt-5.4-mini" }
    },
    {
      capturedAt: "2026-03-29T05:35:12.000Z",
      hookEventName: "UserPromptSubmit",
      sessionId: "session-tester-old",
      turnId: "turn-tester-old",
      transcriptPath: testerOldTranscriptPath,
      payload: { model: "gpt-5.4-mini", prompt: "先跑一轮测试" }
    },
    {
      capturedAt: "2026-03-29T05:35:40.000Z",
      hookEventName: "Stop",
      sessionId: "session-tester-old",
      turnId: "turn-tester-old",
      transcriptPath: testerOldTranscriptPath,
      payload: { model: "gpt-5.4-mini", last_assistant_message: "tester 完成了旧链路验证。" }
    },
    {
      capturedAt: "2026-03-29T05:36:10.000Z",
      hookEventName: "SessionStart",
      sessionId: "session-coder-new",
      turnId: null,
      transcriptPath: coderNewTranscriptPath,
      payload: { model: "gpt-5.4-mini" }
    },
    {
      capturedAt: "2026-03-29T05:36:12.000Z",
      hookEventName: "UserPromptSubmit",
      sessionId: "session-coder-new",
      turnId: "turn-coder-new",
      transcriptPath: coderNewTranscriptPath,
      payload: { model: "gpt-5.4-mini", prompt: "开始新链路编码" }
    },
    {
      capturedAt: "2026-03-29T05:36:50.000Z",
      hookEventName: "Stop",
      sessionId: "session-coder-new",
      turnId: "turn-coder-new",
      transcriptPath: coderNewTranscriptPath,
      payload: { model: "gpt-5.4-mini", last_assistant_message: "coder 完成了新链路实现。" }
    }
  ]);

  writeJsonl(runtimeHooksPath, []);

  const report = runLogAnalysis(logsDir);
  const issue = report.anomalies.handoffIssues.find((item) => item.type === "coder_without_tester");

  assert.ok(issue, "expected coder_without_tester issue");
  assert.ok(Array.isArray(issue.affectedCoderSessions), "expected affected coder session list");
  assert.ok(
    issue.affectedCoderSessions.some((entry) => entry.sessionId === "session-coder-new"),
    "expected later coder session to be flagged as missing downstream tester"
  );
}

function testReusedTesterSessionAfterCoderCountsAsDownstreamTester() {
  const dir = makeTempDir("codex-starter-log-analysis-reused-tester-");
  const logsDir = path.join(dir, "logs");
  const codexHooksPath = path.join(logsDir, "codex-hooks", "2026-03-29.jsonl");
  const runtimeHooksPath = path.join(logsDir, "runtime-hooks", "2026-03-29.jsonl");
  const transcriptDir = path.join(dir, "transcripts");
  const mainTranscriptPath = path.join(transcriptDir, "main.jsonl");
  const testerTranscriptPath = path.join(transcriptDir, "tester-reused.jsonl");
  const coderTranscriptPath = path.join(transcriptDir, "coder-new.jsonl");

  createTranscript(mainTranscriptPath, { id: "session-main-3", role: "main" });
  createTranscript(testerTranscriptPath, {
    id: "session-tester-reused",
    role: "tester",
    forkedFromId: "session-main-3",
    nickname: "T2"
  });
  createTranscript(coderTranscriptPath, {
    id: "session-coder-3",
    role: "coder",
    forkedFromId: "session-main-3",
    nickname: "C3"
  });

  writeJsonl(codexHooksPath, [
    {
      capturedAt: "2026-03-29T05:50:00.000Z",
      hookEventName: "SessionStart",
      sessionId: "session-main-3",
      turnId: null,
      transcriptPath: mainTranscriptPath,
      payload: { model: "gpt-5.4" }
    },
    {
      capturedAt: "2026-03-29T05:50:10.000Z",
      hookEventName: "SessionStart",
      sessionId: "session-tester-reused",
      turnId: null,
      transcriptPath: testerTranscriptPath,
      payload: { model: "gpt-5.4-mini" }
    },
    {
      capturedAt: "2026-03-29T05:50:12.000Z",
      hookEventName: "UserPromptSubmit",
      sessionId: "session-tester-reused",
      turnId: "turn-tester-old",
      transcriptPath: testerTranscriptPath,
      payload: { model: "gpt-5.4-mini", prompt: "先执行旧轮 tester 检查" }
    },
    {
      capturedAt: "2026-03-29T05:50:25.000Z",
      hookEventName: "Stop",
      sessionId: "session-tester-reused",
      turnId: "turn-tester-old",
      transcriptPath: testerTranscriptPath,
      payload: { model: "gpt-5.4-mini", last_assistant_message: "旧轮 tester 结束。" }
    },
    {
      capturedAt: "2026-03-29T05:50:40.000Z",
      hookEventName: "SessionStart",
      sessionId: "session-coder-3",
      turnId: null,
      transcriptPath: coderTranscriptPath,
      payload: { model: "gpt-5.4-mini" }
    },
    {
      capturedAt: "2026-03-29T05:50:42.000Z",
      hookEventName: "UserPromptSubmit",
      sessionId: "session-coder-3",
      turnId: "turn-coder-new",
      transcriptPath: coderTranscriptPath,
      payload: { model: "gpt-5.4-mini", prompt: "开始新的 coder 任务" }
    },
    {
      capturedAt: "2026-03-29T05:50:55.000Z",
      hookEventName: "Stop",
      sessionId: "session-coder-3",
      turnId: "turn-coder-new",
      transcriptPath: coderTranscriptPath,
      payload: { model: "gpt-5.4-mini", last_assistant_message: "新的 coder 实现完成。" }
    },
    {
      capturedAt: "2026-03-29T05:51:10.000Z",
      hookEventName: "UserPromptSubmit",
      sessionId: "session-tester-reused",
      turnId: "turn-tester-new",
      transcriptPath: testerTranscriptPath,
      payload: { model: "gpt-5.4-mini", prompt: "复用 tester session，跑 coder 后验证" }
    },
    {
      capturedAt: "2026-03-29T05:51:25.000Z",
      hookEventName: "Stop",
      sessionId: "session-tester-reused",
      turnId: "turn-tester-new",
      transcriptPath: testerTranscriptPath,
      payload: { model: "gpt-5.4-mini", last_assistant_message: "coder 后 tester 验证完成。" }
    }
  ]);

  writeJsonl(runtimeHooksPath, []);

  const report = runLogAnalysis(logsDir);
  const issue = report.anomalies.handoffIssues.find((item) => item.type === "coder_without_tester");

  assert.equal(issue, undefined, "expected no coder_without_tester when downstream tester turn exists");
}

testImportedLogAnalysisDetectsKeySignals();
testOlderTesterDoesNotSatisfyLaterCoder();
testReusedTesterSessionAfterCoderCountsAsDownstreamTester();
process.stdout.write("log analysis smoke tests passed\n");
