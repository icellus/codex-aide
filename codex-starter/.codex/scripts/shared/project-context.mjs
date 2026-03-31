import fs from "node:fs";
import path from "node:path";

function normalizeProjectDirCandidate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

  const directProjectDir = normalizeProjectDirCandidate(input.projectDir);
  if (directProjectDir) {
    const startPath = path.resolve(directProjectDir);
    return {
      projectDir: findProjectDir(startPath) || startPath,
      source: "input.projectDir",
      startPath
    };
  }

  const cwd = normalizeProjectDirCandidate(input.cwd);
  if (cwd) {
    const startPath = path.resolve(cwd);
    return {
      projectDir: findProjectDir(startPath) || startPath,
      source: "input.cwd",
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
