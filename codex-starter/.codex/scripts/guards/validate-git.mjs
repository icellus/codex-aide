#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { getProjectContext } from "../shared/project-context.mjs";
import { normalizeTaskStatus, readTaskContext } from "../shared/task-context.mjs";

const gitGlobalOptionsWithValue = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);
const gitGlobalOptionsWithInlineValue = ["--git-dir=", "--work-tree=", "--namespace=", "--exec-path=", "--config-env="];
const gitConfigOptionsWithValue = new Set(["-f", "--file", "--blob", "--type", "--default", "--comment"]);
const gitConfigOptionsWithInlineValue = ["--file=", "--blob=", "--type=", "--default=", "--comment="];

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
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

function firstNonOption(args, startIndex = 0) {
  let index = startIndex;
  while (index < args.length) {
    const token = String(args[index] || "");
    if (!token) {
      index += 1;
      continue;
    }
    if (token === "--") {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      index += 1;
      continue;
    }
    return token;
  }

  return "";
}

function isTestInvocation(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return false;
  }

  const executable = resolveExecutable(tokens);
  if (!executable) {
    return false;
  }

  const binary = path.basename(String(executable.executable || ""));
  const args = tokens.slice(executable.index + 1);

  if (["pytest", "jest", "vitest", "ctest", "phpunit"].includes(binary)) {
    return true;
  }

  if (binary === "npm" || binary === "pnpm" || binary === "yarn" || binary === "bun") {
    const first = String(args[0] || "");
    const second = String(args[1] || "");
    return first === "test" || first === "vitest" || first === "jest" || (first === "run" && ["test", "vitest", "jest"].includes(second));
  }

  if (binary === "go" || binary === "cargo") {
    return String(args[0] || "") === "test";
  }

  if (binary === "python" || binary === "python3") {
    return String(args[0] || "") === "-m" && String(args[1] || "") === "pytest";
  }

  if (binary === "node") {
    return args.includes("--test");
  }

  if (binary === "npx") {
    return ["jest", "vitest", "pytest"].includes(firstNonOption(args));
  }

  if (binary === "uv" || binary === "poetry") {
    return String(args[0] || "") === "run" && ["pytest", "jest", "vitest"].includes(firstNonOption(args, 1));
  }

  if (binary === "mvn" || binary === "mvnw") {
    return args.some((arg) => ["test", "verify", "integration-test"].includes(String(arg || "")));
  }

  if (binary === "gradle" || binary === "gradlew") {
    return args.some((arg) => ["test", "check", "integrationTest"].includes(String(arg || "")));
  }

  return false;
}

function commandContainsTests(command, depth = 0) {
  if (depth > 2) {
    return false;
  }

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
      if (nestedCommand && commandContainsTests(nestedCommand, depth + 1)) {
        return true;
      }
      continue;
    }

    if (isTestInvocation(tokens)) {
      return true;
    }
  }

  return false;
}

function technicalManagerOwnsCurrentTurn(projectDir) {
  const task = readTaskContext(projectDir)?.task || {};
  const status = normalizeTaskStatus(task.status, "idle");
  const nextOwner = String(task.next_owner || "").trim();
  const stickyOwner = String(task.sticky_owner || "").trim();

  if (!["active", "handoff", "blocked"].includes(status)) {
    return false;
  }

  if (["coder", "tester", "qc", "submit"].includes(nextOwner)) {
    return false;
  }

  return nextOwner === "technical_manager" || stickyOwner === "technical_manager";
}

function startsWithAny(value, prefixes) {
  return prefixes.some((prefix) => String(value || "").startsWith(prefix));
}

function isAliasConfigEntry(value) {
  return String(value || "").trim().toLowerCase().startsWith("alias.");
}

function hasInlineGitConfigOverride(args = []) {
  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index] || "");
    if (token === "-c" || token === "--config-env") {
      if (String(args[index + 1] || "").trim()) {
        return true;
      }
      index += 1;
      continue;
    }

    if (token.startsWith("-c") || token.startsWith("--config-env=")) {
      return true;
    }
  }

  return false;
}

function hasEnvironmentGitConfigOverride(args = []) {
  return args.some((token) => {
    const name = String(token || "").split("=", 1)[0] || "";
    return name.startsWith("GIT_CONFIG_");
  });
}

function gitConfigOperands(args = []) {
  const operands = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index] || "");
    if (!token) {
      continue;
    }

    if (token === "--") {
      operands.push(...args.slice(index + 1).map((value) => String(value || "")).filter(Boolean));
      break;
    }

    if (gitConfigOptionsWithValue.has(token)) {
      index += 1;
      continue;
    }

    if (startsWithAny(token, gitConfigOptionsWithInlineValue)) {
      continue;
    }

    if (token.startsWith("-")) {
      continue;
    }

    operands.push(token);
  }

  return operands;
}

