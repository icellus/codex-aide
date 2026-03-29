import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { starterRootDir } from "./test-paths.mjs";

import {
  detectQcFail,
  loadRepoContext,
  loadProjectProfileState,
  saveRepoContext,
  saveTaskContext
} from "../../../codex-starter/.codex/scripts/runtime-utils.mjs";

const rootDir = starterRootDir;
const runtimeStateScript = path.join(rootDir, ".codex", "scripts", "runtime-state.mjs");
const sessionContextScript = path.join(rootDir, ".codex", "scripts", "session-context.mjs");
const startupContextScript = path.join(rootDir, ".codex", "scripts", "startup-context.mjs");
const hookLogScript = path.join(rootDir, ".codex", "hooks", "log-event.mjs");
const taskOverviewScript = path.join(rootDir, ".codex", "scripts", "task-overview.mjs");
const validateGitScript = path.join(rootDir, ".codex", "scripts", "validate-git.mjs");
const installScriptPath = path.join(rootDir, "install.sh");
const projectProfilePath = path.join(rootDir, ".codex", "project-profile.md");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function runNode(scriptPath, input, env = {}) {
  return execFileSync("node", [scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8"
  });
}

function runNodeResult(scriptPath, input, env = {}) {
  return spawnSync("node", [scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8"
  });
}

function readRuntimeState(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "runtime-state.json"), "utf8"));
}

function readTaskRegistry(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "task-registry.json"), "utf8"));
}

function readEvolutionRegistry(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "evolution-registry.json"), "utf8"));
}

function readTaskContextFile(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "task-context.json"), "utf8"));
}

function readRepoContextFile(projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, ".codex", "state", "repo-context.json"), "utf8"));
}

function readRuntimeLogEntries(projectDir) {
  const logDir = path.join(projectDir, ".codex", "logs", "runtime-hooks");
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs
    .readdirSync(logDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .flatMap((name) =>
      fs
        .readFileSync(path.join(logDir, name), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    );
}

function listRuntimeLogFiles(projectDir) {
  const logDir = path.join(projectDir, ".codex", "logs", "runtime-hooks");
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs.readdirSync(logDir).filter((name) => name.endsWith(".jsonl")).sort();
}

function readCodexHookLogEntries(projectDir) {
  const logDir = path.join(projectDir, ".codex", "logs", "codex-hooks");
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs
    .readdirSync(logDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .flatMap((name) =>
      fs
        .readFileSync(path.join(logDir, name), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    );
}

function prepareProjectProfile(targetPath, replacements = []) {
  let text = fs.readFileSync(projectProfilePath, "utf8");
  for (const [from, to] of replacements) {
    text = text.replace(from, to);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, text, "utf8");
}

export {
  detectQcFail,
  fs,
  hookLogScript,
  installScriptPath,
  listRuntimeLogFiles,
  loadProjectProfileState,
  loadRepoContext,
  makeTempDir,
  path,
  prepareProjectProfile,
  readCodexHookLogEntries,
  readEvolutionRegistry,
  readRepoContextFile,
  readRuntimeLogEntries,
  readRuntimeState,
  readTaskContextFile,
  readTaskRegistry,
  rootDir,
  runNode,
  runNodeResult,
  runtimeStateScript,
  saveRepoContext,
  saveTaskContext,
  sessionContextScript,
  startupContextScript,
  taskOverviewScript,
  validateGitScript,
  writeJson
};
