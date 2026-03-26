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
  if (process.env.CODEX_PROJECT_DIR) {
    return process.env.CODEX_PROJECT_DIR;
  }

  const start = input.cwd || process.cwd();
  return findProjectDir(start) || start;
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

function extractStoryPath(block) {
  return normalizeArtifactField(
    block.match(/\*\*Story\*\*:\s*`([^`]+)`/)?.[1] ||
      block.match(/\*\*Implementation Plan\*\*:\s*`([^`]+)`/)?.[1] ||
      block.match(/- Implementation Plan:\s*`([^`]+)`/)?.[1] ||
      block.match(/- Story:\s*`([^`]+)`/)?.[1] ||
      null
  );
}

function extractSummaryPath(block) {
  return normalizeArtifactField(
    block.match(/- Plan Summary:\s*`([^`]+)`/)?.[1] ||
      block.match(/\*\*Plan Summary\*\*:\s*`([^`]+)`/)?.[1] ||
      block.match(/\*\*Story Summary\*\*:\s*`([^`]+)`/)?.[1] ||
      null
  );
}

function stripHtmlComments(text) {
  return String(text || "").replace(/<!--[\s\S]*?-->/g, "");
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function createEmptyTaskContext() {
  return {
    version: 1,
    updated_at: null,
    collaboration: {
      preferred_address: "boss",
      greeting_style: "brief",
      first_startup_greeting_completed: false
    },
    task: {
      current_task: "",
      status: "idle",
      class: "unknown",
      risk: "unknown",
      delivery_mode: "direct",
      route_rationale: "",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["startup scan or cached repo context", "direct implementation", "targeted sanity checks"],
      qc_policy: "disabled",
      follow_policy: "disabled",
      validation_profile_status: "not-set",
      open_questions: []
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
}

function normalizeProfileValue(value) {
  return String(value || "").replace(/`/g, "").trim();
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

  return {
    task: normalizeProfileValue(task.current_task) || null,
    taskStatus: normalizeProfileValue(task.status) || "idle",
    taskClass: normalizeProfileValue(task.class) || null,
    riskLevel: normalizeProfileValue(task.risk) || null,
    deliveryMode: normalizeProfileValue(task.delivery_mode) || null,
    routeRationale: normalizeProfileValue(task.route_rationale) || null,
    routingOverrides: normalizeListValue(task.routing_overrides),
    enabledRoles: normalizeListValue(task.enabled_roles),
    enabledModules: normalizeListValue(task.enabled_modules),
    qcPolicy: normalizeProfileValue(task.qc_policy) || null,
    followPolicy: normalizeProfileValue(task.follow_policy) || null,
    validationProfileStatus: normalizeProfileValue(task.validation_profile_status) || null,
    openQuestions: normalizeListValue(task.open_questions),
    preferredAddress: normalizeProfileValue(collaboration.preferred_address) || "boss",
    greetingStyle: normalizeProfileValue(collaboration.greeting_style) || "brief",
    firstStartupGreetingCompleted: Boolean(collaboration.first_startup_greeting_completed)
  };
}

export function loadProjectProfileState(projectDir) {
  const taskContextPath = path.join(projectDir, ".codex", "state", "task-context.json");
  if (fs.existsSync(taskContextPath)) {
    const parsed = loadJsonFile(taskContextPath, createEmptyTaskContext);
    return mapTaskContextToProfile(parsed);
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
      followPolicy: null,
      validationProfileStatus: null,
      preferredAddress: "boss",
      greetingStyle: "brief",
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
    deliveryMode: normalizeProfileValue(readProfileField(text, "Selected delivery mode")) || null,
    routeRationale: normalizeProfileValue(readProfileField(text, "Route rationale")) || null,
    enabledRoles: parseProfileList(readProfileField(text, "Enabled roles")),
    enabledModules: parseProfileList(readProfileField(text, "Enabled modules")),
    qcPolicy: normalizeProfileValue(readProfileField(text, "QC policy")) || null,
    followPolicy: normalizeProfileValue(readProfileField(text, "Follow policy")) || null,
    validationProfileStatus: normalizeProfileValue(readProfileField(text, "Validation profile status")) || null,
    preferredAddress: normalizeProfileValue(readProfileField(text, "Preferred address")) || "boss",
    greetingStyle: normalizeProfileValue(readProfileField(text, "Greeting style")) || "brief",
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

export function isTaskSettled(profile = {}) {
  const taskStatus = String(profile.taskStatus || "").toLowerCase();
  return taskStatus === "done" || taskStatus === "idle";
}

export function isOrchestratedProfile(profile = {}) {
  return String(profile.deliveryMode || "").toLowerCase() === "orchestrated";
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
      const storyPath = extractStoryPath(block);
      const summaryPath = extractSummaryPath(block);
      const branch = normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null);
      const worktree = normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null);

      return {
        title,
        storyPath,
        summaryPath,
        branch,
        worktree
      };
    })
    .filter((item) => item.storyPath || item.branch || item.worktree);
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

export function extractStructuredResult(message) {
  const text = String(message || "");
  const structuredMatch = [...text.matchAll(/## Structured Result[\s\S]*?```json\s*([\s\S]*?)```/gi)].pop();
  const fallbackMatch = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop();
  const jsonBlock = structuredMatch?.[1] || fallbackMatch?.[1];

  if (!jsonBlock) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonBlock);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
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
    /Implementation Complete|实现完成|tests written|testing complete|测试编写完成|已完成测试/i.test(text)
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
      return [".codex/agents/coder.toml", ".agents/skills/qc/SKILL.md"];
    case "fake-test":
    case "missing-test":
      return [".codex/agents/tester.toml", ".agents/skills/qc/SKILL.md"];
    case "missing-implementation":
    case "plan-mismatch":
    case "error-handling":
      return [".codex/agents/coder.toml", ".agents/skills/qc/SKILL.md"];
    case "shared-protocol":
      return ["AGENTS.md", ".codex/templates/progress.md"];
    case "environment-mismatch":
      return [".agents/skills/follow/SKILL.md", "AGENTS.md"];
    default:
      return [".agents/skills/qc/SKILL.md"];
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

function ensureProgressRuntimeSections(text, state) {
  let next = text;

  if (state.pendingActions.some((item) => item.type === "session_retrospective")) {
    next = ensureProgressSection(next, "## Session Retrospective (Optional)", "<!-- No pending retrospective prompts -->");
  }

  if (state.learningQueue.length > 0) {
    next = ensureProgressSection(next, "## Learning Queue (Optional)", "<!-- No queued lessons -->");
  }

  return next;
}

function updateCurrentWorkSection(text, activeStories, state) {
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

          const storyPath = extractStoryPath(chunk);
          if (!storyPath) {
            return chunk;
          }

          const summary = summarizeRetryPattern(state, storyPath);
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

  if (withRetryPattern !== original) {
    fs.writeFileSync(progressPath, withRetryPattern, "utf8");
  }
}
