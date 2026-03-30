import fs from "node:fs";
import path from "node:path";

function normalizeProjectDirCandidate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function projectDirCandidates(input = {}) {
  const sources = [
    ["input.projectDir", input.projectDir],
    ["input.project_dir", input.project_dir],
    ["input.repoRoot", input.repoRoot],
    ["input.repo_root", input.repo_root],
    ["input.repoPath", input.repoPath],
    ["input.repo_path", input.repo_path],
    ["input.workdir", input.workdir],
    ["input.workspace", input.workspace],
    ["input.cwd", input.cwd],
    ["input.tool_input.projectDir", input.tool_input?.projectDir],
    ["input.tool_input.project_dir", input.tool_input?.project_dir],
    ["input.tool_input.repoRoot", input.tool_input?.repoRoot],
    ["input.tool_input.repo_root", input.tool_input?.repo_root],
    ["input.tool_input.repoPath", input.tool_input?.repoPath],
    ["input.tool_input.repo_path", input.tool_input?.repo_path],
    ["input.tool_input.workdir", input.tool_input?.workdir],
    ["input.tool_input.workspace", input.tool_input?.workspace],
    ["input.tool_input.cwd", input.tool_input?.cwd]
  ];

  return sources
    .map(([source, value]) => ({
      source,
      value: normalizeProjectDirCandidate(value)
    }))
    .filter((entry) => entry.value);
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

export function getProjectContext(input = {}) {
  const envProjectDir = normalizeProjectDirCandidate(process.env.CODEX_PROJECT_DIR);
  if (envProjectDir) {
    const startPath = path.resolve(envProjectDir);
    return {
      projectDir: startPath,
      source: "env.CODEX_PROJECT_DIR",
      startPath
    };
  }

  for (const candidate of projectDirCandidates(input)) {
    const startPath = path.resolve(candidate.value);
    return {
      projectDir: findProjectDir(startPath) || startPath,
      source: candidate.source,
      startPath
    };
  }

  const startPath = process.cwd();
  return {
    projectDir: findProjectDir(startPath) || startPath,
    source: "process.cwd",
    startPath
  };
}
