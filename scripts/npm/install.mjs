import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const starterRoot = path.join(packageRoot, "starter");
const sourceAgentsPath = path.join(starterRoot, "AGENTS.md");
const sourceRuntimeDir = path.join(starterRoot, "aide");
const sourceRuntimeConfigPath = path.join(starterRoot, "config.toml");
const sourceHooksPath = path.join(starterRoot, "hooks.json");
const managedAgentsStart = "<!-- codex-aide:start -->";
const managedAgentsEnd = "<!-- codex-aide:end -->";
const managedGitignoreStart = "# codex-aide:start";
const managedGitignoreEnd = "# codex-aide:end";
const managedGitignoreEntries = ["/AGENTS.md", "/.codex/"];

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

function normalizeTextFile(text) {
  return String(text || "").replace(/\r/g, "");
}

function wrapManagedAgentsBlock(text) {
  const normalized = normalizeTextFile(text).trimEnd();
  return `${managedAgentsStart}\n${normalized}\n${managedAgentsEnd}\n`;
}

function normalizeManagedText(text) {
  const normalized = normalizeTextFile(text).trimEnd();
  return normalized ? `${normalized}\n` : "";
}

function mergeAgentsContract(existingText, managedText) {
  const normalizedExisting = normalizeTextFile(existingText);
  const normalizedManaged = normalizeTextFile(managedText).trimEnd();
  const wrappedManaged = wrapManagedAgentsBlock(normalizedManaged);
  const existingTrimmed = normalizedExisting.trim();
  const existingLeadingTrimmed = normalizedExisting.trimStart();

  if (!existingTrimmed) {
    return normalizedManaged ? `${normalizedManaged}\n` : "";
  }

  if (existingLeadingTrimmed.startsWith(normalizedManaged)) {
    const after = existingLeadingTrimmed.slice(normalizedManaged.length).replace(/^\n+/, "");
    return `${wrappedManaged}${after ? `\n${after}` : ""}`.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");
  }

  const startIndex = normalizedExisting.indexOf(managedAgentsStart);
  const endIndex = normalizedExisting.indexOf(managedAgentsEnd);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = normalizedExisting.slice(0, startIndex);
    const after = normalizedExisting.slice(endIndex + managedAgentsEnd.length).replace(/^\n+/, "");
    const merged = `${before}${wrappedManaged}${after ? `\n${after}` : ""}`;
    return merged.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");
  }

  return `${wrappedManaged}\n${normalizedExisting.trimStart()}`.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");
}

function stripManagedBlock(text, blockStart, blockEnd) {
  const normalized = normalizeTextFile(text);
  const startIndex = normalized.indexOf(blockStart);
  const endIndex = normalized.indexOf(blockEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {
      text: normalizeManagedText(normalized),
      hasManagedBlock: false
    };
  }

  const before = normalized.slice(0, startIndex).trimEnd();
  const after = normalized.slice(endIndex + blockEnd.length).trimStart();
  const parts = [];

  if (before) {
    parts.push(before);
  }

  if (after) {
    parts.push(after);
  }

  return {
    text: parts.length > 0 ? `${parts.join("\n\n").replace(/\n{3,}/g, "\n\n")}\n` : "",
    hasManagedBlock: true
  };
}

function gitignoreLineCoversEntry(line, entry) {
  const normalizedLine = line.trim();

  if (!normalizedLine || normalizedLine.startsWith("#")) {
    return false;
  }

  if (entry === "/AGENTS.md") {
    return normalizedLine === "AGENTS.md" || normalizedLine === "/AGENTS.md";
  }

  if (entry === "/.codex/") {
    return (
      normalizedLine === ".codex/" ||
      normalizedLine === "/.codex/" ||
      normalizedLine === ".codex" ||
      normalizedLine === "/.codex"
    );
  }

  return normalizedLine === entry;
}

function listMissingGitignoreEntries(text) {
  const lines = normalizeTextFile(text).split(/\n/);

  return managedGitignoreEntries.filter(
    (entry) => !lines.some((line) => gitignoreLineCoversEntry(line, entry))
  );
}

function buildManagedGitignoreBlock(entries) {
  return `${managedGitignoreStart}\n${entries.join("\n")}\n${managedGitignoreEnd}\n`;
}

function mergeGitignore(existingText = "") {
  const { text: unmanagedText, hasManagedBlock } = stripManagedBlock(existingText, managedGitignoreStart, managedGitignoreEnd);
  const missingEntries = listMissingGitignoreEntries(unmanagedText);
  const managedBlock = missingEntries.length > 0 ? buildManagedGitignoreBlock(missingEntries) : "";

  if (!managedBlock) {
    return {
      text: unmanagedText,
      hasManagedBlock
    };
  }

  if (!unmanagedText.trim()) {
    return {
      text: managedBlock,
      hasManagedBlock
    };
  }

  return {
    text: `${unmanagedText.trimEnd()}\n\n${managedBlock}`,
    hasManagedBlock
  };
}

