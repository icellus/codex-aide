import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

let activeRuntimeLogger = null;
const migratedLegacyRuntimeLogs = new Set();

function invalidJsonInputError(error) {
  const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
  return new Error(`Invalid JSON input${detail}`);
}

async function readRawStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonStdinEnvelope(options = {}) {
  const strict = Boolean(options?.strict);
  const raw = await readRawStdin();
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      raw,
      value: {},
      parseError: null
    };
  }

  try {
    return {
      raw,
      value: JSON.parse(trimmed),
      parseError: null
    };
  } catch (error) {
    if (!strict) {
      return {
        raw,
        value: {},
        parseError: null
      };
    }

    return {
      raw,
      value: {},
      parseError: invalidJsonInputError(error)
    };
  }
}

export async function readJsonStdin(options = {}) {
  const envelope = await readJsonStdinEnvelope(options);
  if (envelope.parseError) {
    throw envelope.parseError;
  }
  return envelope.value;
}

function normalizeProjectDirCandidate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function projectDirCandidates(input = {}) {
  const sources = [
    ["input.projectDir", input.projectDir],
    ["input.project_dir", input.project_dir],
    ["input.repoRoot", input.repoRoot],
    ["input.repo_root", input.repo_root],
    ["input.repoPath", input.repoPath],
    ["input.repo_path", input.repo_path],
    ["input.workdir", input.workdir],
    ["input.workspace", input.workspace],
    ["input.cwd", input.cwd],
    ["input.tool_input.projectDir", input.tool_input?.projectDir],
    ["input.tool_input.project_dir", input.tool_input?.project_dir],
    ["input.tool_input.repoRoot", input.tool_input?.repoRoot],
    ["input.tool_input.repo_root", input.tool_input?.repo_root],
    ["input.tool_input.repoPath", input.tool_input?.repoPath],
    ["input.tool_input.repo_path", input.tool_input?.repo_path],
    ["input.tool_input.workdir", input.tool_input?.workdir],
    ["input.tool_input.workspace", input.tool_input?.workspace],
    ["input.tool_input.cwd", input.tool_input?.cwd]
  ];

  return sources
    .map(([source, value]) => ({
      source,
      value: normalizeProjectDirCandidate(value)
    }))
    .filter((entry) => entry.value);
}

export function getProjectContext(input = {}) {
  const envProjectDir = normalizeProjectDirCandidate(process.env.CODEX_PROJECT_DIR);
  if (envProjectDir) {
    const startPath = path.resolve(envProjectDir);
    return {
      projectDir: startPath,
      source: "env.CODEX_PROJECT_DIR",
      startPath
    };
  }

  for (const candidate of projectDirCandidates(input)) {
    const startPath = path.resolve(candidate.value);
    return {
      projectDir: findProjectDir(startPath) || startPath,
      source: candidate.source,
      startPath
    };
  }

  const startPath = process.cwd();
  return {
    projectDir: findProjectDir(startPath) || startPath,
    source: "process.cwd",
    startPath
  };
}

export function getProjectDir(input = {}) {
  return getProjectContext(input).projectDir;
}

