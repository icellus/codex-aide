import fs from "node:fs";
import path from "node:path";

import { logRuntimeFileWrite } from "../shared/logging.mjs";
import { getProjectContext } from "../shared/project-context.mjs";
import { normalizeText } from "./structured.mjs";

function normalizeArtifactField(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toUpperCase() === "N/A" || /^\[[^\]]+\]$/.test(raw)) {
    return null;
  }
  return raw;
}

function extractTitle(block) {
  return normalizeArtifactField(block.match(/^###\s+(.+)$/m)?.[1] || null);
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

function hasUnsettledStatus(task = {}) {
  const status = normalizeTaskStatus(task.status, "active");
  return status === "active" || status === "parked" || status === "blocked" || status === "queued";
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

function updateCurrentWorkSection(text, state, taskRegistry = null) {
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

function buildGovernanceQueueBlock(entry) {
  const route = Array.isArray(entry.suggestedRoute)
    ? entry.suggestedRoute.join(", ")
    : String(entry.suggestedRoute || "");

  return [
    `### ${entry.id}`,
    `**Source**: \`${entry.source || "unknown"}\``,
    `**Category**: \`${entry.category}\``,
    `**Trigger Count**: ${entry.triggerCount}`,
    `**Suggested Route**: \`${route}\``,
    `**Recommended Action**: ${entry.recommended_action || entry.recommendedAction || ""}`,
    `**Status**: \`${entry.status || "queued"}\``
  ].join("\n");
}

function updateGovernanceQueueSection(text, state) {
  const match = text.match(/(## Governance Queue \(Optional\)\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## |\n## |\s*$)/);
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

  for (const entry of state.governanceQueue) {
    const block = buildGovernanceQueueBlock(entry);
    if (!blockMap.has(entry.id)) {
      order.push(entry.id);
    }
    blockMap.set(entry.id, block);
  }

  if (state.governanceQueue.length > 0 && blockMap.has("[governance-item-id]")) {
    blockMap.delete("[governance-item-id]");
  }

  const renderedBlocks = order
    .filter((id, index) => order.indexOf(id) === index)
    .filter((id) => blockMap.has(id))
    .map((id) => blockMap.get(id));

  const parts = [...preamble, ...renderedBlocks].filter(Boolean);
  const bodyText = parts.length > 0 ? `${parts.join("\n\n")}\n\n` : "<!-- No queued governance items -->\n\n";

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
    "**Governance Candidates**:",
    ...categories,
    "**Governance Disposition**: `pending retrospective`",
    `**Last Updated**: ${entry.updatedAt || entry.createdAt || "unknown"}`
  ].join("\n");
}

function parseRetrospectiveChunk(chunk) {
  return {
    id: chunk.match(/^###\s+(.+)$/m)?.[1]?.trim() || null,
    taskId: chunk.match(/\*\*Task ID\*\*:\s*`([^`]+)`/)?.[1] || null,
    governanceDisposition: chunk.match(/\*\*Governance Disposition\*\*:\s*`([^`]+)`/)?.[1] || null,
    chunk
  };
}

function isPendingAutoRetrospective(parsed) {
  return (
    parsed.governanceDisposition === "pending retrospective" &&
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
      (item) => item.governanceDisposition === "pending retrospective" && !isPendingAutoRetrospective(item)
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

export function syncProgressFromState(progressPath, state, taskRegistry = null) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return;
  }

  const projectDir = getProjectContext({ cwd: path.dirname(progressPath) }).projectDir;
  const original = fs.readFileSync(progressPath, "utf8");
  const withRetryPattern = updateCurrentWorkSection(original, state, taskRegistry);
  const withGovernanceQueue = updateGovernanceQueueSection(withRetryPattern, state);
  const withRetrospective = updateSessionRetrospectiveSection(withGovernanceQueue, state);

  if (withRetrospective !== original) {
    fs.writeFileSync(progressPath, withRetrospective, "utf8");
    logRuntimeFileWrite(projectDir, progressPath, withRetrospective, {
      category: "progress",
      writer: "syncProgressFromState",
      format: "text"
    });
  }
}
