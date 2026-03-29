import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(import.meta.url);
const testRootDir = path.dirname(manifestPath);
const repoRootDir = path.resolve(testRootDir, "..", "..");

const contractFiles = [
  "contract/aide-authority-alignment.contract.mjs",
  "contract/aide-baseline.contract.mjs",
  "contract/aide-conflict.contract.mjs",
  "contract/aide-dialogue.contract.mjs",
  "contract/aide-routing-matrix.contract.mjs",
  "contract/aide-staffing.contract.mjs",
  "contract/test-manifest.contract.mjs"
];

const behaviorFiles = [
  "behavior/aide-adversarial-behavior.mjs",
  "behavior/aide-delegation-behavior.mjs",
  "behavior/aide-reply-behavior.mjs"
];

const mutationFiles = [
  "mutation/aide-baseline.mutation.mjs",
  "mutation/aide-conflict.mutation.mjs",
  "mutation/aide-routing-matrix.mutation.mjs"
];

const smokeFiles = [
  "smoke/log-analysis.smoke.mjs",
  "smoke/runtime-hooks.smoke.mjs"
];

export const suiteDefinitions = {
  contract: {
    kind: "leaf",
    description: "authority and text contract checks",
    files: contractFiles
  },
  behavior: {
    kind: "leaf",
    description: "reply, delegation, and adversarial behavior checks",
    files: behaviorFiles
  },
  mutation: {
    kind: "leaf",
    description: "anti-regression mutation checks",
    files: mutationFiles
  },
  smoke: {
    kind: "leaf",
    description: "runtime, install, and log-analysis smoke checks",
    files: smokeFiles
  },
  fast: {
    kind: "aggregate",
    description: "daily fast path for contract and behavior coverage",
    includes: ["contract", "behavior"]
  },
  full: {
    kind: "aggregate",
    description: "full repository maintenance coverage",
    includes: ["contract", "behavior", "mutation", "smoke"]
  }
};

export const suiteOrder = ["contract", "behavior", "mutation", "smoke", "fast", "full"];