function findProjectDir(start) {
  let current = path.resolve(start);

  for (let i = 0; i < 5; i += 1) {
    if (fs.existsSync(path.join(current, ".codex"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function normalizeArtifactField(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toUpperCase() === "N/A" || /^\[[^\]]+\]$/.test(raw)) {
    return null;
  }
  return raw;
}

function extractPlanPath(block) {
  return normalizeArtifactField(
    block.match(/\*\*Implementation Plan\*\*:\s*`([^`]+)`/)?.[1] ||
      block.match(/- Implementation Plan:\s*`([^`]+)`/)?.[1] ||
      null
  );
}

function extractSummaryPath(block) {
  return normalizeArtifactField(
    block.match(/- Plan Summary:\s*`([^`]+)`/)?.[1] ||
      block.match(/\*\*Plan Summary\*\*:\s*`([^`]+)`/)?.[1] ||
      null
  );
}

function stripHtmlComments(text) {
  return String(text || "").replace(/<!--[\s\S]*?-->/g, "");
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeLogValue(value) {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function serializeRuntimeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || ""
    };
  }

  return {
    name: "Error",
    message: String(error),
    stack: ""
  };
}

function normalizeRuntimeLogChunk(chunk, encoding) {
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString(typeof encoding === "string" ? encoding : "utf8");
  }

  return String(chunk ?? "");
}

function legacyRuntimeLogPath(projectDir) {
  return path.join(projectDir, ".codex", "logs", "runtime-hooks.jsonl");
}

function runtimeLogDay(timestamp = new Date().toISOString()) {
  return String(timestamp || new Date().toISOString()).slice(0, 10) || "unknown-date";
}

function runtimeLogDir(projectDir) {
  const logDir = path.join(projectDir, ".codex", "logs", "runtime-hooks");
  ensureDir(logDir);
  return logDir;
}

function escapeRegExpLiteral(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runtimeLogPartName(day, partIndex) {
  return partIndex === 0 ? `${day}.jsonl` : `${day}.part-${String(partIndex).padStart(3, "0")}.jsonl`;
}

function runtimeLogPathForPart(projectDir, day, partIndex) {
  return path.join(runtimeLogDir(projectDir), runtimeLogPartName(day, partIndex));
}

function parseRuntimeLogPartIndex(day, fileName) {
  if (fileName === `${day}.jsonl`) {
    return 0;
  }

  const match = fileName.match(new RegExp(`^${escapeRegExpLiteral(day)}\\.part-(\\d{3})\\.jsonl$`));
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function listRuntimeLogParts(projectDir, day) {
  const logDir = runtimeLogDir(projectDir);

  return fs
    .readdirSync(logDir)
    .map((fileName) => ({
      fileName,
      partIndex: parseRuntimeLogPartIndex(day, fileName)
    }))
    .filter((entry) => entry.partIndex !== null)
    .sort((left, right) => left.partIndex - right.partIndex)
    .map((entry) => ({
      ...entry,
      path: path.join(logDir, entry.fileName)
    }));
}

function runtimeLogMaxBytes() {
  const parsed = Number.parseInt(String(process.env.CODEX_RUNTIME_LOG_MAX_BYTES || "").trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 256 * 1024;
}

function runtimeLogPath(projectDir, timestamp = new Date().toISOString(), estimatedBytes = 0) {
  const day = runtimeLogDay(timestamp);
  const parts = listRuntimeLogParts(projectDir, day);
  if (parts.length === 0) {
    return runtimeLogPathForPart(projectDir, day, 0);
  }

  const current = parts[parts.length - 1];
  let currentSize = 0;
  try {
    currentSize = fs.statSync(current.path).size;
  } catch {
    currentSize = 0;
  }

  if (currentSize > 0 && currentSize + Math.max(0, estimatedBytes) > runtimeLogMaxBytes()) {
    return runtimeLogPathForPart(projectDir, day, current.partIndex + 1);
  }

  return current.path;
}

function runtimeLogEntryKey(entry) {
  return [
    entry?.script || "",
    entry?.invocationId || "",
    entry?.type || "",
    entry?.timestamp || "",
    entry?.pid || ""
  ].join("::");
}

function migrateLegacyRuntimeLog(projectDir) {
  const normalizedProjectDir = path.resolve(projectDir || process.cwd());
  if (migratedLegacyRuntimeLogs.has(normalizedProjectDir)) {
    return;
  }

  migratedLegacyRuntimeLogs.add(normalizedProjectDir);

  const legacyPath = legacyRuntimeLogPath(normalizedProjectDir);
  if (!fs.existsSync(legacyPath)) {
    return;
  }

  try {
    const lines = fs
      .readFileSync(legacyPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      fs.unlinkSync(legacyPath);
      return;
    }

    const groupedEntries = new Map();
    for (const line of lines) {
      const parsed = JSON.parse(line);
      const day = runtimeLogDay(parsed?.timestamp);
      const group = groupedEntries.get(day) || [];
      group.push({
        line,
        entry: parsed
      });
      groupedEntries.set(day, group);
    }

    for (const [day, entries] of groupedEntries.entries()) {
      const existingKeys = new Set();
      const partFiles = listRuntimeLogParts(normalizedProjectDir, day);

      for (const partFile of partFiles) {
        const existingLines = fs
          .readFileSync(partFile.path, "utf8")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        for (const line of existingLines) {
          try {
            existingKeys.add(runtimeLogEntryKey(JSON.parse(line)));
          } catch {
            existingKeys.add(line);
          }
        }
      }

      const pendingLines = entries
        .filter(({ entry, line }) => {
          const key = runtimeLogEntryKey(entry);
          if (existingKeys.has(key) || existingKeys.has(line)) {
            return false;
          }
          existingKeys.add(key);
          return true;
        })
        .map(({ entry }) => entry);

      for (const entry of pendingLines) {
        appendRuntimeLog(normalizedProjectDir, entry);
      }
    }

    fs.unlinkSync(legacyPath);
  } catch {
    migratedLegacyRuntimeLogs.delete(normalizedProjectDir);
  }
}

function runtimeRelativePath(projectDir, filePath) {
  const relative = path.relative(projectDir, filePath).replace(/\\/g, "/");
  return relative || path.basename(filePath);
}

function appendRuntimeLog(projectDir, entry, options = {}) {
  try {
    migrateLegacyRuntimeLog(projectDir);
    const timestamp = typeof entry?.timestamp === "string" && entry.timestamp ? entry.timestamp : new Date().toISOString();
    const payload = {
      ...entry,
      timestamp
    };
    const serialized = `${JSON.stringify(payload)}\n`;
    const targetPath =
      options?.logFilePath || runtimeLogPath(projectDir, timestamp, Buffer.byteLength(serialized, "utf8"));
    fs.appendFileSync(targetPath, serialized, "utf8");
  } catch {
    // 日志写入不应中断运行时主流程。
  }
}

export function startRuntimeInvocationLogging({ projectDir, scriptName, input = {}, rawInput = "", metadata = {} }) {
  const normalizedProjectDir = path.resolve(projectDir || process.cwd());
  const invocationId = `${new Date().toISOString()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = Date.now();
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let finished = false;
  let restoreStreams = null;
  let logFilePath = null;

  const append = (entry) => {
    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      invocationId,
      script: scriptName,
      pid: process.pid,
      ...entry
    };

    if (!logFilePath) {
      const serialized = `${JSON.stringify(payload)}\n`;
      logFilePath = runtimeLogPath(normalizedProjectDir, timestamp, Buffer.byteLength(serialized, "utf8"));
    }

    appendRuntimeLog(normalizedProjectDir, payload, { logFilePath });
  };

  append({
    type: "invocation_start",
    cwd: String(input?.cwd || process.cwd()),
    projectDir: normalizedProjectDir,
    nodeVersion: process.version,
    rawInput: String(rawInput || ""),
    input: sanitizeLogValue(input),
    metadata: sanitizeLogValue(metadata)
  });

  const captureProcessStreams = () => {
    if (restoreStreams) {
      return restoreStreams;
    }

    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    process.stdout.write = function patchedStdoutWrite(chunk, encoding, callback) {
      stdoutBuffer += normalizeRuntimeLogChunk(chunk, encoding);
      return originalStdoutWrite(chunk, encoding, callback);
    };

    process.stderr.write = function patchedStderrWrite(chunk, encoding, callback) {
      stderrBuffer += normalizeRuntimeLogChunk(chunk, encoding);
      return originalStderrWrite(chunk, encoding, callback);
    };

    restoreStreams = () => {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      return null;
    };

    return restoreStreams;
  };

  const logger = {
    invocationId,
    projectDir: normalizedProjectDir,
    scriptName,
    captureProcessStreams,
    logFileWrite(filePath, content, details = {}) {
      append({
        type: "file_write",
        target: runtimeRelativePath(normalizedProjectDir, filePath),
        content: sanitizeLogValue(content),
        details: sanitizeLogValue(details)
      });
    },
    finalize({ status = "ok", error = null, metadata: finalMetadata = {} } = {}) {
      if (finished) {
        return;
      }

      finished = true;
      append({
        type: "invocation_finish",
        status,
        durationMs: Date.now() - startedAt,
        output: {
          stdout: stdoutBuffer,
          stderr: stderrBuffer
        },
        error: error ? serializeRuntimeError(error) : null,
        metadata: sanitizeLogValue(finalMetadata)
      });

      if (activeRuntimeLogger === logger) {
        activeRuntimeLogger = null;
      }
    }
  };

  activeRuntimeLogger = logger;
  return logger;
}

export function logRuntimeFileWrite(projectDir, filePath, content, details = {}) {
  if (!activeRuntimeLogger) {
    return;
  }

  const normalizedProjectDir = path.resolve(projectDir || process.cwd());
  if (activeRuntimeLogger.projectDir !== normalizedProjectDir) {
    return;
  }

  activeRuntimeLogger.logFileWrite(filePath, content, details);
}

function normalizeWorkflowToken(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || fallback;
}

function normalizeWorkflowChainId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeWorkflowPathReference(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeWorkflowReason(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function inferWorkflowPhase(source, currentChain, fallback) {
  const explicit = normalizeWorkflowToken(source.phase, "");
  if (explicit) {
    return explicit;
  }

  if (currentChain === "tester_blocked") {
    return "tester";
  }

  if (currentChain === "settlement_blocked") {
    const requiredHandoff = normalizeWorkflowToken(source.required_handoff, "none");
    return requiredHandoff === "tester" ? "coder" : fallback;
  }

  return currentChain || fallback;
}

export function createEmptyTaskWorkflowState() {
  return {
    phase: "idle",
    chain_id: null,
    workflow_chain_id: null,
    current_chain: "idle",
    expected_next_step: "none",
    required_handoff: "none",
    required_handoff_task_id: null,
    settlement_guard: "none",
    settlement_guard_reason: "",
    updated_at: null
  };
}

export function normalizeTaskWorkflowState(value = {}) {
  const empty = createEmptyTaskWorkflowState();
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const currentChain = normalizeWorkflowToken(source.current_chain, empty.current_chain);
  const phase = inferWorkflowPhase(source, currentChain, empty.phase);
  const requiredHandoff = normalizeWorkflowToken(source.required_handoff, empty.required_handoff);
  const settlementGuard = normalizeWorkflowToken(source.settlement_guard, empty.settlement_guard);
  const chainId = normalizeWorkflowChainId(source.chain_id ?? source.workflow_chain_id);

  return {
    phase,
    chain_id: chainId,
    workflow_chain_id: chainId,
    current_chain: currentChain,
    expected_next_step: normalizeWorkflowToken(source.expected_next_step, empty.expected_next_step),
    required_handoff: requiredHandoff,
    required_handoff_task_id:
      requiredHandoff === "none" ? null : normalizeWorkflowChainId(source.required_handoff_task_id),
    settlement_guard: settlementGuard,
    settlement_guard_reason: settlementGuard === "none" ? "" : normalizeWorkflowReason(source.settlement_guard_reason),
    updated_at: normalizeWorkflowPathReference(source.updated_at)
  };
}

export function createEmptyTaskContext() {
  return {
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
      open_questions: [],
      workflow: createEmptyTaskWorkflowState()
    }
  };
}

export function createEmptyRepoContext() {
  return {
    version: 1,
    updated_at: null,
    scan_status: "not-scanned",
    project_type: "Unknown",
    scale: "Unknown",
    primary_languages: [],
    frameworks: [],
    repo_shape: "",
    ci_or_deployment_signals: [],
    release_path: "",
    validation_signals: [],
    notes: []
  };
}

export function createEmptyDeliveryPolicy() {
  return {
    version: 1,
    status: "starter-default",
    ownership: {
      maintained_by: "/Aide",
      purpose: "submit orchestration and guarded post-validation delivery defaults",
      notes: [
        "/submit owns commit, push, and optional post-push delivery stages.",
        "The project itself still owns real CI, release, and notification integrations."
      ]
    },
    submit: {
      enabled: true,
      queue_after: {
        tester_complete_without_qc: true,
        qc_pass_after_tester: true,
        task_settled_without_qc: true,
        task_settled_after_qc: true
      }
    },
    commit: {
      mode: "ask_once",
      protected_branches: ["main", "master"],
      blocked_branches: [],
      allow_current_branch_prefixes: ["feat/", "fix/", "chore/", "refactor/"],
      create_branch_when_needed: "ask",
      max_auto_commits_per_task: 1,
      allow_amend: false,
      message_template: "{type}: {summary}"
    },
    push: {
      mode: "ask_once",
      allowed_remotes: ["origin"],
      default_remote: "origin",
      set_upstream: "ask",
      create_remote_branch_when_missing: "ask",
      stop_on_rejection: true
    },
    notify: {
      enabled: false,
      trigger: "after_push",
      channels: []
    },
    ci: {
      enabled: false,
      source: "project-signals",
      mode: "report-only"
    },
    release: {
      enabled: false,
      mode: "report-only",
      targets: []
    },
    fallback: {
      on_missing_config: "skip-step",
      on_environment_blocker: "report-and-stop",
      on_repeat_failure: "report-and-stop",
      on_partial_delivery: "report-current-state"
    }
  };
}

export function createEmptyState() {
  return {
    version: 1,
    updatedAt: null,
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
      lastReminderText: ""
    }
  };
}

export function createEmptyTaskRegistry() {
  return {
    version: 1,
    updatedAt: null,
    currentTaskId: null,
    tasks: []
  };
}

export function createEmptyEvolutionRegistry() {
  return {
    version: 1,
    updatedAt: null,
    lastSweep: {
      checkedAt: null,
      trigger: null,
      background: false,
      candidateCount: 0,
      settledTaskCount: 0,
      note: ""
    },
    candidates: [],
    settledTaskReviews: []
  };
}

function loadJsonFile(filePath, fallbackFactory) {
  if (!fs.existsSync(filePath)) {
    return fallbackFactory();
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackFactory();
  }
}

function normalizeSubmitQueueAfter(queueAfter) {
  const source = queueAfter && typeof queueAfter === "object" && !Array.isArray(queueAfter) ? queueAfter : {};
  const normalized = { ...source };
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(source, key);

  if (!hasOwn("tester_complete_without_qc") && hasOwn("coder_complete_without_qc")) {
    normalized.tester_complete_without_qc = source.coder_complete_without_qc;
  }

  if (!hasOwn("qc_pass_after_tester") && hasOwn("qc_pass_after_coder")) {
    normalized.qc_pass_after_tester = source.qc_pass_after_coder;
  }

  return normalized;
}

export function loadRuntimeState(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const statePath = path.join(stateDir, "runtime-state.json");

  ensureDir(stateDir);

  if (!fs.existsSync(statePath)) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const emptyState = createEmptyState();
    return {
      ...emptyState,
      ...parsed,
      qualityMetrics: {
        ...emptyState.qualityMetrics,
        ...(parsed.qualityMetrics || {}),
        qcByPhase: {
          tester: {
            ...emptyState.qualityMetrics.qcByPhase.tester,
            ...(parsed.qualityMetrics?.qcByPhase?.tester || {})
          },
          coder: {
            ...emptyState.qualityMetrics.qcByPhase.coder,
            ...(parsed.qualityMetrics?.qcByPhase?.coder || {})
          },
          manual: {
            ...emptyState.qualityMetrics.qcByPhase.manual,
            ...(parsed.qualityMetrics?.qcByPhase?.manual || {})
          }
        }
      },
      sessionContext: {
        ...emptyState.sessionContext,
        ...(parsed.sessionContext || {})
      }
    };
  } catch {
    return createEmptyState();
  }
}

export function saveRuntimeState(projectDir, state) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const statePath = path.join(stateDir, "runtime-state.json");

  ensureDir(stateDir);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, statePath, state, {
    category: "state",
    writer: "saveRuntimeState",
    format: "json"
  });
}

export function loadDeliveryPolicy(projectDir) {
  const policyPath = path.join(projectDir, ".codex", "delivery-policy.json");
  const parsed = loadJsonFile(policyPath, createEmptyDeliveryPolicy);
  const emptyPolicy = createEmptyDeliveryPolicy();
  const parsedSubmitQueueAfter = normalizeSubmitQueueAfter(parsed.submit?.queue_after);

  return {
    ...emptyPolicy,
    ...parsed,
    ownership: {
      ...emptyPolicy.ownership,
      ...(parsed.ownership || {})
    },
    submit: {
      ...emptyPolicy.submit,
      ...(parsed.submit || {}),
      queue_after: {
        ...emptyPolicy.submit.queue_after,
        ...parsedSubmitQueueAfter
      }
    },
    commit: {
      ...emptyPolicy.commit,
      ...(parsed.commit || {})
    },
    push: {
      ...emptyPolicy.push,
      ...(parsed.push || {})
    },
    notify: {
      ...emptyPolicy.notify,
      ...(parsed.notify || {})
    },
    ci: {
      ...emptyPolicy.ci,
      ...(parsed.ci || {})
    },
    release: {
      ...emptyPolicy.release,
      ...(parsed.release || {})
    },
    fallback: {
      ...emptyPolicy.fallback,
      ...(parsed.fallback || {})
    }
  };
}

export function loadTaskRegistry(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const registryPath = path.join(stateDir, "task-registry.json");

  ensureDir(stateDir);

  if (!fs.existsSync(registryPath)) {
    return createEmptyTaskRegistry();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const emptyRegistry = createEmptyTaskRegistry();
    return {
      ...emptyRegistry,
      ...parsed,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter((item) => item && typeof item === "object") : []
    };
  } catch {
    return createEmptyTaskRegistry();
  }
}

export function saveTaskRegistry(projectDir, registry) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const registryPath = path.join(stateDir, "task-registry.json");

  ensureDir(stateDir);
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, registryPath, registry, {
    category: "state",
    writer: "saveTaskRegistry",
    format: "json"
  });
}

export function loadTaskContext(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const taskContextPath = path.join(stateDir, "task-context.json");

  ensureDir(stateDir);

  const parsed = loadJsonFile(taskContextPath, createEmptyTaskContext);
  const empty = createEmptyTaskContext();
  const nextTask = {
    ...empty.task,
    ...(parsed.task || {})
  };
  nextTask.workflow = normalizeTaskWorkflowState({
    ...empty.task.workflow,
    ...(nextTask.workflow || {})
  });

  return {
    ...empty,
    ...parsed,
    collaboration: {
      ...empty.collaboration,
      ...(parsed.collaboration || {})
    },
    task: nextTask
  };
}

export function saveTaskContext(projectDir, taskContext) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const taskContextPath = path.join(stateDir, "task-context.json");
  const empty = createEmptyTaskContext();
  const current = loadTaskContext(projectDir);
  const incomingTask = (taskContext && taskContext.task) || {};
  const mergedWorkflow = normalizeTaskWorkflowState({
    ...(current.task?.workflow || {}),
    ...(incomingTask.workflow || {})
  });
  const merged = {
    ...empty,
    ...current,
    ...(taskContext || {}),
    collaboration: {
      ...empty.collaboration,
      ...(current.collaboration || {}),
      ...((taskContext && taskContext.collaboration) || {})
    },
    task: {
      ...empty.task,
      ...(current.task || {}),
      ...incomingTask,
      workflow: mergedWorkflow
    }
  };

  ensureDir(stateDir);
  fs.writeFileSync(taskContextPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, taskContextPath, merged, {
    category: "state",
    writer: "saveTaskContext",
    format: "json"
  });
}

export function loadRepoContext(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const repoContextPath = path.join(stateDir, "repo-context.json");

  ensureDir(stateDir);

  const parsed = loadJsonFile(repoContextPath, createEmptyRepoContext);
  const empty = createEmptyRepoContext();

  return {
    ...empty,
    ...parsed,
    primary_languages: Array.isArray(parsed.primary_languages) ? parsed.primary_languages : [],
    frameworks: Array.isArray(parsed.frameworks) ? parsed.frameworks : [],
    ci_or_deployment_signals: Array.isArray(parsed.ci_or_deployment_signals)
      ? parsed.ci_or_deployment_signals
      : [],
    validation_signals: Array.isArray(parsed.validation_signals) ? parsed.validation_signals : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : []
  };
}

export function saveRepoContext(projectDir, repoContext) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const repoContextPath = path.join(stateDir, "repo-context.json");
  const empty = createEmptyRepoContext();
  const merged = {
    ...empty,
    ...(repoContext || {}),
    primary_languages: Array.isArray(repoContext?.primary_languages) ? repoContext.primary_languages : [],
    frameworks: Array.isArray(repoContext?.frameworks) ? repoContext.frameworks : [],
    ci_or_deployment_signals: Array.isArray(repoContext?.ci_or_deployment_signals)
      ? repoContext.ci_or_deployment_signals
      : [],
    validation_signals: Array.isArray(repoContext?.validation_signals) ? repoContext.validation_signals : [],
    notes: Array.isArray(repoContext?.notes) ? repoContext.notes : []
  };

  ensureDir(stateDir);
  fs.writeFileSync(repoContextPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, repoContextPath, merged, {
    category: "state",
    writer: "saveRepoContext",
    format: "json"
  });
}

export function loadEvolutionRegistry(projectDir) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const registryPath = path.join(stateDir, "evolution-registry.json");

  ensureDir(stateDir);

  if (!fs.existsSync(registryPath)) {
    return createEmptyEvolutionRegistry();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const emptyRegistry = createEmptyEvolutionRegistry();
    return {
      ...emptyRegistry,
      ...parsed,
      lastSweep: {
        ...emptyRegistry.lastSweep,
        ...(parsed.lastSweep || {})
      },
      candidates: Array.isArray(parsed.candidates)
        ? parsed.candidates.filter((item) => item && typeof item === "object")
        : [],
      settledTaskReviews: Array.isArray(parsed.settledTaskReviews)
        ? parsed.settledTaskReviews.filter((item) => item && typeof item === "object")
        : []
    };
  } catch {
    return createEmptyEvolutionRegistry();
  }
}

export function saveEvolutionRegistry(projectDir, registry) {
  const stateDir = path.join(projectDir, ".codex", "state");
  const registryPath = path.join(stateDir, "evolution-registry.json");

  ensureDir(stateDir);
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
  logRuntimeFileWrite(projectDir, registryPath, registry, {
    category: "state",
    writer: "saveEvolutionRegistry",
    format: "json"
  });
}

function normalizeProfileValue(value) {
  return String(value || "").replace(/`/g, "").trim();
}

function normalizeDeliveryModeValue(value) {
  const normalized = normalizeProfileValue(value);
  const legacy = normalized.toLowerCase();

  if (legacy === "direct") {
    return "lightweight";
  }

  if (legacy === "plan-driven") {
    return "standard";
  }

  if (legacy === "orchestrated") {
    return "long-running";
  }

  return normalized;
}

function normalizeEnabledModuleValue(value) {
  const normalized = normalizeProfileValue(value);
  const legacy = normalized.toLowerCase();
  if (legacy === "direct implementation" || legacy === "lightweight implementation") {
    return "lightweight execution";
  }
  return normalized;
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeProfileValue(item)).filter(Boolean);
  }

  const normalized = normalizeProfileValue(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readProfileField(text, label) {
  const prefix = `- ${label}:`;
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix));
  if (!line) {
    return "";
  }
  return line.slice(prefix.length).trim();
}

function parseProfileList(value) {
  return normalizeProfileValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapTaskContextToProfile(parsed = {}) {
  const empty = createEmptyTaskContext();
  const collaboration = {
    ...empty.collaboration,
    ...(parsed.collaboration || {})
  };
  const task = {
    ...empty.task,
    ...(parsed.task || {})
  };
  const workflow = normalizeTaskWorkflowState(task.workflow);

  return {
    task: normalizeProfileValue(task.current_task) || null,
    taskStatus: normalizeProfileValue(task.status) || "idle",
    taskClass: normalizeProfileValue(task.class) || null,
    riskLevel: normalizeProfileValue(task.risk) || null,
    deliveryMode: normalizeDeliveryModeValue(task.delivery_mode) || null,
    routeRationale: normalizeProfileValue(task.route_rationale) || null,
    routingOverrides: normalizeListValue(task.routing_overrides),
    enabledRoles: normalizeListValue(task.enabled_roles),
    enabledModules: normalizeListValue(task.enabled_modules).map((item) => normalizeEnabledModuleValue(item)),
    qcPolicy: normalizeProfileValue(task.qc_policy) || null,
    submitPolicy: normalizeProfileValue(task.submit_policy) || null,
    validationProfileStatus: normalizeProfileValue(task.validation_profile_status) || null,
    openQuestions: normalizeListValue(task.open_questions),
    workflow,
    workflowPhase: workflow.phase,
    workflowChainId: workflow.chain_id,
    workflowCurrentChain: workflow.current_chain,
    workflowExpectedNextStep: workflow.expected_next_step,
    workflowRequiredHandoff: workflow.required_handoff,
    workflowRequiredHandoffTaskId: workflow.required_handoff_task_id,
    workflowSettlementGuard: workflow.settlement_guard,
    workflowSettlementGuardReason: workflow.settlement_guard_reason,
    preferredAddress: normalizeProfileValue(collaboration.preferred_address) || "Boss",
    greetingStyle: normalizeProfileValue(collaboration.greeting_style) || "warm",
    firstStartupGreetingCompleted: Boolean(collaboration.first_startup_greeting_completed)
  };
}

export function loadProjectProfileState(projectDir) {
  const emptyWorkflow = createEmptyTaskWorkflowState();
  const taskContextPath = path.join(projectDir, ".codex", "state", "task-context.json");
  if (fs.existsSync(taskContextPath)) {
    return mapTaskContextToProfile(loadTaskContext(projectDir));
  }

  const profilePath = path.join(projectDir, ".codex", "project-profile.md");
  if (!fs.existsSync(profilePath)) {
    return {
      task: null,
      taskStatus: "idle",
      taskClass: null,
      riskLevel: null,
      deliveryMode: null,
      enabledRoles: [],
      enabledModules: [],
      qcPolicy: null,
      submitPolicy: null,
      validationProfileStatus: null,
      workflow: emptyWorkflow,
      workflowPhase: emptyWorkflow.phase,
      workflowChainId: emptyWorkflow.chain_id,
      workflowCurrentChain: emptyWorkflow.current_chain,
      workflowExpectedNextStep: emptyWorkflow.expected_next_step,
      workflowRequiredHandoff: emptyWorkflow.required_handoff,
      workflowRequiredHandoffTaskId: emptyWorkflow.required_handoff_task_id,
      workflowSettlementGuard: emptyWorkflow.settlement_guard,
      workflowSettlementGuardReason: emptyWorkflow.settlement_guard_reason,
      preferredAddress: "Boss",
      greetingStyle: "warm",
      firstStartupGreetingCompleted: false,
      openQuestions: []
    };
  }

  const text = fs.readFileSync(profilePath, "utf8");
  return {
    task: normalizeProfileValue(readProfileField(text, "Current task")) || null,
    taskStatus: normalizeProfileValue(readProfileField(text, "Task status")) || "idle",
    taskClass: normalizeProfileValue(readProfileField(text, "Task class")) || null,
    riskLevel: normalizeProfileValue(readProfileField(text, "Risk level")) || null,
    deliveryMode: normalizeDeliveryModeValue(readProfileField(text, "Selected delivery mode")) || null,
    routeRationale: normalizeProfileValue(readProfileField(text, "Route rationale")) || null,
    enabledRoles: parseProfileList(readProfileField(text, "Enabled roles")),
    enabledModules: parseProfileList(readProfileField(text, "Enabled modules")),
    qcPolicy: normalizeProfileValue(readProfileField(text, "QC policy")) || null,
    submitPolicy: normalizeProfileValue(readProfileField(text, "Submit policy")) || null,
    validationProfileStatus: normalizeProfileValue(readProfileField(text, "Validation profile status")) || null,
    workflow: emptyWorkflow,
    workflowPhase: emptyWorkflow.phase,
    workflowChainId: emptyWorkflow.chain_id,
    workflowCurrentChain: emptyWorkflow.current_chain,
    workflowExpectedNextStep: emptyWorkflow.expected_next_step,
    workflowRequiredHandoff: emptyWorkflow.required_handoff,
    workflowRequiredHandoffTaskId: emptyWorkflow.required_handoff_task_id,
    workflowSettlementGuard: emptyWorkflow.settlement_guard,
    workflowSettlementGuardReason: emptyWorkflow.settlement_guard_reason,
    preferredAddress: normalizeProfileValue(readProfileField(text, "Preferred address")) || "Boss",
    greetingStyle: normalizeProfileValue(readProfileField(text, "Greeting style")) || "warm",
    firstStartupGreetingCompleted:
      normalizeProfileValue(readProfileField(text, "First startup greeting completed")).toLowerCase() === "yes",
    openQuestions: parseProfileList(readProfileField(text, "Open questions"))
  };
}

export function isQcEnabled(profile = {}) {
  const qcPolicy = String(profile.qcPolicy || "").toLowerCase();
  if (qcPolicy === "enabled" || qcPolicy === "required") {
    return true;
  }

  return Array.isArray(profile.enabledModules)
    ? profile.enabledModules.some((item) => /(^|\/)qc\b|quality gate/i.test(String(item)))
    : false;
}

export function isSubmitEnabled(profile = {}, deliveryPolicy = null) {
  const submitPolicy = String(profile.submitPolicy || "").toLowerCase();
  if (submitPolicy === "enabled" || submitPolicy === "required") {
    return true;
  }

  if (submitPolicy === "disabled") {
    return false;
  }

  if (
    Array.isArray(profile.enabledModules) &&
    profile.enabledModules.some((item) => /(^|\/)submit\b|governed submit|delivery/i.test(String(item)))
  ) {
    return true;
  }

  return deliveryPolicy?.submit?.enabled !== false;
}

export function isTaskSettled(profile = {}) {
  const taskStatus = String(profile.taskStatus || "").toLowerCase();
  return taskStatus === "done" || taskStatus === "idle";
}

export function isLongRunningProfile(profile = {}) {
  return normalizeDeliveryModeValue(profile.deliveryMode).toLowerCase() === "long-running";
}

export function isOrchestratedProfile(profile = {}) {
  return isLongRunningProfile(profile);
}

export function findProgressFile(startDir) {
  let current = path.resolve(startDir || process.cwd());

  for (let i = 0; i < 5; i += 1) {
    const direct = path.join(current, "PROGRESS.md");
    if (fs.existsSync(direct)) {
      return direct;
    }

    const plans = path.join(current, "plans", "PROGRESS.md");
    if (fs.existsSync(plans)) {
      return plans;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

export function parseActivePlans(progressPath) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return [];
  }

  const text = fs.readFileSync(progressPath, "utf8");
  const sectionMatch = text.match(/## (?:Current|Active) Work([\s\S]*?)(?:\n---\s*\n\s*## |\n## |\n##$|$)/);
  if (!sectionMatch) {
    return [];
  }

  return stripHtmlComments(sectionMatch[1])
    .split(/\n(?=### )/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("### "))
    .map((block) => {
      const title = block.match(/^###\s+(.+)$/m)?.[1]?.trim() || "Unknown Plan";
      const planPath = extractPlanPath(block);
      const summaryPath = extractSummaryPath(block);
      const branch = normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null);
      const worktree = normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null);

      return {
        title,
        planPath,
        summaryPath,
        branch,
        worktree
      };
    })
    .filter((item) => item.planPath || item.branch || item.worktree);
}

function extractSectionBody(text, sectionNamePattern) {
  const match = String(text || "").match(
    new RegExp(`## ${sectionNamePattern}([\\s\\S]*?)(?:\\n---\\s*\\n\\s*## |\\n## |\\n##$|$)`)
  );
  return match?.[1] || "";
}

function splitProgressBlocks(sectionBody) {
  return stripHtmlComments(sectionBody)
    .split(/\n(?=### )/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("### "));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBulletField(block, label) {
  return normalizeArtifactField(block.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "m"))?.[1] || null);
}

function extractTitle(block) {
  return normalizeArtifactField(block.match(/^###\s+(.+)$/m)?.[1] || null);
}

function parseCurrentWorkItems(text) {
  return splitProgressBlocks(extractSectionBody(text, "(?:Current|Active) Work"))
    .map((block) => ({
      title: extractTitle(block),
      planPath: extractPlanPath(block),
      summaryPath: extractSummaryPath(block),
      branch: normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null),
      worktree: normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null),
      taskClass: extractBulletField(block, "Task Class"),
      deliveryMode: extractBulletField(block, "Delivery Mode"),
      status: extractBulletField(block, "Status") || "active",
      checkpoint: extractBulletField(block, "Current Checkpoint"),
      nextStep: extractBulletField(block, "Next Step")
    }))
    .filter((item) => item.title || item.planPath || item.branch || item.worktree);
}

function parseParkedWorkItems(text) {
  return splitProgressBlocks(extractSectionBody(text, "(?:Parked or Blocked|Blockers or Exceptions)"))
    .map((block) => ({
      title: extractTitle(block),
      planPath: extractPlanPath(block),
      summaryPath: extractSummaryPath(block),
      branch: normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null),
      worktree: normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null),
      status: extractBulletField(block, "Status") || "blocked",
      checkpoint: extractBulletField(block, "Current Checkpoint") || extractBulletField(block, "Checkpoint"),
      reason: extractBulletField(block, "Reason"),
      owner: extractBulletField(block, "Owner"),
      nextStep: extractBulletField(block, "Suggested Resume Point") || extractBulletField(block, "Unblock Action")
    }))
    .filter((item) => item.title || item.planPath || item.reason || item.nextStep);
}

function parseCompletedWorkItems(text) {
  return splitProgressBlocks(extractSectionBody(text, "(?:Completed|Completed Releases or Milestones)"))
    .map((block) => ({
      title: extractTitle(block),
      planPath: extractPlanPath(block),
      summaryPath: extractSummaryPath(block),
      completedAt: extractBulletField(block, "Completed"),
      summary: extractBulletField(block, "Outcome") || extractBulletField(block, "Summary"),
      validation: extractBulletField(block, "Validation"),
      nextStep: extractBulletField(block, "Follow-up")
    }))
    .filter((item) => item.title || item.planPath || item.summary);
}

export function parseProgressTasks(progressPath) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return {
      current: [],
      parked: [],
      completed: []
    };
  }

  const text = fs.readFileSync(progressPath, "utf8");
  return {
    current: parseCurrentWorkItems(text),
    parked: parseParkedWorkItems(text),
    completed: parseCompletedWorkItems(text)
  };
}

function normalizeComparablePath(value) {
  return path.resolve(String(value || "")).replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
}

function resolveWorkflowPath(projectDir, value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw || raw.toUpperCase() === "N/A") {
    return null;
  }

  if (path.isAbsolute(raw)) {
    return path.resolve(raw);
  }

  return path.resolve(projectDir, raw);
}

