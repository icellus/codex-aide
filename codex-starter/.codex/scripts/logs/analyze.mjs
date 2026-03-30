#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getProjectContext } from "../shared/project-context.mjs";

const SCRIPT_PATH = ".codex/scripts/logs/analyze.mjs";

const DEFAULT_THRESHOLDS = {
  readHeavyToolThreshold: 12,
  readHeavyReadCommandThreshold: 8,
  memoLengthThreshold: 700
};

const ISO_DAY_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:\.part-(\d{3}))?\.jsonl$/;

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      `  node ${SCRIPT_PATH} [--logs <path>] [--codex-hooks <file|dir>] [--runtime-hooks <file|dir>] [--json]`,
      "",
      "Options:",
      "  --logs <path>                             Path to `.codex/logs` or an imported logs directory",
      "  --codex-hooks <file|dir>                  Codex hooks JSONL file or codex-hooks directory",
      "  --runtime-hooks <file|dir>                Runtime hooks JSONL file or runtime-hooks directory",
      "  --json                                    Print JSON only",
      "  --read-heavy-tool-threshold <number>      Default: 12",
      "  --read-heavy-read-command-threshold <n>   Default: 8",
      "  --memo-length-threshold <number>          Default: 700",
      "  --help                                    Show this help"
    ].join("\n") + "\n"
  );
}

function parseNumberArg(name, value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${name}: ${value}`);
  }
  return parsed || fallback;
}

function parseArgs(argv) {
  const options = {
    logsPath: null,
    codexHooksInput: null,
    runtimeHooksInput: null,
    jsonOnly: false,
    thresholds: { ...DEFAULT_THRESHOLDS }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--json") {
      options.jsonOnly = true;
      continue;
    }

    if (token === "--logs") {
      options.logsPath = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (token === "--codex-hooks") {
      options.codexHooksInput = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (token === "--runtime-hooks") {
      options.runtimeHooksInput = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (token === "--read-heavy-tool-threshold") {
      options.thresholds.readHeavyToolThreshold = parseNumberArg(
        token,
        argv[index + 1],
        DEFAULT_THRESHOLDS.readHeavyToolThreshold
      );
      index += 1;
      continue;
    }

    if (token === "--read-heavy-read-command-threshold") {
      options.thresholds.readHeavyReadCommandThreshold = parseNumberArg(
        token,
        argv[index + 1],
        DEFAULT_THRESHOLDS.readHeavyReadCommandThreshold
      );
      index += 1;
      continue;
    }

    if (token === "--memo-length-threshold") {
      options.thresholds.memoLengthThreshold = parseNumberArg(
        token,
        argv[index + 1],
        DEFAULT_THRESHOLDS.memoLengthThreshold
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function normalizePath(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function listJsonlByLatestDay(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return [];
  }

  const entries = fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => {
      const match = name.match(ISO_DAY_PATTERN);
      if (!match) {
        return null;
      }
      return {
        name,
        fullPath: path.join(dirPath, name),
        day: match[1],
        part: Number.parseInt(match[2] || "0", 10)
      };
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return [];
  }

  const latestDay = entries.reduce((maxDay, entry) => (entry.day > maxDay ? entry.day : maxDay), entries[0].day);
  return entries
    .filter((entry) => entry.day === latestDay)
    .sort((left, right) => left.part - right.part)
    .map((entry) => entry.fullPath);
}

function resolveHooksInput(inputPath, preferredSubdir) {
  const normalized = normalizePath(inputPath);
  if (!normalized) {
    return [];
  }

  if (!fs.existsSync(normalized)) {
    return [];
  }

  const stat = fs.statSync(normalized);
  if (stat.isFile()) {
    return normalized.endsWith(".jsonl") ? [normalized] : [];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const base = path.basename(normalized);
  if (base === preferredSubdir) {
    return listJsonlByLatestDay(normalized);
  }

  const nested = path.join(normalized, preferredSubdir);
  if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
    return listJsonlByLatestDay(nested);
  }

  return listJsonlByLatestDay(normalized);
}

function resolveLogFiles(options, projectDir) {
  const logsPath = options.logsPath ? normalizePath(options.logsPath) : path.join(projectDir, ".codex", "logs");

  const codexHookFiles = options.codexHooksInput
    ? resolveHooksInput(options.codexHooksInput, "codex-hooks")
    : resolveHooksInput(logsPath, "codex-hooks");

  const runtimeHookFiles = options.runtimeHooksInput
    ? resolveHooksInput(options.runtimeHooksInput, "runtime-hooks")
    : resolveHooksInput(logsPath, "runtime-hooks");

  return {
    codexHookFiles,
    runtimeHookFiles,
    logsPath
  };
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function readJsonlFiles(files) {
  const entries = [];
  const parseErrors = [];

  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) {
        continue;
      }
      const parsed = safeJsonParse(line);
      if (!parsed) {
        parseErrors.push({ filePath, lineNumber: index + 1 });
        continue;
      }
      entries.push({ filePath, lineNumber: index + 1, data: parsed });
    }
  }

  return { entries, parseErrors };
}

function countBy(list, keyGetter) {
  const result = {};
  for (const item of list) {
    const key = String(keyGetter(item) || "unknown");
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function groupBy(list, keyGetter) {
  const result = new Map();
  for (const item of list) {
    const key = String(keyGetter(item));
    if (!result.has(key)) {
      result.set(key, []);
    }
    result.get(key).push(item);
  }
  return result;
}

function toMillis(value) {
  const millis = Date.parse(String(value || ""));
  return Number.isFinite(millis) ? millis : null;
}

function safeDurationSeconds(startValue, endValue) {
  const start = toMillis(startValue);
  const end = toMillis(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return Number((end - start) / 1000).toFixed(3);
}

function extractCommand(entry) {
  return String(entry?.data?.payload?.tool_input?.command || "");
}

function isReadCommand(command) {
  const text = command.trim();
  if (!text) {
    return false;
  }

  const pattern = /(^|\s)(sed|cat|nl|tail|head|less|more|find|ls|rg)(\s|$)/i;
  if (!pattern.test(text)) {
    return false;
  }

  const writePattern = /(^|\s)(rm|mv|cp|apply_patch|git\s+add|git\s+commit|git\s+push|npm\s+publish|docker\s+build)(\s|$)/i;
  return !writePattern.test(text);
}

function isDeepImplementationRead(command) {
  const text = command.trim();
  if (!isReadCommand(text)) {
    return false;
  }

  if (/\.codex\/|\.agents\/skills\//i.test(text)) {
    return false;
  }

  const implementationPathPattern =
    /(app|src|lib|service|services|infra|server|client|packages|modules)\/[^'"`\s]+(\.(js|mjs|cjs|ts|tsx|jsx|json|ya?ml|toml|py|go|rs|java|rb|php|sh))?/i;
  return implementationPathPattern.test(text);
}

