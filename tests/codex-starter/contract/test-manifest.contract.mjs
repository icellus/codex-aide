#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  explainSelectionForFiles,
  getSuiteFiles,
  suiteDefinitions,
  suiteOrder,
  testRootDir
} from "../manifest.mjs";

function assertFilesExist(suiteName) {
  for (const relativePath of getSuiteFiles(suiteName)) {
    const absolutePath = path.join(testRootDir, relativePath);
    assert.ok(fs.existsSync(absolutePath), `${suiteName} references missing file: ${relativePath}`);
  }
}

function assertSelection(files, expectedSuites) {
  const selection = explainSelectionForFiles(files);
  assert.deepEqual(
    selection.suites,
    expectedSuites,
    `unexpected suites for ${files.join(", ")}: ${selection.suites.join(", ")}`
  );
}

function listMjsFiles(rootDir, currentDir = rootDir) {
  return fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      return listMjsFiles(rootDir, absolutePath);
    }
    if (!entry.isFile() || !entry.name.endsWith(".mjs")) {
      return [];
    }
    return [path.relative(rootDir, absolutePath).replace(/\\/g, "/")];
  });
}

function countLines(relativePath) {
  return fs.readFileSync(path.join(testRootDir, relativePath), "utf8").split(/\r?\n/).length;
}

function assertFileBudgets() {
  const expectedBudgets = new Map([
    ["contract/commit-policy.contract.mjs", 120],
    ["contract/test-manifest.contract.mjs", 180],
    ["helpers/runtime-smoke-helpers.mjs", 220],
    ["helpers/test-paths.mjs", 80],
    ["manifest.mjs", 300],
    ["run.mjs", 320],
    ["smoke/log-analysis.smoke.mjs", 550],
    ["smoke/runtime-ops.smoke.mjs", 1000],
    ["smoke/runtime-overview.smoke.mjs", 700],
    ["smoke/runtime-workflow.smoke.mjs", 1000]
  ]);

  const actualFiles = listMjsFiles(testRootDir).sort();
  const expectedFiles = [...expectedBudgets.keys()].sort();
  assert.deepEqual(
    actualFiles,
    expectedFiles,
    `unexpected test inventory drift:\nactual=${actualFiles.join(", ")}\nexpected=${expectedFiles.join(", ")}`
  );

  for (const [relativePath, maxLines] of expectedBudgets.entries()) {
    const lineCount = countLines(relativePath);
    assert.ok(
      lineCount <= maxLines,
      `${relativePath} exceeds budget: ${lineCount} > ${maxLines}. Keep tests core-only and split before growing.`
    );
  }
}

assert.deepEqual(suiteOrder, ["contract", "smoke", "full"]);

for (const suiteName of suiteOrder) {
  assert.ok(suiteDefinitions[suiteName], `missing suite definition: ${suiteName}`);
  assertFilesExist(suiteName);
}

assert.ok(!fs.existsSync(path.join(testRootDir, "behavior")), "retired behavior suite must not be restored");
assert.ok(!fs.existsSync(path.join(testRootDir, "mutation")), "retired mutation suite must not be restored");
assertFileBudgets();

assert.deepEqual(
  getSuiteFiles("full"),
  [
    "contract/test-manifest.contract.mjs",
    "contract/commit-policy.contract.mjs",
    "smoke/log-analysis.smoke.mjs",
    "smoke/runtime-workflow.smoke.mjs",
    "smoke/runtime-ops.smoke.mjs",
    "smoke/runtime-overview.smoke.mjs"
  ]
);

assertSelection(["AGENTS.md"], []);
assertSelection(["README.md"], []);
assertSelection(["CONTRIBUTING.md"], []);
assertSelection(["codex-starter/AGENTS.md"], ["smoke"]);
assertSelection(["codex-starter/.codex/scripts/runtime-utils.mjs"], ["smoke"]);
assertSelection(["codex-starter/install.sh"], ["smoke"]);
assertSelection(["tests/codex-starter/helpers/test-paths.mjs"], ["full"]);
assertSelection(["scripts/validate-commit-msg.mjs"], ["contract"]);
assertSelection(["tests/codex-starter/contract/test-manifest.contract.mjs"], ["contract"]);
assertSelection(["tests/codex-starter/smoke/runtime-workflow.smoke.mjs"], ["smoke"]);
assertSelection(["tests/codex-starter/README.md"], []);
assertSelection(
  ["tests/codex-starter/contract/test-manifest.contract.mjs", "tests/codex-starter/smoke/runtime-ops.smoke.mjs"],
  ["full"]
);
assertSelection(["codex-starter/AGENTS.md", "tests/codex-starter/helpers/test-paths.mjs"], ["full"]);

process.stdout.write("test manifest contract checks passed\n");