function pathContains(parentPath, childPath) {
  if (!parentPath || !childPath) {
    return false;
  }

  const parent = normalizeComparablePath(parentPath);
  const child = normalizeComparablePath(childPath);
  return child === parent || child.startsWith(`${parent}/`);
}

function currentGitBranch(cwd) {
  if (!cwd || !fs.existsSync(cwd)) {
    return null;
  }

  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

export function resolveActivePlan(activePlans, input = {}, projectDir) {
  if (!Array.isArray(activePlans) || activePlans.length === 0) {
    return null;
  }

  const explicitBrief = [input.brief_path, input.briefPath, input.brief]
    .map((value) => String(value || "").trim())
    .find(Boolean);

  if (explicitBrief) {
    const exact = activePlans.filter((item) => item.planPath === explicitBrief);
    if (exact.length === 1) {
      return exact[0];
    }

    const byBase = activePlans.filter(
      (item) => item.planPath && basenameLabel(item.planPath) === basenameLabel(explicitBrief)
    );
    if (byBase.length === 1) {
      return byBase[0];
    }
  }

  const cwd = input.cwd ? path.resolve(String(input.cwd)) : null;
  if (cwd) {
    const worktreeMatches = activePlans.filter((item) => {
      const worktreePath = resolveWorkflowPath(projectDir, item.worktree);
      return worktreePath ? pathContains(worktreePath, cwd) : false;
    });

    if (worktreeMatches.length === 1) {
      return worktreeMatches[0];
    }

    const branch = currentGitBranch(cwd);
    if (branch) {
      const branchMatches = activePlans.filter((item) => item.branch === branch);
      if (branchMatches.length === 1) {
        return branchMatches[0];
      }
    }
  }

  if (activePlans.length === 1) {
    return activePlans[0];
  }

  return null;
}

function slugifyTaskValue(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task";
}

function createTaskMatchKey(entry = {}) {
  const titleKey = slugifyTaskValue(entry.title || entry.task || entry.currentTask || "untitled-task");
  const branchKey = normalizeText(entry.branch).toLowerCase();
  const worktreeKey = normalizeText(entry.worktree).toLowerCase();
  return `task:${titleKey}|branch:${branchKey || "none"}|worktree:${worktreeKey || "none"}`;
}

function createTaskId(matchKey, sequence) {
  const base = slugifyTaskValue(matchKey.replace(/^[^:]+:/, ""));
  return `${base}-${sequence}`;
}

function normalizeTaskStatus(value, fallback = "active") {
  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === "done" || normalized === "completed" || normalized === "complete") {
    return "done";
  }

  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (normalized === "parked") {
    return "parked";
  }

  if (normalized === "queued" || normalized === "not-started") {
    return "queued";
  }

  if (normalized === "active" || normalized === "in-progress" || normalized === "in progress") {
    return "active";
  }

  if (normalized === "idle") {
    return "done";
  }

  return fallback;
}