function manageGitignore(gitignorePath, dryRun) {
  const fileExists = fs.existsSync(gitignorePath);
  const existingText = fileExists ? fs.readFileSync(gitignorePath, "utf8") : "";
  const { text: mergedText, hasManagedBlock } = mergeGitignore(existingText);
  const normalizedExistingText = normalizeManagedText(existingText);
  const changed = mergedText !== normalizedExistingText;
  let action = dryRun ? "would-create" : "created";

  if (fileExists) {
    if (!changed) {
      action = dryRun ? "would-keep" : "kept";
    } else if (hasManagedBlock) {
      action = dryRun ? "would-update" : "updated";
    } else {
      action = dryRun ? "would-update" : "updated";
    }
  }

  if (changed && !dryRun) {
    fs.writeFileSync(gitignorePath, mergedText, "utf8");
  }

  return {
    action,
    changed
  };
}

function normalizeJsonText(text) {
  if (!String(text || "").trim()) {
    return "{}\n";
  }

  return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
}

function mergeHooksConfig(existingText = "", sourceText = "") {
  const sourceConfig = JSON.parse(sourceText);
  if (!sourceConfig || typeof sourceConfig !== "object" || Array.isArray(sourceConfig)) {
    throw new Error("starter hooks config must be a JSON object");
  }

  if (!sourceConfig.hooks || typeof sourceConfig.hooks !== "object" || Array.isArray(sourceConfig.hooks)) {
    throw new Error("starter hooks config must define object field \"hooks\"");
  }

  const merged = String(existingText || "").trim() ? JSON.parse(existingText) : {};
  if (!merged || typeof merged !== "object" || Array.isArray(merged)) {
    throw new Error("existing hooks config must be a JSON object");
  }

  if (merged.hooks == null) {
    merged.hooks = {};
  } else if (typeof merged.hooks !== "object" || Array.isArray(merged.hooks)) {
    throw new Error("existing hooks config field \"hooks\" must be an object");
  }

  for (const [eventName, entries] of Object.entries(sourceConfig.hooks)) {
    if (!Array.isArray(entries)) {
      throw new Error(`starter hooks config event "${eventName}" must be an array`);
    }

    if (merged.hooks[eventName] == null) {
      merged.hooks[eventName] = [];
    } else if (!Array.isArray(merged.hooks[eventName])) {
      throw new Error(`existing hooks config event "${eventName}" must be an array`);
    }

    const seen = new Set(merged.hooks[eventName].map((entry) => JSON.stringify(entry)));
    for (const entry of entries) {
      const key = JSON.stringify(entry);
      if (seen.has(key)) {
        continue;
      }

      merged.hooks[eventName].push(entry);
      seen.add(key);
    }
  }

  return `${JSON.stringify(merged, null, 2)}\n`;
}

function manageHooksConfig(hooksPath, sourceText, dryRun) {
  const fileExists = fs.existsSync(hooksPath);
  const existingText = fileExists ? fs.readFileSync(hooksPath, "utf8") : "";
  const mergedText = mergeHooksConfig(existingText, sourceText);
  const normalizedExistingText = normalizeJsonText(existingText);
  const changed = mergedText !== normalizedExistingText;
  let action = dryRun ? "would-create" : "created";

  if (fileExists) {
    action = changed ? (dryRun ? "would-update" : "updated") : (dryRun ? "would-keep" : "kept");
  }

  if (changed && !dryRun) {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, mergedText, "utf8");
  }

  return {
    action,
    changed
  };
}

function mergeProjectConfig(existingText, managedText) {
  const normalizedExisting = normalizeTextFile(existingText);
  const normalizedManaged = normalizeTextFile(managedText).trim();

  if (!normalizedManaged) {
    return normalizeManagedText(normalizedExisting);
  }

  if (!normalizedExisting.trim()) {
    return `${normalizedManaged}\n`;
  }

  const managedLines = normalizedManaged.split("\n");
  const managedFeatureLines = managedLines
    .filter((line) => !/^\s*\[features\]\s*$/.test(line))
    .map((line) => line.trim())
    .filter(Boolean);
  const managedFeatureKeys = new Set(
    managedFeatureLines
      .map((line) => line.match(/^([A-Za-z0-9_-]+)\s*=/)?.[1] || "")
      .filter(Boolean)
  );
  const lines = normalizedExisting.split("\n");
  const featureHeaderIndex = lines.findIndex((line) => /^\s*\[features\]\s*$/.test(line));

  if (featureHeaderIndex !== -1) {
    let sectionEndIndex = lines.length;
    for (let index = featureHeaderIndex + 1; index < lines.length; index += 1) {
      if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
        sectionEndIndex = index;
        break;
      }
    }

    const existingFeatureKeys = new Set(
      lines
        .slice(featureHeaderIndex + 1, sectionEndIndex)
        .map((line) => line.trim().match(/^([A-Za-z0-9_-]+)\s*=/)?.[1] || "")
        .filter(Boolean)
    );
    const missingFeatureLines = managedFeatureLines.filter((line) => {
      const key = line.match(/^([A-Za-z0-9_-]+)\s*=/)?.[1] || "";
      if (!key) {
        return true;
      }

      return !existingFeatureKeys.has(key);
    });

    if (missingFeatureLines.length === 0 || managedFeatureKeys.size === 0) {
      return normalizeManagedText(normalizedExisting);
    }

    lines.splice(sectionEndIndex, 0, ...missingFeatureLines);
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  }

  return `${normalizedExisting.trimEnd()}\n\n${normalizedManaged}\n`;
}

