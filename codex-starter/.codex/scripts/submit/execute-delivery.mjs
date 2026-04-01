#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

import { getProjectContext } from "../shared/project-context.mjs";
import { readJsonStdinEnvelope } from "../shared/io.mjs";
import { startRuntimeInvocationLogging } from "../shared/logging.mjs";
import { readTaskContext } from "../shared/task-context.mjs";
import { readPreferences, recordAutoCommit, writePreferences } from "../shared/submit-delivery.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function runGit(projectDir, args) {
  const result = spawnSync("git", args, {
    cwd: projectDir,
    encoding: "utf8"
  });

  return {
    ok: (result.status ?? 1) === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function runPlanner(projectDir, input) {
  const plannerPath = path.join(projectDir, ".codex", "scripts", "submit", "plan-delivery.mjs");
  const result = spawnSync(process.execPath, [plannerPath], {
    cwd: projectDir,
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: projectDir
    }
  });

  const stdout = String(result.stdout || "").trim();
  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }
  }

  return {
    ok: (result.status ?? 1) === 0 && Boolean(parsed?.ok),
    status: result.status ?? 1,
    stdout,
    stderr: String(result.stderr || "").trim(),
    parsed
  };
}

function defaultCommitType(task) {
  const taskClass = normalizeText(task?.class).toLowerCase();
  if (taskClass === "feature") {
    return "feat";
  }
  if (taskClass === "bugfix") {
    return "fix";
  }
  if (taskClass === "refactor") {
    return "refactor";
  }
  return "chore";
}

function defaultCommitSummary(task) {
  return normalizeText(task?.current_task) || "update delivery state";
}

function renderCommitMessage(template, task, input) {
  const explicit = normalizeText(input.commit_message);
  if (explicit) {
    return explicit;
  }

  const type = normalizeText(input.commit_type) || defaultCommitType(task);
  const summary = normalizeText(input.commit_summary) || defaultCommitSummary(task);
  return String(template || "{type}: {summary}")
    .replace(/\{type\}/g, type)
    .replace(/\{summary\}/g, summary);
}

function stageSkeleton(plan) {
  return {
    commit: {
      status: "skipped",
      branch: plan?.git?.branch || "",
      commit_sha: "",
      message: ""
    },
    push: {
      status: "skipped",
      remote: plan?.push?.remote || "",
      branch: plan?.git?.branch || ""
    },
    notify: {
      status: plan?.notify?.status || "skipped",
      reason: plan?.notify?.reason || "not-run"
    },
    ci: {
      status: plan?.ci?.status || "skipped",
      reason: plan?.ci?.reason || "not-run"
    },
    release: {
      status: plan?.release?.status || "skipped",
      reason: plan?.release?.reason || "not-run"
    }
  };
}

function runStageCommand(projectDir, stageName, stagePlan, deliveryContext) {
  if (!stagePlan || stagePlan.status === "skipped") {
    return {
      status: "skipped",
      reason: stagePlan?.reason || "skipped"
    };
  }
  if (stagePlan.status !== "ready") {
    return {
      status: "blocked",
      reason: stagePlan?.reason || `${stageName}-not-ready`
    };
  }

  // Post-push stages use a minimal command contract so repositories can opt in
  // without changing submit flow code again.
  const result = spawnSync("bash", ["-lc", stagePlan.command], {
    cwd: projectDir,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: projectDir,
      CODEX_DELIVERY_STAGE: stageName,
      CODEX_DELIVERY_REMOTE: deliveryContext.remote || "",
      CODEX_DELIVERY_BRANCH: deliveryContext.branch || "",
      CODEX_DELIVERY_COMMIT_SHA: deliveryContext.commit_sha || ""
    }
  });

  if ((result.status ?? 1) !== 0) {
    return {
      status: "blocked",
      reason: normalizeText(result.stderr || result.stdout) || `${stageName}-command-failed`
    };
  }

  return {
    status: "done",
    reason: "command-succeeded"
  };
}

function blockedResult(action, plan, reason) {
  return {
    ok: true,
    action,
    status: "blocked",
    qc_status: plan?.qc?.status || "not-needed",
    ...stageSkeleton(plan),
    blockers: [reason].filter(Boolean)
  };
}

