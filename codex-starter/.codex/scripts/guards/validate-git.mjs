#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";

import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { getProjectContext } from "../shared/project-context.mjs";

const gitGlobalOptionsWithValue = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);
const gitGlobalOptionsWithInlineValue = ["--git-dir=", "--work-tree=", "--namespace=", "--exec-path="];

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

function isCodexStarterAssetPath(value) {
  const normalized = normalizeRelativePath(value);
  return normalized === "AGENTS.md" || normalized.startsWith(".codex/");
}

function permissionResponse(permissionDecisionReason) {
  return {
    permissionDecision: "deny",
    permissionDecisionReason
  };
}

function readCommandInput(input) {
  return [input.command, input.cmd, input.tool_input?.command, input.toolInput?.command]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean) || "";
}

function splitShellSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  let escaping = false;
  const source = String(command || "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      current += char;
      escaping = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      current += char;
      quote = char;
      continue;
    }

    if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
      const trimmed = current.trim();
      if (trimmed) {
        segments.push(trimmed);
      }
      current = "";
      index += 1;
      continue;
    }

    if (char === ";" || char === "|" || char === "\n") {
      const trimmed = current.trim();
      if (trimmed) {
        segments.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    segments.push(trimmed);
  }

  return segments;
}

function tokenizeShellCommand(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of String(command || "")) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function stripLeadingShellKeywords(segment) {
  let current = String(segment || "").trim();
  const prefixes = ["then ", "do ", "! ", "{ ", "( ", "time "];

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of prefixes) {
      if (current.startsWith(prefix)) {
        current = current.slice(prefix.length).trim();
        changed = true;
      }
    }
  }

  return current;
}

function isEnvironmentAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(String(token || ""));
}

function resolveExecutable(tokens) {
  let index = 0;

  while (index < tokens.length && isEnvironmentAssignment(tokens[index])) {
    index += 1;
  }

  while (index < tokens.length) {
    const executable = path.basename(String(tokens[index] || ""));
    if (executable === "env" || executable === "command" || executable === "builtin") {
      index += 1;
      while (index < tokens.length && isEnvironmentAssignment(tokens[index])) {
        index += 1;
      }
      continue;
    }

    if (executable === "sudo") {
      index += 1;
      while (index < tokens.length && String(tokens[index] || "").startsWith("-")) {
        index += 1;
      }
      continue;
    }

    return {
      executable: tokens[index],
      index
    };
  }

  return null;
}

function isShellExecutable(token) {
  return ["bash", "sh", "zsh"].includes(path.basename(String(token || "")));
}

function extractShellScriptArg(tokens, executableIndex) {
  for (let index = executableIndex + 1; index < tokens.length - 1; index += 1) {
    const token = String(tokens[index] || "");
    if (token === "-c" || (token.startsWith("-") && token.includes("c"))) {
      return String(tokens[index + 1] || "").trim();
    }
  }

  return "";
}

function isGitExecutable(token) {
  return path.basename(String(token || "")) === "git";
}

function startsWithAny(value, prefixes) {
  return prefixes.some((prefix) => String(value || "").startsWith(prefix));
}

function resolveGitSubcommandIndex(tokens, executableIndex) {
  let index = executableIndex + 1;

  while (index < tokens.length) {
    const token = String(tokens[index] || "");
    if (token === "--") {
      index += 1;
      break;
    }
    if (!token.startsWith("-")) {
      break;
    }
    if (gitGlobalOptionsWithValue.has(token)) {
      index += 2;
      continue;
    }
    if (startsWithAny(token, gitGlobalOptionsWithInlineValue)) {
      index += 1;
      continue;
    }
    index += 1;
  }

  return index;
}

