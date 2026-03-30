import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

export function basenameLabel(value) {
  if (!value) {
    return "unknown";
  }
  return path.basename(value.replace(/\\/g, "/"));
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

export function resolveWorkflowPath(projectDir, value) {
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

export function pathContains(parentPath, childPath) {
  if (!parentPath || !childPath) {
    return false;
  }

  const parent = normalizeComparablePath(parentPath);
  const child = normalizeComparablePath(childPath);
  return child === parent || child.startsWith(`${parent}/`);
}

export function currentGitBranch(cwd) {
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
