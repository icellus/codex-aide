import fs from "node:fs";
import path from "node:path";

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

function runtimeLogDay(timestamp = new Date().toISOString()) {
  return String(timestamp || new Date().toISOString()).slice(0, 10) || "unknown-date";
}

function runtimeLogDir(projectDir) {
  const logDir = path.join(projectDir, ".codex", "aide", "logs", "runtime-hooks");
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
function appendRuntimeLog(projectDir, entry) {
  try {
    const timestamp = typeof entry?.timestamp === "string" && entry.timestamp ? entry.timestamp : new Date().toISOString();
    const payload = {
      ...entry,
      timestamp
    };
    const serialized = `${JSON.stringify(payload)}\n`;
    const targetPath = runtimeLogPath(projectDir, timestamp, Buffer.byteLength(serialized, "utf8"));
    fs.appendFileSync(targetPath, serialized, "utf8");
  } catch {
    // Logging failure must not interrupt the runtime control path.
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

  const append = (entry) => {
    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      invocationId,
      script: scriptName,
      pid: process.pid,
      ...entry
    };

    appendRuntimeLog(normalizedProjectDir, payload);
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
    }
  };

  return logger;
}