function isOpenTaskStatus(status) {
  return status === "active" || status === "parked" || status === "blocked" || status === "queued";
}

function hasUnsettledStatus(task = {}) {
  return isOpenTaskStatus(normalizeTaskStatus(task.status, "active"));
}

function compareTaskTimestamps(left, right) {
  const leftTime = new Date(left?.updatedAt || left?.lastSeenAt || left?.createdAt || 0).getTime();
  const rightTime = new Date(right?.updatedAt || right?.lastSeenAt || right?.createdAt || 0).getTime();
  return rightTime - leftTime;
}

function nextTaskSequence(registry, matchKey) {
  return (
    registry.tasks.filter((item) => item.matchKey === matchKey).length + 1
  );
}

function findLatestTaskIndex(registry, matchKey, preferOpen) {
  let bestIndex = -1;
  let bestTask = null;

  registry.tasks.forEach((task, index) => {
    if (task.matchKey !== matchKey) {
      return;
    }

    if (preferOpen && !hasUnsettledStatus(task)) {
      return;
    }

    if (!bestTask || compareTaskTimestamps(task, bestTask) < 0) {
      bestTask = task;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function writeTaskField(target, key, value) {
  if (value === undefined) {
    return;
  }

  if (typeof value === "string") {
    target[key] = normalizeText(value) || null;
    return;
  }

  target[key] = value ?? null;
}

function sortAndTrimRegistry(registry) {
  registry.tasks.sort(compareTaskTimestamps);
  registry.tasks = registry.tasks.slice(0, 200);
}

export function upsertTaskRegistryTask(registry, entry = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const title = normalizeText(entry.title || entry.task || entry.currentTask || "") || "Untitled task";
  const matchKey = normalizeText(entry.matchKey) || createTaskMatchKey({ ...entry, title });
  const status = normalizeTaskStatus(entry.status, "active");

  let index = -1;

  if (entry.id) {
    index = registry.tasks.findIndex((task) => task.id === entry.id);
  }

  if (index < 0 && options.preferCurrentTaskId && registry.currentTaskId) {
    index = registry.tasks.findIndex((task) => task.id === registry.currentTaskId);
  }

  if (index < 0 && matchKey) {
    index = findLatestTaskIndex(registry, matchKey, true);
  }

  if (index < 0 && matchKey && options.allowSettledUpdate) {
    index = findLatestTaskIndex(registry, matchKey, false);
  }

  const existing =
    index >= 0
      ? registry.tasks[index]
      : {
          id: createTaskId(matchKey, nextTaskSequence(registry, matchKey)),
          matchKey,
          title,
          status,
          createdAt: entry.createdAt || now,
          updatedAt: now,
          startedAt: isOpenTaskStatus(status) ? entry.startedAt || now : null,
          completedAt: status === "done" || status === "cancelled" ? entry.completedAt || now : null
        };

  const next = {
    ...existing,
    title,
    matchKey,
    status,
    updatedAt: now,
    lastSeenAt: entry.lastSeenAt || now
  };

  if (!next.createdAt) {
    next.createdAt = entry.createdAt || now;
  }

  if (isOpenTaskStatus(status)) {
    next.startedAt = next.startedAt || entry.startedAt || now;
    next.completedAt = null;
  }

  if (status === "done" || status === "cancelled") {
    next.completedAt = entry.completedAt || next.completedAt || now;
  }

  writeTaskField(next, "taskClass", entry.taskClass);
  writeTaskField(next, "deliveryMode", entry.deliveryMode);
  writeTaskField(next, "risk", entry.risk);
  writeTaskField(next, "routeRationale", entry.routeRationale);
  writeTaskField(next, "planPath", entry.planPath);
  writeTaskField(next, "summaryPath", entry.summaryPath);
  writeTaskField(next, "branch", entry.branch);
  writeTaskField(next, "worktree", entry.worktree);
  writeTaskField(next, "checkpoint", entry.checkpoint);
  writeTaskField(next, "nextStep", entry.nextStep);
  writeTaskField(next, "reason", entry.reason);
  writeTaskField(next, "owner", entry.owner);
  writeTaskField(next, "summary", entry.summary);
  writeTaskField(next, "validation", entry.validation);
  writeTaskField(next, "source", entry.source || existing.source || null);

  if (index >= 0) {
    registry.tasks[index] = next;
  } else {
    registry.tasks.push(next);
  }

  if (options.setCurrent && hasUnsettledStatus(next)) {
    registry.currentTaskId = next.id;
  }

  if ((status === "done" || status === "cancelled") && registry.currentTaskId === next.id) {
    registry.currentTaskId = null;
  }

  sortAndTrimRegistry(registry);

  return next;
}

function parkTaskIfNeeded(registry, taskId, reason, now) {
  if (!taskId) {
    return null;
  }

  const index = registry.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) {
    return null;
  }

  const task = registry.tasks[index];
  if (!hasUnsettledStatus(task) || normalizeTaskStatus(task.status, "active") !== "active") {
    return task;
  }

  registry.tasks[index] = {
    ...task,
    status: "parked",
    reason: task.reason || reason,
    updatedAt: now,
    lastSeenAt: now
  };

  sortAndTrimRegistry(registry);
  return registry.tasks[index];
}

export function getCurrentTaskRecord(registry) {
  if (!registry?.currentTaskId) {
    return null;
  }

  return registry.tasks.find((task) => task.id === registry.currentTaskId) || null;
}

export function listTaskRegistryTasks(registry, predicate = null) {
  const tasks = Array.isArray(registry?.tasks) ? [...registry.tasks] : [];
  const filtered = predicate ? tasks.filter(predicate) : tasks;
  return filtered.sort(compareTaskTimestamps);
}

function normalizeTaskId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function resolveActiveTask(registry, input = {}, projectDir = process.cwd()) {
  const tasks = listTaskRegistryTasks(registry, (task) => hasUnsettledStatus(task));
  const explicitTaskId = [input.task_id, input.taskId, input.current_task_id, input.currentTaskId]
    .map((value) => normalizeTaskId(value))
    .find(Boolean);

  if (explicitTaskId) {
    const explicitMatch = (Array.isArray(registry?.tasks) ? registry.tasks : []).find((task) => task.id === explicitTaskId);
    if (explicitMatch) {
      return explicitMatch;
    }
  }

  const currentTask = getCurrentTaskRecord(registry);
  if (currentTask && hasUnsettledStatus(currentTask)) {
    return currentTask;
  }

  const cwd = input.cwd ? path.resolve(String(input.cwd)) : null;
  if (cwd) {
    const worktreeMatches = tasks.filter((task) => {
      const worktreePath = resolveWorkflowPath(projectDir, task.worktree);
      return worktreePath ? pathContains(worktreePath, cwd) : false;
    });

    if (worktreeMatches.length === 1) {
      return worktreeMatches[0];
    }

    const branch = currentGitBranch(cwd);
    if (branch) {
      const branchMatches = tasks.filter((task) => task.branch === branch);
      if (branchMatches.length === 1) {
        return branchMatches[0];
      }
    }
  }

  return tasks.length === 1 ? tasks[0] : null;
}

export function syncTaskRegistry(projectDir, input = {}) {
  const now = input.now || new Date().toISOString();
  const persist = input.persist !== false;
  const profile = input.profile || loadProjectProfileState(projectDir);
  const runtimeState = input.runtimeState || null;
  const registry = input.registry || loadTaskRegistry(projectDir);
  const progressPath =
    input.progressPath === undefined ? findProgressFile(projectDir) : input.progressPath;
  const progressTasks = input.progressTasks || parseProgressTasks(progressPath);

  const previousCurrentId = registry.currentTaskId || null;
  let nextCurrentId = null;
  let currentMatchKey = null;

  if (profile.task) {
    const profileStatus = normalizeTaskStatus(profile.taskStatus, "active");
    const currentTask = upsertTaskRegistryTask(
      registry,
      {
        title: profile.task,
        status: profileStatus,
        taskClass: profile.taskClass,
        deliveryMode: profile.deliveryMode,
        risk: profile.riskLevel,
        routeRationale: profile.routeRationale,
        source: "task-context"
      },
      {
        now,
        allowSettledUpdate: profileStatus === "done"
      }
    );

    currentMatchKey = currentTask.matchKey;
    if (hasUnsettledStatus(currentTask)) {
      nextCurrentId = currentTask.id;
    }
  }

  progressTasks.current.forEach((item, index) => {
    const entryMatchKey = createTaskMatchKey(item);
    const shouldBeCurrent =
      currentMatchKey
        ? entryMatchKey === currentMatchKey
        : progressTasks.current.length === 1 && index === 0;
    const normalizedStatus = shouldBeCurrent ? "active" : "parked";
    const task = upsertTaskRegistryTask(
      registry,
      {
        ...item,
        status: normalizedStatus,
        reason: shouldBeCurrent ? undefined : "Tracked in PROGRESS but not selected as the current hot task.",
        source: "progress"
      },
      {
        now
      }
    );

    if (!nextCurrentId && shouldBeCurrent && hasUnsettledStatus(task)) {
      nextCurrentId = task.id;
      currentMatchKey = task.matchKey;
    }
  });

  progressTasks.parked.forEach((item) => {
    upsertTaskRegistryTask(
      registry,
      {
        ...item,
        status: normalizeTaskStatus(item.status, "blocked"),
        source: "progress"
      },
      {
        now
      }
    );
  });

  progressTasks.completed.forEach((item) => {
    upsertTaskRegistryTask(
      registry,
      {
        ...item,
        status: "done",
        source: "progress"
      },
      {
        now,
        allowSettledUpdate: true
      }
    );
  });

  if (Array.isArray(runtimeState?.completedTasks)) {
    runtimeState.completedTasks.forEach((item) => {
      upsertTaskRegistryTask(
        registry,
        {
          id: item.taskId,
          title: item.task,
          planPath: item.planPath,
          deliveryMode: item.deliveryMode,
          summary: item.summary,
          status: "done",
          completedAt: item.completedAt,
          source: "runtime-state"
        },
        {
          now,
          allowSettledUpdate: true
        }
      );
    });
  }

  if (nextCurrentId) {
    const nextCurrentTask = registry.tasks.find((task) => task.id === nextCurrentId);
    if (!nextCurrentTask || !hasUnsettledStatus(nextCurrentTask)) {
      nextCurrentId = null;
    }
  }

  if (previousCurrentId && nextCurrentId && previousCurrentId !== nextCurrentId) {
    parkTaskIfNeeded(registry, previousCurrentId, "Superseded by a newer active task before normal closure.", now);
  } else if (previousCurrentId && !nextCurrentId) {
    parkTaskIfNeeded(registry, previousCurrentId, "Hot task cleared without explicit closure.", now);
  }

  registry.currentTaskId = nextCurrentId;
  registry.updatedAt = now;
  sortAndTrimRegistry(registry);
  if (persist) {
    saveTaskRegistry(projectDir, registry);
  }
  return registry;
}

const GOVERNANCE_SEVERITY_ORDER = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4
};

export function normalizeGovernanceSeverity(value, fallback = "L2") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "L1" || normalized === "L2" || normalized === "L3" || normalized === "L4") {
    return normalized;
  }
  return fallback;
}

