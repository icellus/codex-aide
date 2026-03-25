import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export async function readJsonStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function getProjectDir(input = {}) {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }

  const start = input.cwd || process.cwd();
  return findProjectDir(start) || start;
}

function findProjectDir(start) {
  let current = path.resolve(start);

  for (let i = 0; i < 5; i += 1) {
    if (fs.existsSync(path.join(current, ".claude"))) {
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

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function createEmptyState() {
  return {
    version: 1,
    updatedAt: null,
    recentSubagentEvents: [],
    pendingActions: [],
    failurePatterns: {},
    learningQueue: []
  };
}

export function loadRuntimeState(projectDir) {
  const stateDir = path.join(projectDir, ".claude", "state");
  const statePath = path.join(stateDir, "runtime-state.json");

  ensureDir(stateDir);

  if (!fs.existsSync(statePath)) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return {
      ...createEmptyState(),
      ...parsed
    };
  } catch {
    return createEmptyState();
  }
}

export function saveRuntimeState(projectDir, state) {
  const stateDir = path.join(projectDir, ".claude", "state");
  const statePath = path.join(stateDir, "runtime-state.json");

  ensureDir(stateDir);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
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

export function parseActiveStories(progressPath) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return [];
  }

  const text = fs.readFileSync(progressPath, "utf8");
  const sectionMatch = text.match(/## Current Work([\s\S]*?)(?:\n## |\n---\n## |\n##$|$)/);
  if (!sectionMatch) {
    return [];
  }

  const blocks = sectionMatch[1]
    .split(/\n(?=### )/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("### "));

  return blocks.map((block) => {
    const title = block.match(/^###\s+(.+)$/m)?.[1]?.trim() || "Unknown Plan";
    const storyPath =
      block.match(/\*\*Story\*\*:\s*`([^`]+)`/)?.[1] ||
      block.match(/- Implementation Plan:\s*`([^`]+)`/)?.[1] ||
      null;
    const summaryPath =
      block.match(/- Plan Summary:\s*`([^`]+)`/)?.[1] ||
      block.match(/\*\*Plan Summary\*\*:\s*`([^`]+)`/)?.[1] ||
      block.match(/\*\*Story Summary\*\*:\s*`([^`]+)`/)?.[1] ||
      null;
    const branch = block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null;
    const worktree = block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null;

    return {
      title,
      storyPath,
      summaryPath,
      branch,
      worktree
    };
  });
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

export function resolveActiveStory(activeStories, input = {}, projectDir) {
  if (!Array.isArray(activeStories) || activeStories.length === 0) {
    return null;
  }

  const explicitPlan = [input.plan_path, input.planPath, input.plan, input.story_path, input.storyPath, input.story]
    .map((value) => String(value || "").trim())
    .find(Boolean);

  if (explicitPlan) {
    const exact = activeStories.filter((item) => item.storyPath === explicitPlan);
    if (exact.length === 1) {
      return exact[0];
    }

    const byBase = activeStories.filter(
      (item) => item.storyPath && basenameLabel(item.storyPath) === basenameLabel(explicitPlan)
    );
    if (byBase.length === 1) {
      return byBase[0];
    }
  }

  const cwd = input.cwd ? path.resolve(String(input.cwd)) : null;
  if (cwd) {
    const worktreeMatches = activeStories.filter((item) => {
      const worktreePath = resolveWorkflowPath(projectDir, item.worktree);
      return worktreePath ? pathContains(worktreePath, cwd) : false;
    });

    if (worktreeMatches.length === 1) {
      return worktreeMatches[0];
    }

    const branch = currentGitBranch(cwd);
    if (branch) {
      const branchMatches = activeStories.filter((item) => item.branch === branch);
      if (branchMatches.length === 1) {
        return branchMatches[0];
      }
    }
  }

  if (activeStories.length === 1) {
    return activeStories[0];
  }

  return null;
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

export function detectSubagentStatus(agentType, message) {
  const text = normalizeText(message);

  if (/blocked|阻塞|需要帮助|human intervention/i.test(text)) {
    return "blocked";
  }

  if (
    /Implementation Complete|实现完成|tests written|testing complete|测试编写完成|已完成测试/i.test(text)
  ) {
    return "complete";
  }

  return "other";
}

export function detectQcPass(message) {
  const text = normalizeText(message);
  return /QC 检查通过|QC passed|QC pass|Overall Verdict:\s*PASS\b|Overall Verdict:\s*PASS WITH WARNINGS/i.test(text);
}

export function detectQcFail(message) {
  const text = normalizeText(message);
  return /QC 检查失败|QC failure|QC failed|QC fail|Overall Verdict:\s*FAIL\b|FAKE TEST|MISSING TEST|NOT IMPLEMENTED/i.test(text);
}

export function detectFailureCategories(message) {
  const text = normalizeText(message);
  const categories = new Set();

  if (/TODO|FIXME|placeholder/i.test(text)) {
    categories.add("placeholder");
  }
  if (/假测试|FAKE TEST|fake test/i.test(text)) {
    categories.add("fake-test");
  }
  if (/缺失测试|MISSING TEST/i.test(text)) {
    categories.add("missing-test");
  }
  if (/未实现|NOT IMPLEMENTED|missing implementation/i.test(text)) {
    categories.add("missing-implementation");
  }
  if (/Plan 对齐问题|plan mismatch|plan align|Implementation Plan mismatch/i.test(text)) {
    categories.add("plan-mismatch");
  }
  if (/错误处理|error handling/i.test(text)) {
    categories.add("error-handling");
  }
  if (/shared protocol|交接协议|interface between roles/i.test(text)) {
    categories.add("shared-protocol");
  }
  if (/environment mismatch|connection refused|postgres service|CI missing/i.test(text)) {
    categories.add("environment-mismatch");
  }

  return Array.from(categories);
}

export function suggestedRoutesForCategory(category) {
  switch (category) {
    case "placeholder":
      return ["coder.md", "qc.md"];
    case "fake-test":
    case "missing-test":
      return ["tester.md", "qc.md"];
    case "missing-implementation":
    case "plan-mismatch":
    case "error-handling":
      return ["coder.md", "qc.md"];
    case "shared-protocol":
      return ["CLAUDE.md", "templates/progress.md"];
    case "environment-mismatch":
      return ["follow.md", "CLAUDE.md"];
    default:
      return ["qc.md"];
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
  state.recentSubagentEvents = state.recentSubagentEvents.slice(-25);
  state.pendingActions = state.pendingActions.slice(-20);
  state.learningQueue = state.learningQueue.slice(-25);
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

function summarizeRetryPattern(state, storyPath) {
  const source = storyPath || "unknown";
  const items = Object.values(state.failurePatterns)
    .filter((item) => item.source === source)
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  if (items.length === 0) {
    return "None";
  }

  return items.map((item) => `${item.category} x${item.count}`).join(", ");
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

function updateCurrentWorkSection(text, activeStories, state) {
  const match = text.match(/(## Current Work\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## Completed|\n## Completed|$)/);
  if (!match) {
    return text;
  }

  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];

  const chunks = body.split(/\n(?=### )/g);

  const updatedChunks = chunks.map((chunk) => {
    if (!chunk.startsWith("### ")) {
      return chunk;
    }

    const storyPath = chunk.match(/\*\*Story\*\*:\s*`([^`]+)`/)?.[1] || null;
    if (!storyPath) {
      return chunk;
    }

    const summary = summarizeRetryPattern(state, storyPath);
    return updateQcRetryPatternLine(chunk, summary);
  });

  return text.replace(match[0], `${prefix}${updatedChunks.join("\n")}${suffix}`);
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

function retrospectiveSlug(storyPath) {
  const raw = basenameLabel(storyPath || "unknown").toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildRetrospectiveBlock(entry, blockId) {
  const categories =
    Array.isArray(entry.categories) && entry.categories.length > 0
      ? entry.categories.map((category) => `- \`${category}\``)
      : ["- `None`"];

  return [
    `### ${blockId}`,
    `**Story**: \`${entry.storyPath || "unknown"}\``,
    `**Trigger**: \`${entry.trigger || "pending"}\``,
    "**Decisions Made**:",
    "- Pending capture during the next internal orchestration handoff or session close.",
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
    storyPath: chunk.match(/\*\*Story\*\*:\s*`([^`]+)`/)?.[1] || null,
    writebackDecision: chunk.match(/\*\*Writeback Decision\*\*:\s*`([^`]+)`/)?.[1] || null,
    chunk
  };
}

function isPendingAutoRetrospective(parsed) {
  return (
    parsed.writebackDecision === "pending retrospective" &&
    parsed.chunk.includes("Pending capture during the next internal orchestration handoff or session close.") &&
    parsed.chunk.includes("- Prompt:")
  );
}

function nextRetrospectiveId(storyPath, existingIds) {
  const slug = retrospectiveSlug(storyPath);
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
  const match = text.match(/(## Session Retrospective \(Optional\)\s*\n\n)([\s\S]*?)(\n---\s*\n\s*## Learning Queue|\n## Learning Queue|$)/);
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
    const related = parsedBlocks.filter((item) => item.storyPath === (entry.storyPath || "unknown"));
    const updatable = related.find((item) => isPendingAutoRetrospective(item));
    const pendingManual = related.find(
      (item) => item.writebackDecision === "pending retrospective" && !isPendingAutoRetrospective(item)
    );

    if (pendingManual) {
      continue;
    }

    const id = updatable?.id || nextRetrospectiveId(entry.storyPath || "unknown", Array.from(blockMap.keys()));
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

export function syncProgressFromState(progressPath, activeStories, state) {
  if (!progressPath || !fs.existsSync(progressPath)) {
    return;
  }

  const original = fs.readFileSync(progressPath, "utf8");
  const withRetryPattern = updateCurrentWorkSection(original, activeStories, state);
  const withRetrospectives = updateSessionRetrospectiveSection(withRetryPattern, state);
  const withLearningQueue = updateLearningQueueSection(withRetrospectives, state);

  if (withLearningQueue !== original) {
    fs.writeFileSync(progressPath, withLearningQueue, "utf8");
  }
}