function runCommit(projectDir, plan, input) {
  const commitGate = plan.commit || {};
  if (commitGate.status === "skipped") {
    return {
      status: "skipped",
      branch: plan?.git?.branch || "",
      commit_sha: "",
      message: "",
      reason: commitGate.reason || "skipped"
    };
  }
  if (commitGate.status !== "ready") {
    return {
      status: "blocked",
      branch: plan?.git?.branch || "",
      commit_sha: "",
      message: "",
      reason: commitGate.reason || "commit-not-ready"
    };
  }

  const task = readTaskContext(projectDir).task || {};
  const message = renderCommitMessage(commitGate.message_template, task, input);
  const result = runGit(projectDir, ["commit", "-m", message]);
  if (!result.ok) {
    return {
      status: "blocked",
      branch: plan?.git?.branch || "",
      commit_sha: "",
      message,
      reason: normalizeText(result.stderr || result.stdout) || "git-commit-failed"
    };
  }

  const sha = runGit(projectDir, ["rev-parse", "HEAD"]);
  const commitSha = normalizeText(sha.stdout);
  const preferences = readPreferences(projectDir);
  const nextPreferences = recordAutoCommit(preferences, task.task_id, commitSha, new Date().toISOString());
  writePreferences(projectDir, nextPreferences);
  return {
    status: "done",
    branch: plan?.git?.branch || "",
    commit_sha: commitSha,
    message,
    reason: "commit-created"
  };
}

function runPush(projectDir, plan, input) {
  const pushGate = plan.push || {};
  if (pushGate.status === "skipped") {
    return {
      status: "skipped",
      remote: pushGate.remote || "",
      branch: pushGate.branch || "",
      reason: pushGate.reason || "skipped"
    };
  }
  if (pushGate.status !== "ready") {
    return {
      status: "blocked",
      remote: pushGate.remote || "",
      branch: pushGate.branch || "",
      reason: pushGate.reason || "push-not-ready"
    };
  }

  const args = [];
  if (!plan.git?.upstream) {
    args.push("push", "--set-upstream", pushGate.remote, pushGate.branch);
  } else {
    args.push("push", pushGate.remote, pushGate.branch);
  }

  const result = runGit(projectDir, args);
  if (!result.ok) {
    return {
      status: "blocked",
      remote: pushGate.remote || "",
      branch: pushGate.branch || "",
      reason: normalizeText(result.stderr || result.stdout) || "git-push-failed"
    };
  }

  return {
    status: "done",
    remote: pushGate.remote || "",
    branch: pushGate.branch || "",
    reason: "push-created"
  };
}

function finalizePostPush(projectDir, input, deliveryContext) {
  const inspect = runPlanner(projectDir, {
    action: "inspect",
    remote: input.remote,
    allow_set_upstream: input.allow_set_upstream,
    qc_status: input.qc_status,
    push_status: "done"
  });

  if (!inspect.ok) {
    return {
      notify: { status: "blocked", reason: "post-push-reinspect-failed" },
      ci: { status: "blocked", reason: "post-push-reinspect-failed" },
      release: { status: "blocked", reason: "post-push-reinspect-failed" }
    };
  }

  const notify = runStageCommand(projectDir, "notify", inspect.parsed.notify, deliveryContext);
  if (notify.status === "blocked") {
    return {
      notify,
      ci: { status: "skipped", reason: "previous-stage-blocked" },
      release: { status: "skipped", reason: "previous-stage-blocked" },
      blockers: [`notify:${notify.reason}`]
    };
  }

  const ci = runStageCommand(projectDir, "ci", inspect.parsed.ci, deliveryContext);
  if (ci.status === "blocked") {
    return {
      notify,
      ci,
      release: { status: "skipped", reason: "previous-stage-blocked" },
      blockers: [`ci:${ci.reason}`]
    };
  }

  const release = runStageCommand(projectDir, "release", inspect.parsed.release, deliveryContext);
  return {
    notify,
    ci,
    release,
    blockers: release.status === "blocked" ? [`release:${release.reason}`] : []
  };
}

