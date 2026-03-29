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

const repoGuide = fs.readFileSync(path.join(testRootDir, "..", "..", "AGENTS.md"), "utf8");

for (const suiteName of suiteOrder) {
  assert.ok(suiteDefinitions[suiteName], `missing suite definition: ${suiteName}`);
}

for (const suiteName of ["contract", "behavior", "mutation", "smoke", "fast", "full"]) {
  assertFilesExist(suiteName);
}

assert.match(repoGuide, /node tests\/codex-starter\/run\.mjs/);
assert.match(repoGuide, /--file <path>/);
assert.match(repoGuide, /not the runtime authority shipped into target repositories by `codex-starter`/);
assertSelection(["codex-starter/AGENTS.md"], ["fast", "smoke"]);
assertSelection(["AGENTS.md"], ["contract"]);
assertSelection(["codex-starter/.codex/scripts/runtime-utils.mjs"], ["smoke"]);
assertSelection(["codex-starter/install.sh"], ["smoke"]);
assertSelection(["tests/codex-starter/helpers/test-paths.mjs"], ["full"]);
assertSelection(["tests/codex-starter/contract/aide-dialogue.contract.mjs"], ["contract"]);
assertSelection(["README.md"], []);
assertSelection(
  ["tests/codex-starter/contract/aide-dialogue.contract.mjs", "tests/codex-starter/behavior/aide-reply-behavior.mjs"],
  ["fast"]
);
assertSelection(
  ["codex-starter/AGENTS.md", "tests/codex-starter/helpers/test-paths.mjs"],
  ["full"]
);

process.stdout.write("test manifest contract checks passed\n");