export function compareGovernanceSeverity(left, right) {
  return (
    (GOVERNANCE_SEVERITY_ORDER[normalizeGovernanceSeverity(right, "L1")] || 0) -
    (GOVERNANCE_SEVERITY_ORDER[normalizeGovernanceSeverity(left, "L1")] || 0)
  );
}

export function highestGovernanceSeverity(values = [], fallback = "L2") {
  const normalized = Array.isArray(values)
    ? values.map((item) => normalizeGovernanceSeverity(item, fallback))
    : [];

  if (normalized.length === 0) {
    return fallback;
  }

  return normalized.sort(compareGovernanceSeverity)[0];
}

export function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

export function compactText(value, maxLength = 240) {
  const normalized = normalizeText(value).replace(/\n+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function extractStructuredResult(message) {
  const text = String(message || "");

  const previousNonEmptyLine = (source, position) => {
    if (!source) {
      return "";
    }
    const prefix = source.slice(0, Math.max(0, position));
    const lines = prefix.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = String(lines[index] || "").trim();
      if (line) {
        return line;
      }
    }
    return "";
  };

  const isExampleMarkerLine = (line) => {
    const normalized = String(line || "")
      .trim()
      .replace(/^[>*+\-\s]+/, "")
      .trim();
    if (!normalized) {
      return false;
    }

    if (
      /^(example(?:\s+output|\s+result)?|sample(?:\s+output|\s+result)?|for example|e\.g\.|示例(?:输出|结果)?|样例(?:输出|结果)?|例如|参考示例)\s*[:：]?$/i.test(
        normalized
      )
    ) {
      return true;
    }

    return /(?:example output|sample output|示例输出|样例输出|示例结果|样例结果)/i.test(normalized);
  };

  const parseCandidates = (candidates = []) => {
    const parsedCandidates = [];

    for (const candidate of candidates) {
      const block = candidate?.block;
      try {
        const parsedValue = JSON.parse(block);
        if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
          parsedCandidates.push({
            value: parsedValue,
            isExample: Boolean(candidate?.isExample)
          });
        }
      } catch {
        continue;
      }
    }

    if (parsedCandidates.length === 0) {
      return null;
    }

    const nonExample = parsedCandidates.filter((item) => !item.isExample);
    const pool = nonExample.length > 0 ? nonExample : parsedCandidates;
    return pool[pool.length - 1].value;
  };

  const structuredCandidates = [...text.matchAll(/## Structured Result[\s\S]*?```json\s*([\s\S]*?)```/gi)].map(
    (match) => {
      const position = Number.isFinite(match.index) ? match.index : 0;
      return {
        block: match[1],
        isExample: isExampleMarkerLine(previousNonEmptyLine(text, position))
      };
    }
  );
  const structuredParsed = parseCandidates(structuredCandidates);
  if (structuredParsed) {
    return structuredParsed;
  }

  const fallbackCandidates = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((match) => {
    const position = Number.isFinite(match.index) ? match.index : 0;
    return {
      block: match[1],
      isExample: isExampleMarkerLine(previousNonEmptyLine(text, position))
    };
  });
  return parseCandidates(fallbackCandidates);
}

function extractStructuredResultFromRequiredSection(message) {
  const text = String(message || "");
  const sectionMatch = text.match(/(^|\n)\s*##\s*Structured Result\b([\s\S]*?)(?=\n\s*##\s+[^\n]+|\s*$)/i);

  if (!sectionMatch) {
    return {
      hasSection: false,
      structured: null
    };
  }

  const sectionBody = String(sectionMatch[2] || "");
  const candidates = [...sectionBody.matchAll(/```json\s*([\s\S]*?)```/gi)].map((match) => match[1]);

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(candidates[index]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          hasSection: true,
          structured: parsed
        };
      }
    } catch {
      continue;
    }
  }

  return {
    hasSection: true,
    structured: null
  };
}

