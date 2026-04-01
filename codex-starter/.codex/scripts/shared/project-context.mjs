import fs from "node:fs";
import path from "node:path";

function normalizeProjectDirCandidate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isInside(baseDir, candidatePath) {
  const relative = path.relative(baseDir, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasCodexRoot(dirPath) {
  return fs.existsSync(path.join(dirPath, ".codex"));
}

function findProjectDir(start) {
  let current = path.resolve(start);

  while (true) {
    if (hasCodexRoot(current)) {
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

function repoContextPath(projectDir) {
  return path.join(projectDir, ".codex", "state", "repo-context.json");
}

function readCachedRepoRoot(projectDir) {
  const filePath = repoContextPath(projectDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const candidate = normalizeProjectDirCandidate(parsed?.repo_root);
    if (!candidate || !path.isAbsolute(candidate)) {
      return null;
    }

    const absoluteCandidate = path.resolve(candidate);
    if (!hasCodexRoot(absoluteCandidate)) {
      return null;
    }

    return absoluteCandidate;
  } catch {
    return null;
  }
}

function canonicalizeProjectDir(startPath) {
  const absoluteStart = path.resolve(startPath);
  const discoveredRoot = findProjectDir(absoluteStart);

  if (!discoveredRoot) {
    return {
      projectDir: absoluteStart,
      cachedRepoRoot: null
    };
  }

  return {
    projectDir: discoveredRoot,
    cachedRepoRoot: (() => {
      const cachedRepoRoot = readCachedRepoRoot(discoveredRoot);
      return cachedRepoRoot && (cachedRepoRoot === discoveredRoot || isInside(cachedRepoRoot, discoveredRoot))
        ? cachedRepoRoot
        : null;
    })()
  };
}

export function absolutizeProjectPath(projectDir, inputPath) {
  const normalized = normalizeProjectDirCandidate(inputPath);
  if (!normalized) {
    return "";
  }

  return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(projectDir, normalized);
}

export function getProjectContext(input = {}) {
  const envProjectDir = normalizeProjectDirCandidate(process.env.CODEX_PROJECT_DIR);
  if (envProjectDir) {
    const startPath = path.resolve(envProjectDir);
    const canonical = canonicalizeProjectDir(startPath);
    return {
      projectDir: canonical.projectDir,
      source: "env.CODEX_PROJECT_DIR",
      startPath,
      cachedRepoRoot: canonical.cachedRepoRoot
    };
  }

  const directProjectDir = normalizeProjectDirCandidate(input.projectDir);
  if (directProjectDir) {
    const startPath = path.resolve(directProjectDir);
    const canonical = canonicalizeProjectDir(startPath);
    return {
      projectDir: canonical.projectDir,
      source: "input.projectDir",
      startPath,
      cachedRepoRoot: canonical.cachedRepoRoot
    };
  }

  const cwd = normalizeProjectDirCandidate(input.cwd);
  if (cwd) {
    const startPath = path.resolve(cwd);
    const canonical = canonicalizeProjectDir(startPath);
    return {
      projectDir: canonical.projectDir,
      source: "input.cwd",
      startPath,
      cachedRepoRoot: canonical.cachedRepoRoot
    };
  }

  const startPath = process.cwd();
  const canonical = canonicalizeProjectDir(startPath);
  return {
    projectDir: canonical.projectDir,
    source: "process.cwd",
    startPath,
    cachedRepoRoot: canonical.cachedRepoRoot
  };
}