function isGitConfigMutation(args = []) {
  const operands = gitConfigOperands(args);
  const hasMutationFlag = args.some((token) =>
    ["--add", "--replace-all", "--unset", "--unset-all", "--rename-section", "--remove-section"].includes(String(token || ""))
  );

  return hasMutationFlag || operands.length > 1;
}

function runGitConfig(projectDir, args) {
  const result = spawnSync("git", args, {
    cwd: projectDir,
    encoding: "utf8"
  });

  return {
    ok: (result.status ?? 1) === 0,
    stdout: String(result.stdout || "").trim()
  };
}

function aliasTargetsGovernedDelivery(projectDir, aliasName, depth = 0, seen = new Set()) {
  const normalizedAlias = String(aliasName || "").trim();
  if (!normalizedAlias || depth > 3 || seen.has(normalizedAlias)) {
    return false;
  }

  seen.add(normalizedAlias);
  const aliasResult = runGitConfig(projectDir, ["config", "--get", `alias.${normalizedAlias}`]);
  if (!aliasResult.ok || !aliasResult.stdout) {
    return false;
  }

  const expansion = aliasResult.stdout;
  if (expansion.startsWith("!")) {
    return collectGitInvocations(expansion.slice(1), depth + 1).some(
      (invocation) => invocation.subcommand === "commit" || invocation.subcommand === "push"
    );
  }

  const tokens = tokenizeShellCommand(expansion);
  const target = String(tokens[0] || "").trim().toLowerCase();
  if (!target) {
    return false;
  }
  if (target === "commit" || target === "push") {
    return true;
  }

  return aliasTargetsGovernedDelivery(projectDir, target, depth + 1, seen);
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
      envAssignments: tokens.slice(0, executable.index).filter(isEnvironmentAssignment),
      prefixArgs: tokens.slice(executable.index + 1, subcommandIndex),
      args: tokens.slice(subcommandIndex + 1)
    });
  }

  return invocations;
}

function commandContainsGovernedGitDelivery(command, depth = 0) {
  if (depth > 2) {
    return false;
  }

  for (const rawSegment of splitShellSegments(command)) {
    const segment = stripLeadingShellKeywords(rawSegment);
    const tokens = tokenizeShellCommand(segment);
    if (tokens.length === 0) {
      continue;
    }

    const executable = resolveExecutable(tokens);
    if (executable && isShellExecutable(executable.executable)) {
      const nestedCommand = extractShellScriptArg(tokens, executable.index);
      if (nestedCommand && commandContainsGovernedGitDelivery(nestedCommand, depth + 1)) {
        return true;
      }
    }

    for (let index = 0; index < tokens.length; index += 1) {
      if (!isGitExecutable(tokens[index])) {
        continue;
      }

      const subcommandIndex = resolveGitSubcommandIndex(tokens, index);
      const subcommand = String(tokens[subcommandIndex] || "").trim().toLowerCase();
      if (subcommand === "commit" || subcommand === "push") {
        return true;
      }
    }
  }

  return false;
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

function decisionForInvocation(invocation, projectDir) {
  if (hasEnvironmentGitConfigOverride(invocation.envAssignments)) {
    return permissionResponse("Environment git config overrides are not allowed during governed delivery.");
  }

  if (invocation.subcommand === "config" && isGitConfigMutation(invocation.args)) {
    return permissionResponse("Changing git configuration is not allowed during governed delivery.");
  }

  if (hasInlineGitConfigOverride(invocation.prefixArgs)) {
    return permissionResponse("Inline git config overrides are not allowed during governed delivery.");
  }

  if (aliasTargetsGovernedDelivery(projectDir, invocation.subcommand)) {
    return permissionResponse(
      `Git alias ${invocation.subcommand} resolves to governed delivery and is not allowed on the main thread.`
    );
  }

  if (invocation.subcommand === "commit" || invocation.subcommand === "push") {
    return permissionResponse(
      `Direct git ${invocation.subcommand} is not allowed. Use submit via node .codex/scripts/submit/execute-delivery.mjs instead.`
    );
  }

  if (invocation.subcommand === "add") {
    const addArguments = parseAddArguments(invocation.args);
    if (addArguments.broad) {
      return permissionResponse("Broad staging is not allowed. Stage explicit project files only.");
    }

    if (addArguments.opaquePathspec) {
      return permissionResponse("Opaque pathspec staging is not allowed. Stage explicit project files instead.");
    }
  }

  return null;
}

function commandDecision(command, projectDir) {
  if (technicalManagerOwnsCurrentTurn(projectDir) && commandContainsTests(command)) {
    return permissionResponse("technical_manager must not run task-level tests on the main thread. Hand off to tester instead.");
  }

  if (commandContainsGovernedGitDelivery(command)) {
    return permissionResponse("Direct git commit/push is not allowed. Use submit via node .codex/scripts/submit/execute-delivery.mjs instead.");
  }

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