function normalizeStructuredRole(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  if (raw === "qc_reviewer") {
    return "qc";
  }

  if (raw === "submit_worker") {
    return "submit";
  }

  return raw;
}

function normalizeStructuredBriefPath(structured) {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return "";
  }

  for (const candidate of [structured.brief_path, structured.briefPath, structured.brief]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

export function validateStructuredResultContract(role, message) {
  const normalizedRole = normalizeStructuredRole(role);
  if (normalizedRole !== "coder" && normalizedRole !== "tester") {
    return {
      ok: true,
      code: "",
      reason: "",
      structured: null
    };
  }

  const strictStructured = extractStructuredResultFromRequiredSection(message);

  if (!strictStructured.hasSection) {
    return {
      ok: false,
      code: "missing_structured_result_section",
      reason: `${normalizedRole} handoff missing required "## Structured Result" section.`,
      structured: null
    };
  }

  const structured = strictStructured.structured;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return {
      ok: false,
      code: "invalid_structured_result_json",
      reason: `${normalizedRole} handoff has no valid JSON object in the structured result section.`,
      structured: null
    };
  }

  const structuredRole = normalizeStructuredRole(structured.role);
  if (!structuredRole) {
    return {
      ok: false,
      code: "missing_structured_result_role",
      reason: `${normalizedRole} structured result must include role.`,
      structured
    };
  }

  if (structuredRole !== normalizedRole) {
    return {
      ok: false,
      code: "structured_result_role_mismatch",
      reason: `${normalizedRole} structured result role mismatch: got "${structuredRole}".`,
      structured
    };
  }

  const status = String(structured.status || "").trim().toLowerCase();
  if (status !== "complete" && status !== "blocked") {
    return {
      ok: false,
      code: "invalid_structured_result_status",
      reason: `${normalizedRole} structured result status must be "complete" or "blocked".`,
      structured
    };
  }

  const legacyScopeKeys = ["story_path", "storyPath", "story"];
  const legacyScopeKey = legacyScopeKeys.find((key) => Object.prototype.hasOwnProperty.call(structured, key));
  if (legacyScopeKey) {
    return {
      ok: false,
      code: "legacy_structured_scope_key",
      reason: `${normalizedRole} structured result uses deprecated scope key "${legacyScopeKey}".`,
      structured
    };
  }

  if (structured.needs_qc !== true) {
    return {
      ok: false,
      code: "structured_result_needs_qc_not_true",
      reason: `${normalizedRole} structured result must set needs_qc: true.`,
      structured
    };
  }

  if (status === "complete" && !normalizeStructuredBriefPath(structured)) {
    return {
      ok: false,
      code: "missing_structured_result_brief_path",
      reason: `${normalizedRole} structured result must include a non-empty brief_path to the active Implementation Brief (任务实施说明).`,
      structured
    };
  }

  return {
    ok: true,
    code: "",
    reason: "",
    structured
  };
}