function analyzeMemoRisk(replyText, threshold) {
  const text = String(replyText || "");
  const length = text.length;
  const lines = text.split(/\r?\n/);
  const bulletLines = lines.filter((line) => /^\s*-\s+/.test(line)).length;
  const linkCount = (text.match(/\]\([^)]+\)/g) || []).length;
  const sectionCount = text.split(/\n\s*\n/).filter(Boolean).length;

  const reasons = [];
  if (length >= threshold) {
    reasons.push(`reply_length>=${threshold}`);
  }
  if (bulletLines >= 6 && linkCount >= 4) {
    reasons.push("many_bullets_with_many_links");
  }
  if (sectionCount >= 6 && linkCount >= 3) {
    reasons.push("many_sections_with_link_density");
  }

  return {
    length,
    bulletLines,
    linkCount,
    sectionCount,
    risky: reasons.length > 0,
    reasons
  };
}

function extractTurnSummary(turnEntries, thresholds) {
  const sorted = [...turnEntries].sort((left, right) => String(left?.data?.capturedAt || "").localeCompare(String(right?.data?.capturedAt || "")));
  const first = sorted[0]?.data?.capturedAt || null;
  const last = sorted[sorted.length - 1]?.data?.capturedAt || null;
  const sessionId = String(sorted[0]?.data?.sessionId || "");
  const turnId = String(sorted[0]?.data?.turnId || "");

  const prompts = sorted.filter((entry) => entry.data.hookEventName === "UserPromptSubmit");
  const stops = sorted.filter((entry) => entry.data.hookEventName === "Stop");
  const preTools = sorted.filter((entry) => entry.data.hookEventName === "PreToolUse");
  const postTools = sorted.filter((entry) => entry.data.hookEventName === "PostToolUse");

  const prompt = String(prompts[prompts.length - 1]?.data?.payload?.prompt || "");
  const reply = String(stops[stops.length - 1]?.data?.payload?.last_assistant_message || "");

  const commands = preTools.map((entry) => extractCommand(entry)).filter(Boolean);
  const readCommandCount = commands.filter((command) => isReadCommand(command)).length;
  const deepImplementationReadCount = commands.filter((command) => isDeepImplementationRead(command)).length;

  const models = [...new Set(sorted.map((entry) => String(entry?.data?.payload?.model || "")).filter(Boolean))];
  const toolCounts = countBy(preTools, (entry) => entry?.data?.payload?.tool_name || "unknown");
  const memoRisk = analyzeMemoRisk(reply, thresholds.memoLengthThreshold);

  const readHeavyReasons = [];
  if (preTools.length >= thresholds.readHeavyToolThreshold) {
    readHeavyReasons.push(`tool_count>=${thresholds.readHeavyToolThreshold}`);
  }
  if (readCommandCount >= thresholds.readHeavyReadCommandThreshold) {
    readHeavyReasons.push(`read_command_count>=${thresholds.readHeavyReadCommandThreshold}`);
  }
  if (deepImplementationReadCount > 0) {
    readHeavyReasons.push("deep_implementation_reads_detected");
  }

  return {
    key: `${sessionId}::${turnId}`,
    sessionId,
    turnId,
    firstCapturedAt: first,
    lastCapturedAt: last,
    durationSeconds: safeDurationSeconds(first, last),
    models,
    prompt,
    replyLength: reply.length,
    hookEventCounts: countBy(sorted, (entry) => entry.data.hookEventName),
    preToolCount: preTools.length,
    postToolCount: postTools.length,
    toolCounts,
    readCommandCount,
    deepImplementationReadCount,
    commandPreview: commands.slice(0, 8),
    readHeavy: {
      risky: readHeavyReasons.length > 0,
      reasons: readHeavyReasons
    },
    memoRisk
  };
}

