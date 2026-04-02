import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const starterRoot = path.join(packageRoot, "starter");
const sourceAgentsPath = path.join(starterRoot, "AGENTS.md");
const sourceRuntimeDir = path.join(starterRoot, "aide");

function assertDirectory(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label} not found: ${dirPath}`);
  }

  if (!fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${label} must be a directory: ${dirPath}`);
  }
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  if (!fs.statSync(filePath).isFile()) {
    throw new Error(`${label} must be a file: ${filePath}`);
  }
}

function formatPath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function listFilesRecursive(rootDir) {
  const results = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath));
      continue;
    }

    if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

function isProtectedRuntimePath(relativePath) {
  const normalizedPath = formatPath(relativePath);

  if (normalizedPath.startsWith("logs/")) {
    return true;
  }

  if (normalizedPath.startsWith("progress/")) {
    return true;
  }

  if (normalizedPath.startsWith("artifacts/")) {
    return true;
  }

  if (normalizedPath.startsWith("product/")) {
    return true;
  }

  if (normalizedPath === "context/project-profile.md") {
    return true;
  }

  if (normalizedPath === "policies/validation-profile.json") {
    return true;
  }

  if (normalizedPath.startsWith("state/") && normalizedPath.endsWith(".json") && !normalizedPath.endsWith(".demo.json")) {
    return true;
  }

  return false;
}

function verifyInstallSources() {
  assertFile(sourceAgentsPath, "starter AGENTS");
  assertDirectory(sourceRuntimeDir, "starter aide runtime");
}

function installRuntime({
  targetDir = process.cwd(),
  dryRun = false
} = {}) {
  verifyInstallSources();

  const resolvedTargetDir = path.resolve(targetDir);
  assertDirectory(resolvedTargetDir, "target directory");

  const targetAgentsPath = path.join(resolvedTargetDir, "AGENTS.md");
  const targetCodexDir = path.join(resolvedTargetDir, ".codex");
  const targetRuntimeDir = path.join(targetCodexDir, "aide");

  if (fs.existsSync(targetAgentsPath)) {
    throw new Error(`install target already has AGENTS.md: ${formatPath(targetAgentsPath)}`);
  }

  if (fs.existsSync(targetRuntimeDir) && !fs.statSync(targetRuntimeDir).isDirectory()) {
    throw new Error(`install target runtime path must be a directory: ${formatPath(targetRuntimeDir)}`);
  }

  const sourceFiles = listFilesRecursive(sourceRuntimeDir);
  const installedFiles = [];
  const overwrittenFiles = [];
  const preservedRuntimeFiles = new Set();

  if (fs.existsSync(targetRuntimeDir)) {
    for (const existingFilePath of listFilesRecursive(targetRuntimeDir)) {
      const relativePath = path.relative(targetRuntimeDir, existingFilePath);
      if (!isProtectedRuntimePath(relativePath)) {
        continue;
      }

      preservedRuntimeFiles.add(formatPath(existingFilePath));
    }
  }

  if (!dryRun) {
    fs.mkdirSync(targetCodexDir, { recursive: true });
    fs.mkdirSync(targetRuntimeDir, { recursive: true });
    fs.cpSync(sourceAgentsPath, targetAgentsPath);
  }

  for (const sourceFilePath of sourceFiles) {
    const relativePath = path.relative(sourceRuntimeDir, sourceFilePath);
    const targetFilePath = path.join(targetRuntimeDir, relativePath);
    const normalizedTargetFilePath = formatPath(targetFilePath);

    if (fs.existsSync(targetFilePath)) {
      if (isProtectedRuntimePath(relativePath)) {
        continue;
      }

      overwrittenFiles.push(normalizedTargetFilePath);
    } else {
      installedFiles.push(normalizedTargetFilePath);
    }

    if (!dryRun) {
      fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
      fs.cpSync(sourceFilePath, targetFilePath);
    }
  }

  return {
    summary: `${dryRun ? "Dry run complete." : "Install complete."}`,
    details: [
      `${dryRun ? "Would install" : "Installed"} AGENTS.md -> ${formatPath(targetAgentsPath)}`,
      `${dryRun ? "Would ensure" : "Ensured"} runtime root -> ${formatPath(targetRuntimeDir)}`,
      `${dryRun ? "Would install" : "Installed"} ${installedFiles.length} runtime file(s)`,
      `${dryRun ? "Would overwrite" : "Overwrote"} ${overwrittenFiles.length} shipped file(s)`,
      `${dryRun ? "Would preserve" : "Preserved"} ${preservedRuntimeFiles.size} runtime file(s)`
    ]
  };
}

export { installRuntime };