function execute(action, projectDir, input) {
  const planResult = runPlanner(projectDir, {
    action: "inspect",
    remote: input.remote,
    allow_set_upstream: input.allow_set_upstream,
    allow_create_remote_branch: input.allow_create_remote_branch,
    qc_status: input.qc_status,
    allow_extra_commit: input.allow_extra_commit,
    amend: input.amend
  });

  if (!planResult.ok) {
    return {
      ok: false,
      error: {
        code: "planner-failed",
        message: normalizeText(planResult.stderr || planResult.stdout) || "plan-delivery failed"
      }
    };
  }

  const plan = planResult.parsed;
  if (plan.qc?.required && plan.qc?.status !== "passed") {
    return blockedResult(action, plan, "qc-waiting");
  }

  const base = {
    ok: true,
    action,
    status: "complete",
    qc_status: plan.qc?.status || "not-needed",
    ...stageSkeleton(plan),
    blockers: []
  };

  if (action === "commit") {
    const commit = runCommit(projectDir, plan, input);
    base.commit = commit;
    if (commit.status === "blocked") {
      base.status = "blocked";
      base.blockers = [commit.reason];
    }
    return base;
  }

  if (action === "push") {
    const push = runPush(projectDir, plan, input);
    base.push = push;
    if (push.status === "done") {
      const head = runGit(projectDir, ["rev-parse", "HEAD"]);
      const postPush = finalizePostPush(projectDir, input, {
        remote: push.remote,
        branch: push.branch,
        commit_sha: normalizeText(head.stdout)
      });
      Object.assign(base, postPush);
      if (Array.isArray(postPush.blockers) && postPush.blockers.length > 0) {
        base.status = "blocked";
        base.blockers = postPush.blockers;
      }
    } else if (push.status === "blocked") {
      base.status = "blocked";
      base.blockers = [push.reason];
    }
    return base;
  }

  const commit = runCommit(projectDir, plan, input);
  base.commit = commit;
  if (commit.status === "blocked") {
    base.status = "blocked";
    base.blockers = [commit.reason];
    return base;
  }

  const pushPlan = runPlanner(projectDir, {
    action: "inspect",
    remote: input.remote,
    allow_set_upstream: input.allow_set_upstream,
    allow_create_remote_branch: input.allow_create_remote_branch,
    qc_status: input.qc_status,
    allow_extra_commit: input.allow_extra_commit,
    amend: input.amend
  });
  if (!pushPlan.ok) {
    return {
      ok: false,
      error: {
        code: "post-commit-plan-failed",
        message: normalizeText(pushPlan.stderr || pushPlan.stdout) || "post-commit inspect failed"
      }
    };
  }

  const push = runPush(projectDir, pushPlan.parsed, input);
  base.push = push;
  if (push.status === "done") {
    const postPush = finalizePostPush(projectDir, input, {
      remote: push.remote,
      branch: push.branch,
      commit_sha: commit.commit_sha || ""
    });
    Object.assign(base, postPush);
    if (Array.isArray(postPush.blockers) && postPush.blockers.length > 0) {
      base.status = "blocked";
      base.blockers = postPush.blockers;
    }
  } else if (push.status === "blocked") {
    base.status = "blocked";
    base.blockers = [push.reason];
  }

  return base;
}

async function main() {
  const envelope = await readJsonStdinEnvelope({ strict: true });
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "submit/execute-delivery.mjs",
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

    const action = normalizeText(input.action).toLowerCase() || "run";
    if (!["run", "commit", "push"].includes(action)) {
      process.stderr.write(`invalid-action: unsupported action ${action}\n`);
      process.stdout.write(`${JSON.stringify({
        ok: false,
        error: {
          code: "invalid-action",
          message: `unsupported action ${action}`
        }
      })}\n`);
      logger.finalize({
        status: "error",
        metadata: {
          action,
          errorCode: "invalid-action"
        }
      });
      process.exit(2);
    }

    const result = execute(action, projectDir, input);
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
        status: result.status
      }
    });
  } catch (error) {
    process.stderr.write(`submit/execute-delivery error: ${error instanceof Error ? error.message : String(error)}\n`);
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