function analyzePrePostMismatches(hookEntries) {
  const preEntries = hookEntries.filter((entry) => entry.data.hookEventName === "PreToolUse");
  const postEntries = hookEntries.filter((entry) => entry.data.hookEventName === "PostToolUse");

  const preById = new Map();
  const postById = new Map();

  for (const entry of preEntries) {
    const id = String(entry?.data?.payload?.tool_use_id || "");
    if (id) {
      preById.set(id, entry);
    }
  }

  for (const entry of postEntries) {
    const id = String(entry?.data?.payload?.tool_use_id || "");
    if (id) {
      postById.set(id, entry);
    }
  }

  const mismatches = [];
  for (const [toolUseId, entry] of preById.entries()) {
    if (!postById.has(toolUseId)) {
      mismatches.push({
        type: "pre_without_post",
        toolUseId,
        sessionId: entry?.data?.sessionId || null,
        turnId: entry?.data?.turnId || null,
        capturedAt: entry?.data?.capturedAt || null,
        toolName: entry?.data?.payload?.tool_name || null,
        command: extractCommand(entry) || null
      });
    }
  }

  for (const [toolUseId, entry] of postById.entries()) {
    if (!preById.has(toolUseId)) {
      mismatches.push({
        type: "post_without_pre",
        toolUseId,
        sessionId: entry?.data?.sessionId || null,
        turnId: entry?.data?.turnId || null,
        capturedAt: entry?.data?.capturedAt || null,
        toolName: entry?.data?.payload?.tool_name || null,
        command: extractCommand(entry) || null
      });
    }
  }

  return mismatches;
}

function readSessionMeta(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return {
      transcriptPath,
      exists: false,
      sessionId: null,
      role: null,
      forkedFromId: null,
      agentNickname: null
    };
  }

  const lines = fs.readFileSync(transcriptPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = safeJsonParse(trimmed);
    if (!parsed || parsed.type !== "session_meta" || !parsed.payload) {
      continue;
    }

    const payload = parsed.payload;
    const inferredRole =
      payload.agent_role || payload?.source?.subagent?.thread_spawn?.agent_role || (payload.forked_from_id ? "subagent" : "main");

    return {
      transcriptPath,
      exists: true,
      sessionId: payload.id || null,
      role: inferredRole || null,
      forkedFromId: payload.forked_from_id || null,
      agentNickname: payload.agent_nickname || null
    };
  }

  return {
    transcriptPath,
    exists: true,
    sessionId: null,
    role: null,
    forkedFromId: null,
    agentNickname: null
  };
}