function manageProjectConfig(configPath, sourceText, dryRun) {
  const fileExists = fs.existsSync(configPath);
  const existingText = fileExists ? fs.readFileSync(configPath, "utf8") : "";
  const mergedText = mergeProjectConfig(existingText, sourceText);
  const normalizedExistingText = normalizeManagedText(existingText);
  const changed = mergedText !== normalizedExistingText;
  let action = dryRun ? "would-create" : "created";

  if (fileExists) {
    action = changed ? (dryRun ? "would-update" : "updated") : (dryRun ? "would-keep" : "kept");
  }

  if (changed && !dryRun) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, mergedText, "utf8");
  }

  return {
    action,
    changed
  };
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
  assertFile(sourceRuntimeConfigPath, "starter runtime config");
  assertFile(sourceHooksPath, "starter hooks config");
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
  const targetCodexConfigPath = path.join(targetCodexDir, "config.toml");
  const targetHooksPath = path.join(targetCodexDir, "hooks.json");
  const targetRuntimeDir = path.join(targetCodexDir, "aide");
  const targetGitignorePath = path.join(resolvedTargetDir, ".gitignore");

  if (fs.existsSync(targetRuntimeDir) && !fs.statSync(targetRuntimeDir).isDirectory()) {
    throw new Error(`install target runtime path must be a directory: ${formatPath(targetRuntimeDir)}`);
  }

  const sourceAgentsText = fs.readFileSync(sourceAgentsPath, "utf8");
  const sourceRuntimeConfigText = fs.readFileSync(sourceRuntimeConfigPath, "utf8");
  const sourceHooksText = fs.readFileSync(sourceHooksPath, "utf8");
  const sourceFiles = listFilesRecursive(sourceRuntimeDir);
  const installedFiles = [];
  const overwrittenFiles = [];
  const preservedRuntimeFiles = new Set();
  let agentsAction = dryRun ? "would-install" : "installed";
  const gitignoreResult = manageGitignore(targetGitignorePath, dryRun);
  const projectConfigResult = manageProjectConfig(targetCodexConfigPath, sourceRuntimeConfigText, dryRun);
  const hooksResult = manageHooksConfig(targetHooksPath, sourceHooksText, dryRun);

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

    if (fs.existsSync(targetAgentsPath)) {
      const existingAgentsText = fs.readFileSync(targetAgentsPath, "utf8");
      const mergedAgentsText = mergeAgentsContract(existingAgentsText, sourceAgentsText);
      fs.writeFileSync(targetAgentsPath, mergedAgentsText, "utf8");
      agentsAction = existingAgentsText.includes(managedAgentsStart)
        ? "updated"
        : normalizeTextFile(existingAgentsText).trimStart().startsWith(normalizeTextFile(sourceAgentsText).trimEnd())
          ? "wrapped"
          : "prepended";
    } else {
      fs.writeFileSync(targetAgentsPath, `${normalizeTextFile(sourceAgentsText).trimEnd()}\n`, "utf8");
    }
  } else if (fs.existsSync(targetAgentsPath)) {
    const existingAgentsText = fs.readFileSync(targetAgentsPath, "utf8");
    agentsAction = existingAgentsText.includes(managedAgentsStart)
      ? "would-update"
      : normalizeTextFile(existingAgentsText).trimStart().startsWith(normalizeTextFile(sourceAgentsText).trimEnd())
        ? "would-wrap"
        : "would-prepend";
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
      `${dryRun ? "Would manage" : "Managed"} AGENTS.md -> ${formatPath(targetAgentsPath)} (${agentsAction})`,
      `${dryRun ? "Would manage" : "Managed"} .gitignore -> ${formatPath(targetGitignorePath)} (${gitignoreResult.action})`,
      `${dryRun ? "Would manage" : "Managed"} project config -> ${formatPath(targetCodexConfigPath)} (${projectConfigResult.action})`,
      `${dryRun ? "Would manage" : "Managed"} hooks config -> ${formatPath(targetHooksPath)} (${hooksResult.action})`,
      `${dryRun ? "Would ensure" : "Ensured"} runtime root -> ${formatPath(targetRuntimeDir)}`,
      `${dryRun ? "Would install" : "Installed"} ${installedFiles.length} runtime file(s)`,
      `${dryRun ? "Would overwrite" : "Overwrote"} ${overwrittenFiles.length} shipped file(s)`,
      `${dryRun ? "Would preserve" : "Preserved"} ${preservedRuntimeFiles.size} runtime file(s)`
    ]
  };
}

export { installRuntime };