function collectGitInvocations(command, depth = 0) {
  if (depth > 2) {
    return [];
  }

  const invocations = [];

  for (const rawSegment of splitShellSegments(command)) {
    const segment = stripLeadingShellKeywords(rawSegment);
    const tokens = tokenizeShellCommand(segment);
    if (tokens.length === 0) {
      continue;
    }

    const executable = resolveExecutable(tokens);
    if (!executable) {
      continue;
    }

    if (isShellExecutable(executable.executable)) {
      const nestedCommand = extractShellScriptArg(tokens, executable.index);
      if (nestedCommand) {
        invocations.push(...collectGitInvocations(nestedCommand, depth + 1));
      }
      continue;
    }

    if (!isGitExecutable(executable.executable)) {
      continue;
    }

    const subcommandIndex = resolveGitSubcommandIndex(tokens, executable.index);
    const subcommand = String(tokens[subcommandIndex] || "").trim().toLowerCase();
    if (!subcommand) {
      continue;
    }

    invocations.push({
      subcommand,
      args: tokens.slice(subcommandIndex + 1)
    });
  }

  return invocations;
}

function parseAddArguments(args) {
  const explicitPaths = [];
  let pathspecMode = false;
  let broad = false;
  let opaquePathspec = false;

  for (const token of args) {
    if (token === "--") {
      pathspecMode = true;
      continue;
    }

    if (!pathspecMode && token.startsWith("-")) {
      if (token === "-A" || token === "--all" || token === "-u" || token === "--update") {
        broad = true;
      }
      if (token === "--pathspec-from-file" || token.startsWith("--pathspec-from-file=")) {
        opaquePathspec = true;
      }
      continue;
    }

    const normalized = normalizeRelativePath(token);
    if (!normalized) {
      continue;
    }

    if (normalized === "." || normalized === ":/") {
      broad = true;
    }

    explicitPaths.push(normalized);
  }

  return {
    broad,
    opaquePathspec,
    explicitPaths
  };
}

function listStagedFiles(projectDir) {
  try {
    const output = execFileSync("git", ["diff", "--cached", "--name-only", "--relative"], {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    return output
      .split(/\r?\n/)
      .map((line) => normalizeRelativePath(line))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function stagedCodexStarterAssets(projectDir) {
  return listStagedFiles(projectDir).filter((filePath) => isCodexStarterAssetPath(filePath));
}

function decisionForInvocation(invocation, projectDir) {
  if (invocation.subcommand === "add") {
    const addArguments = parseAddArguments(invocation.args);
    if (addArguments.broad) {
      return permissionResponse("Broad staging is not allowed. Stage explicit project files only.");
    }

    if (addArguments.opaquePathspec) {
      return permissionResponse("Opaque pathspec staging is not allowed. Stage explicit project files instead.");
    }

    const assetPaths = addArguments.explicitPaths.filter((entry) => isCodexStarterAssetPath(entry));
    if (assetPaths.length > 0) {
      return permissionResponse(
        `Codex starter assets must not be staged with project changes: ${assetPaths.join(", ")}`
      );
    }
  }

  if (invocation.subcommand === "commit") {
    const stagedAssets = stagedCodexStarterAssets(projectDir);
    if (stagedAssets.length > 0) {
      return permissionResponse(
        `Codex starter assets are staged and must not be committed with project changes: ${stagedAssets.join(", ")}`
      );
    }
  }

  return null;
}

function commandDecision(command, projectDir) {
  const decisions = collectGitInvocations(command)
    .map((invocation) => decisionForInvocation(invocation, projectDir))
    .filter(Boolean);

  if (decisions.length === 0) {
    return null;
  }

  return permissionResponse(decisions.map((item) => item.permissionDecisionReason).join(" | "));
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const logger = startRuntimeInvocationLogging({
    projectDir: project.projectDir,
    scriptName: "guards/validate-git.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const command = readCommandInput(input);
    const decision = commandDecision(command, project.projectDir);

    if (decision) {
      process.stdout.write(`${JSON.stringify(decision)}\n`);
    }

    logger.finalize({
      status: "ok",
      metadata: {
        decision: decision ? "deny" : "allow",
        hasCommand: Boolean(command)
      }
    });
  } catch (error) {
    process.stderr.write(`guards/validate-git error: ${error instanceof Error ? error.message : String(error)}\n`);
    logger.finalize({
      status: "error",
      error
    });
    process.exit(1);
  } finally {
    restoreStreams();
  }
}

await main();