function analyzeRoleTracks(hookEntries) {
  const transcriptPaths = [...new Set(hookEntries.map((entry) => String(entry?.data?.transcriptPath || "")).filter(Boolean))];
  const sessionMeta = transcriptPaths.map((transcriptPath) => readSessionMeta(transcriptPath));
  const sessionTimeById = new Map(
    summarizeSessions(hookEntries)
      .filter((entry) => entry.sessionId)
      .map((entry) => [entry.sessionId, entry])
  );
  const sessionMetaById = new Map(sessionMeta.filter((entry) => entry.sessionId).map((entry) => [entry.sessionId, entry]));
  const sessionEntriesById = groupBy(
    hookEntries.filter((entry) => String(entry?.data?.sessionId || "")),
    (entry) => entry.data.sessionId
  );

  const resolveChainRoot = (sessionId) => {
    const visited = new Set();
    let current = sessionId;

    while (current && !visited.has(current)) {
      visited.add(current);
      const meta = sessionMetaById.get(current);
      if (!meta?.forkedFromId) {
        return current;
      }
      current = meta.forkedFromId;
    }

    return sessionId || null;
  };

  const roleCounts = countBy(
    sessionMeta.filter((entry) => entry.exists && entry.role),
    (entry) => entry.role
  );

  const roleSessions = sessionMeta
    .filter((entry) => entry.exists && entry.role)
    .map((entry) => {
      const timeSummary = sessionTimeById.get(entry.sessionId) || null;
      const sessionEntries = [...(sessionEntriesById.get(String(entry.sessionId || "")) || [])].sort((left, right) =>
        String(left?.data?.capturedAt || "").localeCompare(String(right?.data?.capturedAt || ""))
      );
      const completionFromStop =
        sessionEntries
          .filter((event) => event?.data?.hookEventName === "Stop")
          .map((event) => String(event?.data?.capturedAt || ""))
          .filter(Boolean)
          .pop() || null;

      const completionAt = completionFromStop || timeSummary?.lastCapturedAt || null;
      return {
        sessionId: entry.sessionId || null,
        role: entry.role || null,
        forkedFromId: entry.forkedFromId || null,
        chainRootId: resolveChainRoot(entry.sessionId || null),
        firstCapturedAt: timeSummary?.firstCapturedAt || null,
        lastCapturedAt: timeSummary?.lastCapturedAt || null,
        firstCapturedAtMs: toMillis(timeSummary?.firstCapturedAt || null),
        lastCapturedAtMs: toMillis(timeSummary?.lastCapturedAt || null),
        completionAt,
        completionAtMs: toMillis(completionAt)
      };
    });

  const testerActivities = roleSessions
    .filter((session) => session.role === "tester")
    .flatMap((testerSession) => {
      const sessionEntries = [...(sessionEntriesById.get(String(testerSession.sessionId || "")) || [])].sort((left, right) =>
        String(left?.data?.capturedAt || "").localeCompare(String(right?.data?.capturedAt || ""))
      );

      return sessionEntries
        .filter((entry) => {
          const hookEvent = String(entry?.data?.hookEventName || "");
          if (hookEvent === "UserPromptSubmit") {
            return Boolean(entry?.data?.turnId);
          }
          return hookEvent === "Stop";
        })
        .map((entry) => ({
          type: entry?.data?.hookEventName === "UserPromptSubmit" ? "tester_turn" : "tester_stop",
          sessionId: testerSession.sessionId,
          turnId: entry?.data?.turnId || null,
          chainRootId: testerSession.chainRootId || null,
          forkedFromId: testerSession.forkedFromId || null,
          capturedAt: entry?.data?.capturedAt || null,
          capturedAtMs: toMillis(entry?.data?.capturedAt || null)
        }));
    });

  const hasSubagent = sessionMeta.some((entry) => entry.exists && (entry.forkedFromId || (entry.role && entry.role !== "main")));

  return {
    transcriptsSeen: transcriptPaths.length,
    missingTranscriptCount: sessionMeta.filter((entry) => !entry.exists).length,
    sessions: sessionMeta,
    roleSessions,
    testerActivities,
    roleCounts,
    hasSubagent
  };
}

function analyzeRuntimeSignals(runtimeEntries) {
  const eventCounts = countBy(runtimeEntries, (entry) => entry?.data?.type || "unknown");
  return {
    eventCounts,
    subagentResultCount: eventCounts.subagent_result || 0,
    taskSettledCount: eventCounts.task_settled || 0
  };
}

