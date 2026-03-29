#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { repoRootDir } from "../manifest.mjs";
import { allowedTypes, validateCommitMessage } from "../../../scripts/commit-policy.mjs";

function assertPass(message) {
  const result = validateCommitMessage(message);
  assert.equal(result.ok, true, `${message} should pass: ${result.errors.join(", ")}`);
}

function assertFail(message, expectedPattern) {
  const result = validateCommitMessage(message);
  assert.equal(result.ok, false, `${message} should fail`);
  assert.match(result.errors.join(" "), expectedPattern);
}

assert.deepEqual(allowedTypes, ["feat", "fix", "refactor", "docs", "test", "chore", "ci", "build", "perf", "revert"]);

assertPass("feat: add commit policy validation");
assertPass("fix(tests): split oversized smoke coverage");
assertPass("docs(readme): document hook setup");
assertPass('Revert "feat: add commit policy validation"');

assertFail("Prune codex-starter tests", /must match/);
assertFail("feat add commit policy", /must match/);
assertFail("fix: trailing punctuation.", /must not end with punctuation/);
assertFail(
  "chore: this subject is intentionally too long because it keeps adding extra wording until the limit is broken",
  /72 characters or fewer/
);

const contributing = fs.readFileSync(path.join(repoRootDir, "CONTRIBUTING.md"), "utf8");
assert.match(contributing, /scripts\/commit-policy\.mjs/);

assert.ok(fs.existsSync(path.join(repoRootDir, "CONTRIBUTING.md")));
assert.ok(fs.existsSync(path.join(repoRootDir, ".githooks", "commit-msg")));
assert.ok(fs.existsSync(path.join(repoRootDir, "scripts", "install-git-hooks.sh")));
assert.ok(fs.existsSync(path.join(repoRootDir, "scripts", "validate-commit-msg.mjs")));
assert.ok(fs.existsSync(path.join(repoRootDir, ".github", "workflows", "commit-policy.yml")));

process.stdout.write("commit policy contract checks passed\n");