export function detectSubagentStatus(agentType, message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  const explicitStatus = String(structured?.status || "").toLowerCase();

  if (explicitStatus === "complete" || explicitStatus === "blocked" || explicitStatus === "other") {
    return explicitStatus;
  }

  if (/blocked|阻塞|需要帮助|human intervention/i.test(text)) {
    return "blocked";
  }

  if (
    /Implementation Complete|实现完成|tests written|testing complete|测试编写完成|已完成测试|Submit complete|delivery complete|交付完成|推送完成/i.test(text)
  ) {
    return "complete";
  }

  return "other";
}

export function detectQcPass(message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  const verdict = String(structured?.verdict || "").toUpperCase();
  if (verdict === "PASS" || verdict === "PASS WITH WARNINGS") {
    return true;
  }
  if (!/\bQC\b|Overall Verdict:/i.test(text)) {
    return false;
  }
  return /QC 检查通过|QC passed|QC pass|Overall Verdict:\s*PASS(?: WITH WARNINGS)?\b/i.test(text);
}

export function detectQcFail(message) {
  const text = normalizeText(message);
  const structured = extractStructuredResult(message);
  if (String(structured?.verdict || "").toUpperCase() === "FAIL") {
    return true;
  }
  if (!/\bQC\b|Overall Verdict:/i.test(text)) {
    return false;
  }
  return /QC 检查失败|QC failure|QC failed|QC fail|Overall Verdict:\s*FAIL\b/i.test(text);
}

export function detectQcPhase(message) {
  const structured = extractStructuredResult(message);
  const structuredPhase = String(structured?.phase || "").toLowerCase();
  if (structuredPhase === "tester" || structuredPhase === "coder") {
    return structuredPhase;
  }

  const text = normalizeText(message);
  const match = text.match(/(?:--phase=|phase\s*[:=]\s*|trigger phase\s*[:=]\s*)(tester|coder)/i);
  return match ? match[1].toLowerCase() : null;
}

export function detectTaskCompletionMessage(message) {
  const text = normalizeText(message);
  return /(?:task status:\s*done|final status:\s*done|task complete|task completed|completed the task|任务完成|已完成当前任务)/i.test(text);
}

