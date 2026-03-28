import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fixtureFiles = [
  "AGENTS.md",
  ".agents/skills/aide/SKILL.md",
  ".codex/routing-policy.md",
  ".codex/agents/repo_explorer.toml",
  "tests/aide-baseline.contract.mjs"
];

const mutationCases = [
  {
    id: "delete-default-chinese",
    file: ".agents/skills/aide/SKILL.md",
    needle: "- default to Chinese unless the user explicitly asks for another language"
  },
  {
    id: "delete-default-boss-address",
    file: ".agents/skills/aide/SKILL.md",
    needle:
      "- keep the default preferred address as literal `Boss`; do not translate it to `老板`, do not change its casing, and do not swap it for another title unless the user explicitly asks"
  },
  {
    id: "delete-cold-thread-greeting-constraint",
    file: ".agents/skills/aide/SKILL.md",
    needle:
      "- on the first user turn of a cold thread, use a warm, lively, contextual greeting that reacts to the user's actual message, then move straight into the next useful step"
  },
  {
    id: "delete-shared-state-write-boundary",
    file: "AGENTS.md",
    needle:
      "- only the main agent or runtime scripts write `.codex/state/*.json`, `.codex/project-profile.md`, or `PROGRESS.md`"
  },
  {
    id: "delete-discussion-default-no-durable-write",
    file: ".codex/routing-policy.md",
    needle: "- default state behavior: no durable state write"
  },
  {
    id: "delete-repo-explorer-readonly-short-lived-constraint",
    file: ".agents/skills/aide/SKILL.md",
    needle:
      "- use `repo_explorer` only as a short-lived read-only helper when ownership, entrypoints, or boundaries are unclear; release it once routing is clear"
  }
];

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function formatResultOutput(result) {
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  return `status=${result.status}\nstdout:\n${stdout || "<empty>"}\nstderr:\n${stderr || "<empty>"}`;
}

function copyFixtureTree(tempRoot) {
  fixtureFiles.forEach((relPath) => {
    const src = path.join(rootDir, relPath);
    const dest = path.join(tempRoot, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  });
}

function removeExactOnce(text, needle, label) {
  assert.ok(text.includes(needle), `${label} missing source needle for mutation`);
  return text.replace(needle, "");
}

function mutateTempCopy(tempRoot, mutation) {
  const targetPath = path.join(tempRoot, mutation.file);
  const original = fs.readFileSync(targetPath, "utf8");
  const mutated = removeExactOnce(original, mutation.needle, mutation.id);
  fs.writeFileSync(targetPath, mutated, "utf8");
}

function runBaselineContract(projectRoot) {
  return spawnSync(process.execPath, ["tests/aide-baseline.contract.mjs"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
}

function assertBaselinePassesOnCleanCopy() {
  const tempRoot = makeTempDir("aide-baseline-clean-");
  try {
    copyFixtureTree(tempRoot);
    const result = runBaselineContract(tempRoot);
    assert.equal(
      result.status,
      0,
      `clean baseline copy should pass contract check\n${formatResultOutput(result)}`
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function assertMutationFailsCase(mutation) {
  const tempRoot = makeTempDir(`aide-baseline-${mutation.id}-`);
  try {
    copyFixtureTree(tempRoot);
    mutateTempCopy(tempRoot, mutation);
    const result = runBaselineContract(tempRoot);
    assert.notEqual(
      result.status,
      0,
      `mutation "${mutation.id}" should fail contract check but passed\n${formatResultOutput(result)}`
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function runAideBaselineMutationTests() {
  assertBaselinePassesOnCleanCopy();
  mutationCases.forEach((mutation) => assertMutationFailsCase(mutation));
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  runAideBaselineMutationTests();
  process.stdout.write("aide baseline mutation tests passed\n");
}
