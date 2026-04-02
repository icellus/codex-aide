#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { readTaskContext } from "../shared/task-context.mjs";
import {
  normalizeBoolean,
  normalizeText,
  readPreferences,
  taskCommitEntry,
  writePreferences
} from "../shared/submit-delivery.mjs";

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readDeliveryPolicy(projectDir) {
  const filePath = path.join(projectDir, ".codex", "policies", "delivery-policy.json");
  return readJsonFile(filePath, {});
}

function runGit(projectDir, args) {
  const result = spawnSync("git", args, {
    cwd: projectDir,
    encoding: "utf8"
  });

  return {
    ok: (result.status ?? 1) === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function remoteBranchExists(projectDir, remote, branch) {
  const normalizedRemote = normalizeText(remote);
  const normalizedBranch = normalizeText(branch);
  if (!normalizedRemote || !normalizedBranch) {
    return false;
  }

  const result = runGit(projectDir, ["ls-remote", "--heads", normalizedRemote, normalizedBranch]);
  return result.ok && Boolean(normalizeText(result.stdout));
}

function parseDirtyPaths(statusLines) {
  return statusLines
    .slice(1)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((value) => value.replace(/^"|"$/g, ""));
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function isRuntimeLocalPath(filePath) {
  const normalized = normalizeText(filePath).replace(/\\/g, "/");
  if (normalized.startsWith(".codex/logs/")) {
    return true;
  }
  if (normalized.startsWith(".codex/artifacts/delivery/") || normalized === ".codex/artifacts/delivery/") {
    return true;
  }
  if (normalized.startsWith(".codex/state/") && !normalized.endsWith(".demo.json")) {
    return true;
  }
  return false;
}

function gitState(projectDir) {
  const branchResult = runGit(projectDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branchResult.ok) {
    return {
      available: false,
      branch: "",
      remotes: [],
      has_changes: false,
      has_commit: false,
      upstream: "",
      upstream_remote: "",
      ahead: 0,
      behind: 0
    };
  }

  const branch = normalizeText(branchResult.stdout);
  const remoteResult = runGit(projectDir, ["remote"]);
  const remotes = remoteResult.ok
    ? remoteResult.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : [];
  const statusResult = runGit(projectDir, ["status", "--porcelain", "--branch"]);
  const statusLines = statusResult.ok
    ? statusResult.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
    : [];
  const branchLine = statusLines[0] || "";
  const dirtyPaths = parseDirtyPaths(statusLines);
  const relevantDirtyPaths = dirtyPaths.filter((filePath) => !isRuntimeLocalPath(filePath));
  const aheadMatch = branchLine.match(/ahead (\d+)/i);
  const behindMatch = branchLine.match(/behind (\d+)/i);
  const upstreamResult = runGit(projectDir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const upstream = upstreamResult.ok ? normalizeText(upstreamResult.stdout) : "";
  const upstreamRemote = upstream.includes("/") ? upstream.split("/")[0] : "";
  const headResult = runGit(projectDir, ["rev-parse", "--verify", "HEAD"]);

  return {
    available: true,
    branch,
    remotes,
    has_changes: dirtyPaths.length > 0,
    has_relevant_changes: relevantDirtyPaths.length > 0,
    dirty_paths: dirtyPaths,
    has_commit: headResult.ok,
    upstream,
    upstream_remote: upstreamRemote,
    ahead: aheadMatch ? Number.parseInt(aheadMatch[1], 10) || 0 : 0,
    behind: behindMatch ? Number.parseInt(behindMatch[1], 10) || 0 : 0
  };
}

function branchStartsWith(branch, prefixes = []) {
  return prefixes.some((prefix) => branch.startsWith(prefix));
}

function evaluateQc(task, input) {
  const qcPolicy = normalizeText(task?.qc_policy).toLowerCase();
  const qcRequired = !["", "disabled", "skip", "skip-unless-risk-escalates"].includes(qcPolicy);
  const requestedStatus = normalizeText(input.qc_status).toLowerCase();
  const status = requestedStatus || (qcRequired ? "waiting" : "not-needed");

  return {
    required: qcRequired,
    status
  };
}

function routeGateForSubmit(task) {
  const blockers = [];
  const activatedRoles = normalizeStringList(task?.activated_roles);
  const completedRoles = normalizeStringList(task?.completed_roles);
  const subagentRoles = normalizeStringList(task?.subagent_roles);
  const productDecision = normalizeText(task?.product_decision).toLowerCase() || "none";

  if (productDecision === "product" && !completedRoles.includes("architect")) {
    blockers.push("product-decision-requires-architect");
  }

  if (activatedRoles.includes("coder")) {
    if (!completedRoles.includes("tester")) {
      blockers.push("coder-chain-requires-tester");
    }
    if (!subagentRoles.includes("coder")) {
      blockers.push("coder-must-be-subagent");
    }
  }

  if (activatedRoles.includes("tester")) {
    if (!subagentRoles.includes("tester")) {
      blockers.push("tester-must-be-subagent");
    }
    if (!completedRoles.includes("tester")) {
      blockers.push("tester-handoff-must-complete");
    }
  }

  return blockers;
}

function evaluateCommit({ policy, preferences, git, qc, task, input }) {
  const commitPolicy = policy?.commit || {};
  const protectedBranches = Array.isArray(commitPolicy.protected_branches) ? commitPolicy.protected_branches : [];
  const blockedBranches = Array.isArray(commitPolicy.blocked_branches) ? commitPolicy.blocked_branches : [];
  const allowedPrefixes = Array.isArray(commitPolicy.allow_current_branch_prefixes)
    ? commitPolicy.allow_current_branch_prefixes
    : [];
  const maxAutoCommits = Number.isFinite(commitPolicy.max_auto_commits_per_task)
    ? commitPolicy.max_auto_commits_per_task
    : Number.parseInt(commitPolicy.max_auto_commits_per_task, 10);
  const taskId = normalizeText(task?.task_id);

  if (!git.available) {
    return { status: "blocked", reason: "git-unavailable" };
  }
  if (qc.required && qc.status !== "passed") {
    return { status: "blocked", reason: "qc-waiting" };
  }
  if (protectedBranches.includes(git.branch)) {
    return { status: "blocked", reason: "protected-branch" };
  }
  if (blockedBranches.includes(git.branch)) {
    return { status: "blocked", reason: "blocked-branch" };
  }
  if (allowedPrefixes.length > 0 && !branchStartsWith(git.branch, allowedPrefixes)) {
    if (normalizeText(commitPolicy.create_branch_when_needed).toLowerCase() === "ask") {
      return { status: "ask", reason: "branch-prefix-not-allowed" };
    }
    return { status: "blocked", reason: "branch-prefix-not-allowed" };
  }
  if (!git.has_relevant_changes) {
    return { status: "skipped", reason: "no-local-changes" };
  }
  if (normalizeBoolean(input.amend) === true && commitPolicy.allow_amend !== true) {
    return { status: "blocked", reason: "amend-disabled" };
  }

  const mode = normalizeText(commitPolicy.mode).toLowerCase();
  if (mode === "ask_once") {
    if (preferences.commit.auto_commit === null) {
      return { status: "ask", reason: "commit-preference-unset" };
    }
    if (preferences.commit.auto_commit === false) {
      return { status: "blocked", reason: "commit-preference-denied" };
    }
  }

  if (Number.isFinite(maxAutoCommits) && maxAutoCommits >= 0 && taskId) {
    const commitEntry = taskCommitEntry(preferences, taskId);
    if (commitEntry.auto_commit_count >= maxAutoCommits && normalizeBoolean(input.allow_extra_commit) !== true) {
      return {
        status: "ask",
        reason: "commit-limit-reached",
        commit_count: commitEntry.auto_commit_count,
        max_auto_commits_per_task: maxAutoCommits
      };
    }
  }

  return {
    status: "ready",
    reason: "commit-allowed",
    message_template: normalizeText(commitPolicy.message_template) || "{type}: {summary}",
    max_auto_commits_per_task: Number.isFinite(maxAutoCommits) ? maxAutoCommits : null
  };
}

function evaluatePush({ projectDir, policy, preferences, git, input, commitGate }) {
  const pushPolicy = policy?.push || {};
  const protectedBranches = Array.isArray(policy?.commit?.protected_branches) ? policy.commit.protected_branches : [];
  const blockedBranches = Array.isArray(policy?.commit?.blocked_branches) ? policy.commit.blocked_branches : [];

  if (!git.available) {
    return { status: "blocked", reason: "git-unavailable", remote: "", branch: git.branch };
  }
  if (protectedBranches.includes(git.branch)) {
    return { status: "blocked", reason: "protected-branch", remote: "", branch: git.branch };
  }
  if (blockedBranches.includes(git.branch)) {
    return { status: "blocked", reason: "blocked-branch", remote: "", branch: git.branch };
  }
  if (git.remotes.length === 0) {
    return { status: "blocked", reason: "missing-remote", remote: "", branch: git.branch };
  }

  const remote = normalizeText(input.remote) || git.upstream_remote || git.remotes[0];
  if (git.has_relevant_changes) {
    return { status: "skipped", reason: "awaiting-commit", remote, branch: git.branch };
  }
  const branchExistsOnRemote = remoteBranchExists(projectDir, remote, git.branch);
  const remotePreference = preferences.push.remotes?.[remote]?.auto_push ?? null;
  const hasPushableCommits = git.has_commit && (!git.upstream || git.ahead > 0);

  if (!hasPushableCommits) {
    return { status: "skipped", reason: "no-local-commits", remote, branch: git.branch };
  }

  const mode = normalizeText(pushPolicy.mode).toLowerCase();
  if (mode === "ask_once") {
    if (remotePreference === null) {
      return { status: "ask", reason: "push-preference-unset", remote, branch: git.branch };
    }
    if (remotePreference === false) {
      return { status: "blocked", reason: "push-preference-denied", remote, branch: git.branch };
    }
  }

  if (!branchExistsOnRemote && normalizeText(pushPolicy.create_remote_branch_when_missing).toLowerCase() === "ask") {
    if (normalizeBoolean(input.allow_create_remote_branch) !== true) {
      return { status: "ask", reason: "create-remote-branch-required", remote, branch: git.branch };
    }
  }

  if (!git.upstream && normalizeText(pushPolicy.set_upstream).toLowerCase() === "ask" && normalizeBoolean(input.allow_set_upstream) !== true) {
    return { status: "ask", reason: "set-upstream-required", remote, branch: git.branch };
  }

  return { status: "ready", reason: "push-allowed", remote, branch: git.branch };
}

function evaluatePostPushStage(config, pushStatus, inputPushStatus, fallback) {
  if (!config?.enabled) {
    return { status: "skipped", reason: "not-configured" };
  }

  if (normalizeText(inputPushStatus).toLowerCase() !== "done" && pushStatus !== "done") {
    return { status: "skipped", reason: "awaiting-push" };
  }

  const command = normalizeText(config.command);
  if (!command) {
    if (normalizeText(fallback?.on_missing_config).toLowerCase() === "skip-step") {
      return { status: "skipped", reason: "not-configured" };
    }
    return { status: "blocked", reason: "missing-stage-command" };
  }

  return {
    status: "ready",
    reason: "command-configured",
    command
  };
}

function blockersFromGates(qc, commitGate, pushGate) {
  const blockers = [];
  if (qc.required && qc.status !== "passed") {
    blockers.push("qc-waiting");
  }
  for (const gate of [commitGate, pushGate]) {
    if (gate.status === "blocked") {
      blockers.push(gate.reason);
    }
  }
  return blockers;
}

function inspectDelivery({ projectDir, input }) {
  const policy = readDeliveryPolicy(projectDir);
  const preferences = readPreferences(projectDir);
  const taskContext = readTaskContext(projectDir);
  const task = taskContext.task || {};
  const git = gitState(projectDir);
  const fallback = policy?.fallback || {};
  const qc = evaluateQc(task, input);
  const routeBlockers = routeGateForSubmit(task);
  const routeGateReason = routeBlockers[0] || "";
  const commitGate = routeBlockers.length > 0
    ? { status: "blocked", reason: routeGateReason }
    : evaluateCommit({ policy, preferences, git, qc, task, input });
  const pushGate = routeBlockers.length > 0
    ? { status: "blocked", reason: routeGateReason, remote: "", branch: git.branch }
    : evaluatePush({ projectDir, policy, preferences, git, input, commitGate });
  const notify = evaluatePostPushStage(policy?.notify, pushGate.status, input.push_status, fallback);
  const ci = evaluatePostPushStage(policy?.ci, pushGate.status, input.push_status, fallback);
  const release = evaluatePostPushStage(policy?.release, pushGate.status, input.push_status, fallback);

  return {
    ok: true,
    action: "inspect",
    submit_enabled: Boolean(policy?.submit?.enabled),
    qc,
    git,
    commit: commitGate,
    push: pushGate,
    notify,
    ci,
    release,
    preferences,
    task: {
      task_id: normalizeText(task.task_id),
      current_task: normalizeText(task.current_task)
    },
    blockers: [
      ...routeBlockers,
      ...blockersFromGates(qc, commitGate, pushGate),
      ...[notify, ci, release].filter((stage) => stage.status === "blocked").map((stage) => stage.reason)
    ]
  };
}

function updateCommitPreference({ projectDir, input }) {
  const preferences = readPreferences(projectDir);
  const value = normalizeBoolean(input.auto_commit);
  if (value === null) {
    return {
      ok: false,
      error: {
        code: "invalid-auto-commit",
        message: "auto_commit must be true or false"
      }
    };
  }

  preferences.commit.auto_commit = value;
  preferences.updated_at = new Date().toISOString();
  writePreferences(projectDir, preferences);
  const result = inspectDelivery({ projectDir, input });
  result.action = "set-commit-preference";
  return result;
}

function updatePushPreference({ projectDir, input }) {
  const preferences = readPreferences(projectDir);
  const remote = normalizeText(input.remote);
  const value = normalizeBoolean(input.auto_push);
  if (!remote) {
    return {
      ok: false,
      error: {
        code: "missing-remote",
        message: "set-push-preference requires remote"
      }
    };
  }
  if (value === null) {
    return {
      ok: false,
      error: {
        code: "invalid-auto-push",
        message: "auto_push must be true or false"
      }
    };
  }

  preferences.push.remotes = preferences.push.remotes || {};
  preferences.push.remotes[remote] = {
    auto_push: value
  };
  preferences.updated_at = new Date().toISOString();
  writePreferences(projectDir, preferences);
  const result = inspectDelivery({ projectDir, input: { ...input, remote } });
  result.action = "set-push-preference";
  return result;
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "submit/plan-delivery.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    if (envelope.parseError) {
      throw envelope.parseError;
    }

    const action = normalizeText(input.action).toLowerCase() || "inspect";
    let result;

    if (action === "set-commit-preference") {
      result = updateCommitPreference({ projectDir, input });
    } else if (action === "set-push-preference") {
      result = updatePushPreference({ projectDir, input });
    } else {
      result = inspectDelivery({ projectDir, input });
    }

    if (!result.ok) {
      process.stderr.write(`${result.error.code}: ${result.error.message}\n`);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      logger.finalize({
        status: "error",
        metadata: {
          action,
          errorCode: result.error.code
        }
      });
      process.exit(2);
    }

    process.stdout.write(`${JSON.stringify(result)}\n`);
    logger.finalize({
      status: "ok",
      metadata: {
        action,
        blockers: result.blockers.length
      }
    });
  } catch (error) {
    process.stderr.write(`submit/plan-delivery error: ${error instanceof Error ? error.message : String(error)}\n`);
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