export function detectFailureCategories(message) {
  const text = normalizeText(message);
  const keywordText = text
    .replace(/"[^"\n]*"/g, " ")
    .replace(/“[^”\n]*”/g, " ")
    .replace(/'[^'\n]*'/g, " ")
    .replace(/`[^`\n]*`/g, " ");
  const categories = new Set();
  const structured = extractStructuredResult(message);

  if (Array.isArray(structured?.categories)) {
    for (const category of structured.categories) {
      const normalized = String(category || "").trim();
      if (normalized) {
        categories.add(normalized);
      }
    }
  }

  if (/TODO|FIXME|placeholder/i.test(keywordText)) {
    categories.add("placeholder");
  }
  if (/假测试|FAKE TEST|fake test/i.test(keywordText)) {
    categories.add("fake-test");
  }
  if (/缺失测试|MISSING TEST/i.test(keywordText)) {
    categories.add("missing-test");
  }
  if (/未实现|NOT IMPLEMENTED|missing implementation/i.test(keywordText)) {
    categories.add("missing-implementation");
  }
  if (/Plan 对齐问题|plan mismatch|plan align|Implementation Plan mismatch/i.test(keywordText)) {
    categories.add("plan-mismatch");
  }
  if (/错误处理|error handling/i.test(keywordText)) {
    categories.add("error-handling");
  }
  if (/shared protocol|交接协议|interface between roles/i.test(keywordText)) {
    categories.add("shared-protocol");
  }
  if (/environment mismatch|connection refused|postgres service|CI missing/i.test(keywordText)) {
    categories.add("environment-mismatch");
  }

  return Array.from(categories);
}

export function suggestedRoutesForCategory(category) {
  switch (category) {
    case "placeholder":
      return [".codex/agents/coder.toml", ".codex/skills/qc/SKILL.md"];
    case "fake-test":
    case "missing-test":
      return [".codex/agents/tester.toml", ".codex/skills/qc/SKILL.md"];
    case "missing-implementation":
    case "plan-mismatch":
    case "error-handling":
      return [".codex/agents/coder.toml", ".codex/skills/qc/SKILL.md"];
    case "shared-protocol":
      return ["AGENTS.md", ".codex/templates/progress.md"];
    case "environment-mismatch":
      return [".codex/skills/submit/SKILL.md", "AGENTS.md"];
    default:
      return [".codex/skills/qc/SKILL.md"];
  }
}

export function lessonForCategory(category) {
  switch (category) {
    case "placeholder":
      return "Placeholder comments must be treated as incomplete work and rejected before completion.";
    case "fake-test":
      return "Tests must verify behavior, not merely exercise code paths without meaningful assertions.";
    case "missing-test":
      return "Every requirement needs a real test before the testing phase is considered complete.";
    case "missing-implementation":
      return "Implementation claims must map to real behavior, not partial scaffolding.";
    case "plan-mismatch":
      return "QC should reject work that diverges from the implementation plan or acceptance criteria.";
    case "error-handling":
      return "Error handling must be explicit and verified, especially on edge and failure paths.";
    case "shared-protocol":
      return "When failures come from handoffs between roles, update shared workflow protocols, not only role docs.";
    case "environment-mismatch":
      return "Environment-specific failures should route to CI or deployment guidance before repeated coding retries.";
    default:
      return "Repeated QC failures should be captured as reusable lessons.";
  }
}

export function upsertPendingAction(state, action) {
  const index = state.pendingActions.findIndex((item) => item.id === action.id);
  if (index >= 0) {
    state.pendingActions[index] = {
      ...state.pendingActions[index],
      ...action,
      updatedAt: new Date().toISOString()
    };
    return;
  }

  state.pendingActions.push({
    ...action,
    createdAt: action.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function removePendingActions(state, predicate) {
  state.pendingActions = state.pendingActions.filter((item) => !predicate(item));
}

export function upsertLearningQueueItem(state, entry) {
  const index = state.learningQueue.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    state.learningQueue[index] = {
      ...state.learningQueue[index],
      ...entry,
      updatedAt: new Date().toISOString()
    };
    return;
  }

  state.learningQueue.push({
    ...entry,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function trimRuntimeState(state) {
  const failurePatternEntries = Object.entries(state.failurePatterns || {}).sort((left, right) => {
    const leftSeen = new Date(left[1]?.lastSeenAt || left[1]?.firstSeenAt || 0).getTime();
    const rightSeen = new Date(right[1]?.lastSeenAt || right[1]?.firstSeenAt || 0).getTime();
    return rightSeen - leftSeen;
  });

  state.recentSubagentEvents = state.recentSubagentEvents.slice(-15);
  state.pendingActions = state.pendingActions.slice(-12);
  state.learningQueue = state.learningQueue.slice(-12);
  state.completedTasks = state.completedTasks.slice(-12);
  state.qualityMetrics.recentQcRuns = state.qualityMetrics.recentQcRuns.slice(-15);
  state.failurePatterns = Object.fromEntries(failurePatternEntries.slice(0, 24));
  state.updatedAt = new Date().toISOString();
}

export function basenameLabel(value) {
  if (!value) {
    return "unknown";
  }
  return path.basename(value.replace(/\\/g, "/"));
}

export function toLessonId(source, category) {
  const raw = `${basenameLabel(source)}-${category}`.toLowerCase();
  return `lesson-${raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function summarizeRetryPattern(state, taskId) {
  const sourceTaskId = taskId || "unknown-task";
  const items = Object.values(state.failurePatterns)
    .filter((item) => item.taskId === sourceTaskId)
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  if (items.length === 0) {
    return "None";
  }

  return items.map((item) => `${item.category} x${item.count}`).join(", ");
}

function resolveTaskIdFromProgressChunk(taskRegistry, chunk) {
  if (!taskRegistry || !Array.isArray(taskRegistry.tasks)) {
    return null;
  }

  const title = extractTitle(chunk);
  const branch = normalizeArtifactField(chunk.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null);
  const worktree = normalizeArtifactField(chunk.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null);
  const openTasks = taskRegistry.tasks.filter((task) => hasUnsettledStatus(task));

  if (worktree) {
    const byWorktree = openTasks.filter((task) => normalizeText(task.worktree) === worktree);
    if (byWorktree.length === 1) {
      return byWorktree[0].id;
    }
  }

  if (branch) {
    const byBranch = openTasks.filter((task) => normalizeText(task.branch) === branch);
    if (byBranch.length === 1) {
      return byBranch[0].id;
    }
  }

  if (title) {
    const normalizedTitle = normalizeText(title).toLowerCase();
    const byTitle = openTasks.filter((task) => normalizeText(task.title).toLowerCase() === normalizedTitle);
    if (byTitle.length === 1) {
      return byTitle[0].id;
    }
  }

  return null;
}

function updateQcRetryPatternLine(block, summary) {
  const line = `- QC retry pattern: ${summary}`;

  if (/^- QC retry pattern:.*$/m.test(block)) {
    return block.replace(/^- QC retry pattern:.*$/m, line);
  }

  if (/^- Next step:.*$/m.test(block)) {
    return block.replace(/^- Next step:.*$/m, `${line}\n$&`);
  }

  if (/\*\*Notes\*\*:\s*$/m.test(block)) {
    return block.replace(/\*\*Notes\*\*:\s*$/m, `**Notes**:\n${line}`);
  }

  return `${block.trimEnd()}\n\n**Notes**:\n${line}\n`;
}

function ensureProgressSection(text, heading, emptyBody) {
  const headingPattern = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  if (headingPattern.test(text)) {
    return text;
  }

  const section = `---\n\n${heading}\n\n${emptyBody}\n`;
  const insertBefore = text.match(/^## Optional Checkpoint Guide\s*$/m);
  if (insertBefore && typeof insertBefore.index === "number") {
    const before = text.slice(0, insertBefore.index).replace(/\s*$/, "");
    const after = text.slice(insertBefore.index);
    return `${before}\n\n${section}\n${after}`;
  }

  return `${text.trimEnd()}\n\n${section}`;
}

function updateCurrentWorkSection(text, activePlans, state, taskRegistry = null) {
  const match = text.match(/(## (?:Current|Active) Work\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## Completed|\n## Completed|$)/);
  if (!match) {
    return text;
  }

  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];
  const segments = body.split(/(<!--[\s\S]*?-->)/g);

  const updatedBody = segments
    .map((segment) => {
      if (segment.startsWith("<!--")) {
        return segment;
      }

      return segment
        .split(/\n(?=### )/g)
        .map((chunk) => {
          if (!chunk.startsWith("### ")) {
            return chunk;
          }

          const taskId = resolveTaskIdFromProgressChunk(taskRegistry, chunk);
          if (!taskId) {
            return chunk;
          }

          const summary = summarizeRetryPattern(state, taskId);
          return updateQcRetryPatternLine(chunk, summary);
        })
        .join("\n");
    })
    .join("");

  return text.replace(match[0], `${prefix}${updatedBody}${suffix}`);
}

function buildLearningQueueBlock(entry) {
  const route = Array.isArray(entry.suggestedRoute)
    ? entry.suggestedRoute.join(", ")
    : String(entry.suggestedRoute || "");

  return [
    `### ${entry.id}`,
    `**Source**: \`${entry.source || "unknown"}\``,
    `**Category**: \`${entry.category}\``,
    `**Trigger Count**: ${entry.triggerCount}`,
    `**Suggested Route**: \`${route}\``,
    `**Lesson**: ${entry.lesson}`,
    `**Status**: \`${entry.status || "queued"}\``
  ].join("\n");
}

function updateLearningQueueSection(text, state) {
  const match = text.match(/(## Learning Queue \(Optional\)\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## |\n## |\s*$)/);
  if (!match) {
    return text;
  }

  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];

  const chunks = body
    .split(/\n(?=### )/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const preamble = [];
  const blockMap = new Map();
  const order = [];

  for (const chunk of chunks) {
    if (!chunk.startsWith("### ")) {
      preamble.push(chunk);
      continue;
    }

    const id = chunk.match(/^###\s+(.+)$/m)?.[1]?.trim();
    if (!id) {
      continue;
    }

    order.push(id);
    blockMap.set(id, chunk);
  }

  for (const entry of state.learningQueue) {
    const block = buildLearningQueueBlock(entry);
    if (!blockMap.has(entry.id)) {
      order.push(entry.id);
    }
    blockMap.set(entry.id, block);
  }

  if (state.learningQueue.length > 0 && blockMap.has("[lesson-slug]")) {
    blockMap.delete("[lesson-slug]");
  }

  const renderedBlocks = order
    .filter((id, index) => order.indexOf(id) === index)
    .filter((id) => blockMap.has(id))
    .map((id) => blockMap.get(id));

  const parts = [...preamble, ...renderedBlocks].filter(Boolean);
  const bodyText = parts.length > 0 ? `${parts.join("\n\n")}\n\n` : "<!-- No queued lessons -->\n\n";

  return text.replace(match[0], `${prefix}${bodyText}${suffix}`);
}

function retrospectiveSlug(taskId) {
  const raw = String(taskId || "unknown-task").toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildRetrospectiveBlock(entry, blockId) {
  const categories =
    Array.isArray(entry.categories) && entry.categories.length > 0
      ? entry.categories.map((category) => `- \`${category}\``)
      : ["- `None`"];

  return [
    `### ${blockId}`,
    `**Task ID**: \`${entry.taskId || "unknown-task"}\``,
    `**Implementation Plan**: \`${entry.planPath || "N/A"}\``,
    `**Trigger**: \`${entry.trigger || "pending"}\``,
    "**Decisions Made**:",
    "- Pending capture during the next internal long-running handoff or session close.",
    "**Wrong Assumptions**:",
    `- Prompt: ${entry.note || "Capture the assumption that failed."}`,
    "**Candidate Lessons**:",
    ...categories,
    "**Writeback Decision**: `pending retrospective`",
    `**Last Updated**: ${entry.updatedAt || entry.createdAt || "unknown"}`
  ].join("\n");
}

function parseRetrospectiveChunk(chunk) {
  return {
    id: chunk.match(/^###\s+(.+)$/m)?.[1]?.trim() || null,
    taskId: chunk.match(/\*\*Task ID\*\*:\s*`([^`]+)`/)?.[1] || null,
    writebackDecision: chunk.match(/\*\*Writeback Decision\*\*:\s*`([^`]+)`/)?.[1] || null,
    chunk
  };
}

function isPendingAutoRetrospective(parsed) {
  return (
    parsed.writebackDecision === "pending retrospective" &&
    parsed.chunk.includes("Pending capture during the next internal long-running handoff or session close.") &&
    parsed.chunk.includes("- Prompt:")
  );
}

function nextRetrospectiveId(taskId, existingIds) {
  const slug = retrospectiveSlug(taskId);
  const prefix = `retrospective-${slug}`;
  let next = 1;

  for (const id of existingIds) {
    if (id === prefix) {
      next = Math.max(next, 2);
      continue;
    }

    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      next = Math.max(next, Number(match[1]) + 1);
    }
  }

  return next === 1 ? prefix : `${prefix}-${next}`;
}

function updateSessionRetrospectiveSection(text, state) {
  const match = text.match(/(## Session Retrospective \(Optional\)\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## |\n## |\s*$)/);
  if (!match) {
    return text;
  }

  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];
  const retrospectiveEntries = state.pendingActions.filter((item) => item.type === "session_retrospective");

  const chunks = body
    .split(/\n(?=### )/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const preamble = [];
  const blockMap = new Map();
  const parsedBlocks = [];
  const order = [];

  for (const chunk of chunks) {
    if (!chunk.startsWith("### ")) {
      preamble.push(chunk);
      continue;
    }

    const parsed = parseRetrospectiveChunk(chunk);
    const id = parsed.id;
    if (!id) {
      continue;
    }

    order.push(id);
    blockMap.set(id, chunk);
    parsedBlocks.push(parsed);
  }

  for (const entry of retrospectiveEntries) {
    const entryTaskId = String(entry.taskId || "unknown-task");
    const related = parsedBlocks.filter((item) => item.taskId === entryTaskId);
    const updatable = related.find((item) => isPendingAutoRetrospective(item));
    const pendingManual = related.find(
      (item) => item.writebackDecision === "pending retrospective" && !isPendingAutoRetrospective(item)
    );

    if (pendingManual) {
      continue;
    }

    const id = updatable?.id || nextRetrospectiveId(entryTaskId, Array.from(blockMap.keys()));
    const block = buildRetrospectiveBlock(entry, id);
    if (!blockMap.has(id)) {
      order.push(id);
    }
    blockMap.set(id, block);
  }

  if (retrospectiveEntries.length > 0 && blockMap.has("[Session YYYY-MM-DD HH:MM]")) {
    blockMap.delete("[Session YYYY-MM-DD HH:MM]");
  }

  const renderedBlocks = order
    .filter((id, index) => order.indexOf(id) === index)
    .filter((id) => blockMap.has(id))
    .map((id) => blockMap.get(id));

  const parts = [...preamble, ...renderedBlocks].filter(Boolean);
  const bodyText =
    parts.length > 0
      ? `${parts.join("\n\n")}\n\n`
      : "<!-- No pending retrospective prompts -->\n\n";

  return text.replace(match[0], `${prefix}${bodyText}${suffix}`);
}

export function syncProgressFromState(progressPath, activePlans, state, taskRegistry = null) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return;
  }

  const projectDir = findProjectDir(path.dirname(progressPath)) || path.dirname(progressPath);
  const original = fs.readFileSync(progressPath, "utf8");
  const withRetryPattern = updateCurrentWorkSection(original, activePlans, state, taskRegistry);
  const withLearningQueue = updateLearningQueueSection(withRetryPattern, state);
  const withRetrospective = updateSessionRetrospectiveSection(withLearningQueue, state);

  if (withRetrospective !== original) {
    fs.writeFileSync(progressPath, withRetrospective, "utf8");
    logRuntimeFileWrite(projectDir, progressPath, withRetrospective, {
      category: "progress",
      writer: "syncProgressFromState",
      format: "text"
    });
  }
}
