#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  explainSelectionForFiles,
  getSuiteFiles,
  normalizeRepoPath,
  repoRootDir,
  suiteDefinitions,
  suiteOrder
} from "./manifest.mjs";

const runnerPath = fileURLToPath(import.meta.url);
const testRootDir = path.dirname(runnerPath);

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  node tests/codex-starter/run.mjs",
      "  node tests/codex-starter/run.mjs --suite <name>",
      "  node tests/codex-starter/run.mjs --file <path> [--file <path>]",
      "  node tests/codex-starter/run.mjs --changed",
      "",
      "Suites:",
      ...suiteOrder.map((name) => `  ${name}: ${suiteDefinitions[name].description}`),
      "",
      "Default mode: auto-select suites from current git changes",
      "Use --file for bounded subagent-owned paths."
    ].join("\n") + "\n"
  );
}

function parseArgs(argv) {
  let suite = "";
  let changed = false;
  let dryRun = false;
  const files = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      return { help: true, suite, changed, dryRun, files };
    }

    if (token === "--suite") {
      suite = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (token === "--file") {
      const value = String(argv[index + 1] || "").trim();
      if (!value) {
        throw new Error("--file requires a path");
      }
      files.push(value);
      index += 1;
      continue;
    }

    if (token === "--changed") {
      changed = true;
      continue;
    }

    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (suite && !suiteDefinitions[suite]) {
    throw new Error(`Unknown suite: ${suite}`);
  }

  if (suite && (changed || files.length > 0)) {
    throw new Error("--suite cannot be combined with --changed or --file");
  }

  if (changed && files.length > 0) {
    throw new Error("--changed cannot be combined with --file");
  }

  return {
    help: false,
    suite,
    changed,
    dryRun,
    files
  };
}

function runFile(relativePath) {
  const absolutePath = path.join(testRootDir, relativePath);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [absolutePath], {
    cwd: repoRootDir,
    encoding: "utf8"
  });
  const durationMs = Date.now() - startedAt;

  return {
    relativePath,
    absolutePath,
    durationMs,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function readLinesFromCommand(args) {
  const result = spawnSync("git", args, {
    cwd: repoRootDir,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectChangedFiles() {
  const candidates = new Set();

  for (const filePath of readLinesFromCommand(["diff", "--name-only", "--relative", "HEAD", "--"])) {
    candidates.add(normalizeRepoPath(filePath));
  }

  for (const filePath of readLinesFromCommand(["diff", "--cached", "--name-only", "--relative", "HEAD", "--"])) {
    candidates.add(normalizeRepoPath(filePath));
  }

  for (const filePath of readLinesFromCommand(["ls-files", "--others", "--exclude-standard"])) {
    candidates.add(normalizeRepoPath(filePath));
  }

  return [...candidates].filter(Boolean).sort();
}

function summarizeSelection(selection, mode) {
  if (selection.files.length === 0) {
    process.stdout.write(`No changed files detected for mode ${mode}.\n`);
    process.stdout.write("Nothing to run.\n");
    return;
  }

  process.stdout.write(`Selected codex-starter test mode: ${mode}\n`);
  process.stdout.write("Input files:\n");
  for (const filePath of selection.files) {
    process.stdout.write(`- ${filePath}\n`);
  }

  if (selection.matchedRules.length > 0) {
    process.stdout.write("Selection rationale:\n");
    for (const match of selection.matchedRules) {
      const suites = match.suites.length > 0 ? match.suites.join(", ") : "none";
      process.stdout.write(`- ${match.file}: ${suites} (${match.reason})\n`);
    }
  }

  if (selection.unmatchedFiles.length > 0) {
    process.stdout.write("Unmapped files:\n");
    for (const filePath of selection.unmatchedFiles) {
      process.stdout.write(`- ${filePath}\n`);
    }
  }

  if (selection.suites.length > 0) {
    process.stdout.write(`Resolved suites: ${selection.suites.join(", ")}\n`);
  } else {
    process.stdout.write("Resolved suites: none\n");
  }
}

function main() {
  const { help, suite, changed, dryRun, files } = parseArgs(process.argv.slice(2));
  if (help) {
    printUsage();
    return;
  }

  if (suite) {
    const suiteFiles = getSuiteFiles(suite);
    if (dryRun) {
      process.stdout.write(`Resolved suites: ${suite}\n`);
      process.stdout.write(`Files: ${suiteFiles.length}\n`);
      return;
    }
    runSuites([{ name: suite, files: suiteFiles }]);
    return;
  }

  const inputFiles = files.length > 0 ? files.map(normalizeRepoPath) : collectChangedFiles();
  const selection = explainSelectionForFiles(inputFiles);
  const mode = files.length > 0 ? "files" : changed ? "changed" : "auto";

  summarizeSelection(selection, mode);

  if (dryRun) {
    return;
  }

  if (selection.suites.length === 0) {
    process.stdout.write("No mapped codex-starter suites to run.\n");
    return;
  }

  runSuites(selection.suites.map((name) => ({ name, files: getSuiteFiles(name) })));
}

function runSuites(selectedSuites) {
  const failures = [];
  const seenFiles = new Set();

  process.stdout.write(`Running codex-starter test suites: ${selectedSuites.map((item) => item.name).join(", ")}\n`);

  for (const suite of selectedSuites) {
    process.stdout.write(`Suite ${suite.name}:\n`);
    for (const file of suite.files) {
      if (seenFiles.has(file)) {
        continue;
      }
      seenFiles.add(file);
      const result = runFile(file);
      const marker = result.status === 0 ? "PASS" : "FAIL";
      process.stdout.write(`[${marker}] ${file} (${result.durationMs}ms)\n`);

      if (result.status !== 0) {
        failures.push(result);
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
      }
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} test file(s) failed.\n`);
    process.exit(1);
  }

  process.stdout.write(`Selected suites passed (${seenFiles.size} unique files).\n`);
}

main();
