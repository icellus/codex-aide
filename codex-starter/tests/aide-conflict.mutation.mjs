import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const contractScript = path.join("tests", "aide-conflict.contract.mjs");

function makeTempRepo(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(rootDir, dir, { recursive: true });
  return dir;
}

function runContract(repoDir) {
  return spawnSync("node", [contractScript], {
    cwd: repoDir,
    encoding: "utf8"
  });
}

function combinedOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function assertPass(result, label) {
  assert.equal(result.status, 0, `${label} should pass but failed:\n${combinedOutput(result)}`);
}

function assertFail(result, label, expectedPattern) {
  assert.notEqual(result.status, 0, `${label} should fail but passed:\n${combinedOutput(result)}`);
  assert.match(combinedOutput(result), expectedPattern, `${label} failed for an unexpected reason`);
}

function injectLine(repoDir, relPath, line) {
  const target = path.join(repoDir, relPath);
  fs.appendFileSync(target, `\n${line}\n`, "utf8");
}

function withTempRepo(prefix, fn) {
  const repoDir = makeTempRepo(prefix);
  try {
    fn(repoDir);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

function testBaselinePassesOnCleanCopy() {
  withTempRepo("aide-conflict-baseline-", (repoDir) => {
    const result = runContract(repoDir);
    assertPass(result, "baseline contract");
  });
}

function testMutationsFailContract() {
  const scenarios = [
    {
      name: "inject aide default implementer",
      relPath: ".agents/skills/aide/SKILL.md",
      line: "Aide is the default implementer and implements repository code changes directly.",
      expected: /aide implementer conflict/i
    },
    {
      name: "inject new repo thin context wakes whole team",
      relPath: ".codex/routing-policy.md",
      line: "For a new repo with thin context, activate the whole team and wake every role immediately.",
      expected: /new\/thin context whole-team conflict/i
    },
    {
      name: "inject user-facing reply with internal workflow labels",
      relPath: ".codex/routing-policy.md",
      line: "For user-facing reply, include task class, delivery mode, and enabled modules.",
      expected: /internal workflow term exposure conflict/i
    },
    {
      name: "inject missing stale context auto full scan",
      relPath: ".agents/skills/aide/SKILL.md",
      line: "When context is missing or stale, run a full scan before delegation.",
      expected: /full scan auto-trigger conflict/i
    },
    {
      name: "inject default multi-writer concurrency",
      relPath: ".agents/skills/conduct/SKILL.md",
      line: "By default, multiple write-capable execution roles are active in parallel.",
      expected: /multi-writer steady-state should not be allowed|multi-writer concurrency conflict/i
    }
  ];

  scenarios.forEach((scenario) => {
    withTempRepo("aide-conflict-mutation-", (repoDir) => {
      injectLine(repoDir, scenario.relPath, scenario.line);
      const result = runContract(repoDir);
      assertFail(result, scenario.name, scenario.expected);
    });
  });
}

export function runAideConflictMutationTests() {
  testBaselinePassesOnCleanCopy();
  testMutationsFailContract();
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  runAideConflictMutationTests();
  process.stdout.write("aide conflict mutation tests passed\n");
}
