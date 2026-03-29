import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDirectRun, repoRootDir } from "../helpers/test-paths.mjs";

const defaultRootDir = repoRootDir;
const contractScriptPath = path.join("tests", "codex-starter", "contract", "aide-routing-matrix.contract.mjs");

function runContract(projectDir) {
  return spawnSync("node", [contractScriptPath], {
    cwd: projectDir,
    encoding: "utf8"
  });
}

function replaceExact(repoDir, relativePath, before, after) {
  const filePath = path.join(repoDir, relativePath);
  const text = fs.readFileSync(filePath, "utf8");
  const occurrences = text.split(before).length - 1;

  assert.equal(
    occurrences,
    1,
    `${relativePath} should contain the target snippet exactly once for this mutation`
  );

  fs.writeFileSync(filePath, text.replace(before, after), "utf8");
}

function withRepoCopy(sourceRoot, prefix, run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const tempRepo = path.join(tempRoot, "repo");

  fs.cpSync(sourceRoot, tempRepo, { recursive: true, filter: (src) => path.basename(src) !== ".git" });

  try {
    return run(tempRepo);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function assertContractPass(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(result.stdout, /aide routing matrix contract tests passed/i, `${label} missing pass marker`);
}

function assertContractFail(result, label) {
  assert.notEqual(
    result.status,
    0,
    `${label} should fail but passed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /ERR_ASSERTION|AssertionError|missing/i,
    `${label} should fail with an assertion signal`
  );
}

const mutationScenarios = [
  {
    id: "discussion-qna-not-aide-only",
    mutate(repoDir) {
      replaceExact(
        repoDir,
        "codex-starter/.codex/routing-policy.md",
        "- Keep lightweight discussion, Q&A, and option-comparison work inside `Aide` when the user is not asking for a durable artifact or an execution workflow.",
        "- Keep discussion, Q&A, and option-comparison work inside `Aide` when possible, but allow execution routes by default."
      );
    }
  },
  {
    id: "small-clear-repo-change-not-single-writer-first",
    mutate(repoDir) {
      replaceExact(
        repoDir,
        "codex-starter/.codex/routing-policy.md",
        "- For a clear small repo change, activate one clear execution role first instead of waking multiple roles.",
        "- For a clear small repo change, activate multiple execution roles early to maximize parallelism."
      );
    }
  },
  {
    id: "coder-without-mandatory-tester-handoff",
    mutate(repoDir) {
      replaceExact(
        repoDir,
        "codex-starter/.codex/routing-policy.md",
        "- Any route that activates `coder` must include a downstream `tester` handoff before the task can settle or submit.",
        "- Coder can settle directly when change looks small; tester handoff is optional."
      );
    }
  },
  {
    id: "higher-risk-bugfix-without-tester-qc-gating",
    mutate(repoDir) {
      replaceExact(
        repoDir,
        "codex-starter/.codex/routing-policy.md",
        "- enable `/qc` when risk is high, the user asks for an audit, or release confidence needs it",
        "- enable `/qc` whenever extra confidence is requested, without strict gating"
      );
    }
  },
  {
    id: "product-artifact-without-product-assistant-route",
    mutate(repoDir) {
      replaceExact(
        repoDir,
        "codex-starter/.agents/skills/aide/SKILL.md",
        "Route to `product_assistant` when the primary deliverable is a non-code artifact.",
        "Route to `Aide` when the primary deliverable is a non-code artifact."
      );
    }
  },
  {
    id: "release-governed-delivery-without-conduct-submit-conditions",
    mutate(repoDir) {
      replaceExact(
        repoDir,
        "codex-starter/.codex/routing-policy.md",
        "- `environment setup` belongs to `conduct`, including dependency installation, toolchain bootstrap, and runtime preparation.",
        "- `environment setup` can be owned by any active execution role."
      );
    }
  },
  {
    id: "new-repo-concrete-change-without-minimal-scan-and-early-delegation",
    mutate(repoDir) {
      replaceExact(
        repoDir,
        "codex-starter/.codex/routing-policy.md",
        "- Missing or stale repo context does not override early delegation for a clearly scoped implementation task; use minimal triage first, then delegate.",
        "- Missing or stale repo context should block delegation until a full scan is completed."
      );
    }
  },
  {
    id: "task-narrowed-without-dropping-extra-roles",
    mutate(repoDir) {
      replaceExact(
        repoDir,
        "codex-starter/AGENTS.md",
        "- extra roles should be activated only when they add real routing, validation, audit, or delivery value, then dropped again when no longer needed",
        "- extra roles may stay active after narrowing to keep staffing stable."
      );
    }
  }
];

export function runAideRoutingMatrixMutationTests(rootDir = defaultRootDir) {
  withRepoCopy(rootDir, "aide-routing-matrix-baseline-", (repoDir) => {
    const baseline = runContract(repoDir);
    assertContractPass(baseline, "baseline");
  });

  mutationScenarios.forEach((scenario) => {
    withRepoCopy(rootDir, `aide-routing-matrix-${scenario.id}-`, (repoDir) => {
      scenario.mutate(repoDir);
      const result = runContract(repoDir);
      assertContractFail(result, scenario.id);
    });
  });
}

if (isDirectRun(import.meta.url)) {
  runAideRoutingMatrixMutationTests();
  process.stdout.write(
    `aide routing matrix mutation tests passed (${mutationScenarios.length} mutation scenarios + baseline)\n`
  );
}