export const selectionRules = [
  {
    id: "test-runner-core",
    patterns: ["tests/codex-starter/run.mjs", "tests/codex-starter/manifest.mjs"],
    suites: ["full"],
    reason: "runner or manifest changes affect test selection across all layers"
  },
  {
    id: "test-helpers",
    patterns: [/^tests\/codex-starter\/helpers\//],
    suites: ["full"],
    reason: "shared test helpers affect multiple suites"
  },
  {
    id: "contract-tests",
    patterns: [/^tests\/codex-starter\/contract\//],
    suites: ["contract"],
    reason: "contract-layer test change"
  },
  {
    id: "behavior-tests",
    patterns: [/^tests\/codex-starter\/behavior\//],
    suites: ["behavior"],
    reason: "behavior-layer test change"
  },
  {
    id: "mutation-tests",
    patterns: [/^tests\/codex-starter\/mutation\//],
    suites: ["mutation"],
    reason: "mutation-layer test change"
  },
  {
    id: "smoke-tests",
    patterns: [/^tests\/codex-starter\/smoke\//],
    suites: ["smoke"],
    reason: "smoke-layer test change"
  },
  {
    id: "repo-maintenance-guidance",
    patterns: ["AGENTS.md"],
    suites: ["contract"],
    reason: "repo-level maintenance guidance is enforced by contract coverage only"
  },
  {
    id: "runtime-authority",
    patterns: [
      "codex-starter/AGENTS.md",
      "codex-starter/.codex/routing-policy.md",
      /^codex-starter\/\.codex\/agents\//,
      /^codex-starter\/\.agents\/skills\//
    ],
    suites: ["fast", "smoke"],
    reason: "runtime authority and role contracts affect prompt behavior and runtime orchestration"
  },
  {
    id: "runtime-install-and-hooks",
    patterns: [
      "codex-starter/install.sh",
      "codex-starter/.codex/config.toml",
      "codex-starter/.codex/hooks.json",
      /^codex-starter\/\.codex\/hooks\//,
      /^codex-starter\/\.codex\/scripts\//,
      /^codex-starter\/\.codex\/bootstrap-state\//
    ],
    suites: ["smoke"],
    reason: "install, hook, runtime helper, and bootstrap-state changes are covered by smoke"
  },
  {
    id: "runtime-policy-json",
    patterns: [
      "codex-starter/.codex/delivery-policy.json",
      "codex-starter/.codex/evolution-policy.json",
      "codex-starter/.codex/validation-profile.json"
    ],
    suites: ["smoke"],
    reason: "runtime policy json changes affect hook/runtime behavior"
  },
  {
    id: "archived-or-legacy-paths",
    patterns: [/^claude-starter\//, /^codex-starter\/tests\//],
    suites: [],
    reason: "archived component or legacy test-path cleanup with no active mapped suite"
  },
  {
    id: "docs-only",
    patterns: [
      "README.md",
      "NEXT_SESSION_CONTEXT.md",
      "CLAUDE_STARTER_ARCHIVE.md",
      "tests/codex-starter/README.md",
      "codex-starter/README.md",
      /^codex-starter\/docs\//
    ],
    suites: [],
    reason: "docs-only change with no mapped repository test suite"
  }
];

function normalizeSlashes(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

export function normalizeRepoPath(filePath) {
  let normalized = normalizeSlashes(String(filePath || "").trim());
  if (!normalized) {
    return "";
  }

  if (path.isAbsolute(normalized)) {
    normalized = normalizeSlashes(path.relative(repoRootDir, normalized));
  }

  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

export function getSuiteFiles(suiteName) {
  const definition = suiteDefinitions[suiteName];
  if (!definition) {
    throw new Error(`Unknown suite: ${suiteName}`);
  }

  if (definition.kind === "leaf") {
    return [...definition.files];
  }

  return definition.includes.flatMap((name) => getSuiteFiles(name));
}

function expandToLeafSuites(suiteName, bucket) {
  const definition = suiteDefinitions[suiteName];
  if (!definition) {
    throw new Error(`Unknown suite in selection rule: ${suiteName}`);
  }

  if (definition.kind === "leaf") {
    bucket.add(suiteName);
    return;
  }

  for (const included of definition.includes) {
    expandToLeafSuites(included, bucket);
  }
}

function matchesPattern(filePath, pattern) {
  if (typeof pattern === "string") {
    return filePath === pattern;
  }

  return pattern.test(filePath);
}

export function compressLeafSuites(leafSuites) {
  const remaining = new Set(leafSuites);
  if (remaining.size === 0) {
    return [];
  }

  const allLeaves = ["contract", "behavior", "mutation", "smoke"];
  if (allLeaves.every((name) => remaining.has(name))) {
    return ["full"];
  }

  const selected = [];
  if (remaining.has("contract") && remaining.has("behavior")) {
    selected.push("fast");
    remaining.delete("contract");
    remaining.delete("behavior");
  }

  for (const name of ["contract", "behavior", "mutation", "smoke"]) {
    if (remaining.has(name)) {
      selected.push(name);
    }
  }

  return selected;
}

export function explainSelectionForFiles(files) {
  const normalizedFiles = [...new Set((files || []).map(normalizeRepoPath).filter(Boolean))];
  const matchedRules = [];
  const unmatchedFiles = [];
  const selectedLeafSuites = new Set();

  for (const filePath of normalizedFiles) {
    const fileRules = selectionRules.filter((rule) => rule.patterns.some((pattern) => matchesPattern(filePath, pattern)));
    if (fileRules.length === 0) {
      unmatchedFiles.push(filePath);
      continue;
    }

    for (const rule of fileRules) {
      matchedRules.push({
        file: filePath,
        ruleId: rule.id,
        suites: [...rule.suites],
        reason: rule.reason
      });

      for (const suiteName of rule.suites) {
        expandToLeafSuites(suiteName, selectedLeafSuites);
      }
    }
  }

  const leafSuites = ["contract", "behavior", "mutation", "smoke"].filter((name) => selectedLeafSuites.has(name));
  const suites = compressLeafSuites(leafSuites);

  return {
    files: normalizedFiles,
    matchedRules,
    unmatchedFiles,
    leafSuites,
    suites
  };
}

export { repoRootDir, testRootDir };
