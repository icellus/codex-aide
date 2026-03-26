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
      delivery_mode: "lightweight",
      route_rationale: "",
      routing_overrides: [],
      enabled_roles: ["Aide", "main agent"],
      enabled_modules: ["startup scan or cached repo context", "lightweight implementation", "targeted sanity checks"],
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

export function createEmptyTaskRegistry() {
  return {
    version: 1,
    updatedAt: null,
    currentTaskId: null,
    tasks: []
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
  if (normalized.toLowerCase() === "direct implementation") {
    return "lightweight implementation";
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
    deliveryMode: normalizeDeliveryModeValue(readProfileField(text, "Selected delivery mode")) || null,
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
      storyPath: extractStoryPath(block),
      summaryPath: extractSummaryPath(block),
      branch: normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null),
      worktree: normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null),
      taskClass: extractBulletField(block, "Task Class"),
      deliveryMode: extractBulletField(block, "Delivery Mode"),
      status: extractBulletField(block, "Status") || "active",
      checkpoint: extractBulletField(block, "Current Checkpoint"),
      nextStep: extractBulletField(block, "Next Step")
    }))
    .filter((item) => item.title || item.storyPath || item.branch || item.worktree);
}

function parseParkedWorkItems(text) {
  return splitProgressBlocks(extractSectionBody(text, "(?:Parked or Blocked|Blockers or Exceptions)"))
    .map((block) => ({
      title: extractTitle(block),
      storyPath: extractStoryPath(block),
      summaryPath: extractSummaryPath(block),
      branch: normalizeArtifactField(block.match(/\*\*Branch\*\*:\s*`([^`]+)`/)?.[1] || null),
      worktree: normalizeArtifactField(block.match(/\*\*Worktree\*\*:\s*`([^`]+)`/)?.[1] || null),
      status: extractBulletField(block, "Status") || "blocked",
      checkpoint: extractBulletField(block, "Current Checkpoint") || extractBulletField(block, "Checkpoint"),
      reason: extractBulletField(block, "Reason"),
      owner: extractBulletField(block, "Owner"),
      nextStep: extractBulletField(block, "Suggested Resume Point") || extractBulletField(block, "Unblock Action")
    }))
    .filter((item) => item.title || item.storyPath || item.reason || item.nextStep);
}

function parseCompletedWorkItems(text) {
  return splitProgressBlocks(extractSectionBody(text, "(?:Completed|Completed Releases or Milestones)"))
    .map((block) => ({
      title: extractTitle(block),
      storyPath: extractStoryPath(block),
      summaryPath: extractSummaryPath(block),
      completedAt: extractBulletField(block, "Completed"),
      summary: extractBulletField(block, "Outcome") || extractBulletField(block, "Summary"),
      validation: extractBulletField(block, "Validation"),
      nextStep: extractBulletField(block, "Follow-up")
    }))
    .filter((item) => item.title || item.storyPath || item.summary);
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

function slugifyTaskValue(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task";
}

function createTaskMatchKey(entry = {}) {
  if (entry.storyPath) {
    return `story:${String(entry.storyPath).trim()}`;
  }

  return `task:${slugifyTaskValue(entry.title || entry.task || entry.currentTask || "untitled-task")}`;
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
  writeTaskField(next, "storyPath", entry.storyPath);
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

export function syncTaskRegistry(projectDir, input = {}) {
  const now = input.now || new Date().toISOString();
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
          title: item.task,
          storyPath: item.storyPath,
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
  saveTaskRegistry(projectDir, registry);
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
    storyPath: chunk.match(/\*\*Story\*\*:\s*`([^`]+)`/)?.[1] || null,
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