function buildHandoffIssues(roleTracks, runtimeSignals) {
  const issues = [];
  const coderCount = roleTracks.roleCounts.coder || 0;
  const testerSessions = (roleTracks.roleSessions || []).filter((session) => session.role === "tester");
  const testerActivities = roleTracks.testerActivities || [];
  const coderSessions = (roleTracks.roleSessions || []).filter((session) => session.role === "coder");

  const sameChain = (left, right) => {
    if (left?.chainRootId && right?.chainRootId) {
      return left.chainRootId === right.chainRootId;
    }
    if (left?.forkedFromId && right?.forkedFromId) {
      return left.forkedFromId === right.forkedFromId;
    }
    return true;
  };

  const hasDownstreamTester = (coderSession) => {
    const coderEndMs = Number.isFinite(coderSession?.completionAtMs)
      ? coderSession.completionAtMs
      : Number.isFinite(coderSession?.lastCapturedAtMs)
        ? coderSession.lastCapturedAtMs
      : coderSession?.firstCapturedAtMs;

    return testerActivities.some((activity) => {
      if (!sameChain(coderSession, activity)) {
        return false;
      }

      if (Number.isFinite(coderEndMs) && Number.isFinite(activity?.capturedAtMs)) {
        return activity.capturedAtMs > coderEndMs;
      }

      return false;
    });
  };

  const codersWithoutDownstreamTester = coderSessions.filter((coderSession) => !hasDownstreamTester(coderSession));

  if (coderCount > 0 && codersWithoutDownstreamTester.length > 0) {
    issues.push({
      type: "coder_without_tester",
      severity: "high",
      message: "Detected coder session(s) without downstream tester follow-up.",
      coderSessions: coderCount,
      testerSessions: testerSessions.length,
      testerActivities: testerActivities.length,
      affectedCoderSessions: codersWithoutDownstreamTester.map((session) => ({
        sessionId: session.sessionId,
        chainRootId: session.chainRootId,
        firstCapturedAt: session.firstCapturedAt,
        lastCapturedAt: session.lastCapturedAt,
        completionAt: session.completionAt
      }))
    });
  }

  if (roleTracks.hasSubagent && runtimeSignals.subagentResultCount === 0) {
    issues.push({
      type: "runtime_missing_subagent_result",
      severity: "medium",
      message: "Subagent sessions were detected, but runtime logs have no subagent_result event."
    });
  }

  if (roleTracks.hasSubagent && runtimeSignals.taskSettledCount === 0) {
    issues.push({
      type: "runtime_missing_task_settled",
      severity: "medium",
      message: "Subagent sessions were detected, but runtime logs have no task_settled event."
    });
  }

  return issues;
}

function summarizeSessions(hookEntries) {
  const bySession = groupBy(
    hookEntries.filter((entry) => String(entry?.data?.sessionId || "")),
    (entry) => entry.data.sessionId
  );

  return [...bySession.entries()].map(([sessionId, entries]) => {
    const sorted = [...entries].sort((left, right) => String(left?.data?.capturedAt || "").localeCompare(String(right?.data?.capturedAt || "")));
    const first = sorted[0]?.data?.capturedAt || null;
    const last = sorted[sorted.length - 1]?.data?.capturedAt || null;
    const turns = [...new Set(sorted.map((entry) => String(entry?.data?.turnId || "")).filter(Boolean))];
    const models = [...new Set(sorted.map((entry) => String(entry?.data?.payload?.model || "")).filter(Boolean))];
    const preCount = sorted.filter((entry) => entry.data.hookEventName === "PreToolUse").length;
    const postCount = sorted.filter((entry) => entry.data.hookEventName === "PostToolUse").length;

    return {
      sessionId,
      firstCapturedAt: first,
      lastCapturedAt: last,
      durationSeconds: safeDurationSeconds(first, last),
      models,
      turnCount: turns.length,
      hookEventCounts: countBy(sorted, (entry) => entry.data.hookEventName),
      preToolCount: preCount,
      postToolCount: postCount
    };
  });
}

export function analyzeLogBundle({ codexHookFiles, runtimeHookFiles, thresholds = DEFAULT_THRESHOLDS }) {
  const hookRead = readJsonlFiles(codexHookFiles);
  const runtimeRead = readJsonlFiles(runtimeHookFiles);

  const hookEntries = hookRead.entries;
  const runtimeEntries = runtimeRead.entries;

  const turnGroups = groupBy(
    hookEntries.filter((entry) => String(entry?.data?.turnId || "")),
    (entry) => `${entry.data.sessionId || "unknown"}::${entry.data.turnId || "unknown"}`
  );
  const turns = [...turnGroups.values()].map((entries) => extractTurnSummary(entries, thresholds));

  const prePostMismatches = analyzePrePostMismatches(hookEntries);
  const readHeavyTurns = turns.filter((turn) => turn.readHeavy.risky);
  const memoRiskTurns = turns.filter((turn) => turn.memoRisk.risky);
  const roleTracks = analyzeRoleTracks(hookEntries);
  const runtimeSignals = analyzeRuntimeSignals(runtimeEntries);
  const handoffIssues = buildHandoffIssues(roleTracks, runtimeSignals);

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      codexHookFiles,
      runtimeHookFiles
    },
    parseErrors: {
      codexHooks: hookRead.parseErrors,
      runtimeHooks: runtimeRead.parseErrors
    },
    summary: {
      codexHookEntryCount: hookEntries.length,
      runtimeHookEntryCount: runtimeEntries.length,
      sessionCount: summarizeSessions(hookEntries).length,
      turnCount: turns.length,
      codexHookEventCounts: countBy(hookEntries, (entry) => entry?.data?.hookEventName || "unknown"),
      runtimeEventCounts: countBy(runtimeEntries, (entry) => entry?.data?.type || "unknown")
    },
    sessions: summarizeSessions(hookEntries),
    turns,
    anomalies: {
      prePostMismatches,
      readHeavyTurns,
      memoRiskTurns,
      handoffIssues
    },
    tracks: {
      subagents: roleTracks,
      runtimeSignals
    }
  };
}

function buildTextSummary(analysis) {
  const lines = [];
  const { summary, anomalies, tracks } = analysis;

  lines.push("Log Analysis Summary");
  lines.push(`- codex hooks entries: ${summary.codexHookEntryCount}`);
  lines.push(`- runtime hooks entries: ${summary.runtimeHookEntryCount}`);
  lines.push(`- sessions: ${summary.sessionCount}`);
  lines.push(`- turns: ${summary.turnCount}`);
  lines.push(
    `- anomalies: pre/post mismatch=${anomalies.prePostMismatches.length}, read-heavy turns=${anomalies.readHeavyTurns.length}, memo-risk turns=${anomalies.memoRiskTurns.length}, handoff issues=${anomalies.handoffIssues.length}`
  );

  if (tracks.subagents.hasSubagent) {
    lines.push(`- subagent tracks detected: yes (${JSON.stringify(tracks.subagents.roleCounts)})`);
  } else {
    lines.push("- subagent tracks detected: no");
  }

  if (anomalies.handoffIssues.length > 0) {
    lines.push("");
    lines.push("Key Issues");
    for (const issue of anomalies.handoffIssues) {
      lines.push(`- [${issue.severity}] ${issue.type}: ${issue.message}`);
    }
  }

  if (anomalies.prePostMismatches.length > 0) {
    lines.push("");
    lines.push("Pre/Post Mismatch Samples");
    for (const mismatch of anomalies.prePostMismatches.slice(0, 5)) {
      lines.push(
        `- ${mismatch.type} ${mismatch.sessionId || "unknown"}::${mismatch.turnId || "unknown"} tool_use_id=${
          mismatch.toolUseId
        }`
      );
    }
  }

  return lines.join("\n");
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return 0;
  }

  const projectDir = getProjectContext({ cwd: process.cwd() }).projectDir;
  const resolved = resolveLogFiles(options, projectDir);

  if (resolved.codexHookFiles.length === 0 && resolved.runtimeHookFiles.length === 0) {
    throw new Error(`No JSONL logs found under ${resolved.logsPath}`);
  }

  const analysis = analyzeLogBundle({
    codexHookFiles: resolved.codexHookFiles,
    runtimeHookFiles: resolved.runtimeHookFiles,
    thresholds: options.thresholds
  });

  if (options.jsonOnly) {
    process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`${buildTextSummary(analysis)}\n\n`);
  process.stdout.write("JSON Output\n");
  process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
  return 0;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  try {
    const code = runCli();
    process.exit(code);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
