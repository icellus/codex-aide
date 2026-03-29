import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(import.meta.url);
const testRootDir = path.dirname(manifestPath);
const repoRootDir = path.resolve(testRootDir, "..", "..");

const contractFiles = ["contract/test-manifest.contract.mjs", "contract/commit-policy.contract.mjs"];

const smokeFiles = [
  "smoke/log-analysis.smoke.mjs",
  "smoke/runtime-workflow.smoke.mjs",
  "smoke/runtime-ops.smoke.mjs",
  "smoke/runtime-overview.smoke.mjs"
];

export const suiteDefinitions = {
  contract: {
    kind: "leaf",
    description: "runner and suite-selection contract checks",
    files: contractFiles
  },
  smoke: {
    kind: "leaf",
    description: "runtime, install, and log-analysis smoke checks",
    files: smokeFiles
  },
  full: {
    kind: "aggregate",
    description: "full executable repository maintenance coverage",
    includes: ["contract", "smoke"]
  }
};

const leafSuiteNames = Object.entries(suiteDefinitions)
  .filter(([, definition]) => definition.kind === "leaf")
  .map(([suiteName]) => suiteName);

export const suiteOrder = ["contract", "smoke", "full"];

export const selectionRules = [
  {
    id: "test-runner-core",
    patterns: ["tests/codex-starter/run.mjs", "tests/codex-starter/manifest.mjs"],
    suites: ["full"],
    reason: "runner or manifest changes affect test selection and execution flow"
  },
  {
    id: "test-helpers",
    patterns: [/^tests\/codex-starter\/helpers\//],
    suites: ["full"],
    reason: "shared test helpers affect multiple executable suites"
  },
  {
    id: "contract-tests",
    patterns: [/^tests\/codex-starter\/contract\//],
    suites: ["contract"],
    reason: "suite-definition or selection-contract change"
  },
  {
    id: "commit-policy",
    patterns: [
      /^scripts\/commit-policy\.mjs$/,
      /^scripts\/validate-commit-msg\.mjs$/,
      /^scripts\/install-git-hooks\.sh$/,
      /^\.githooks\//,
      /^\.github\/workflows\/commit-policy\.yml$/
    ],
    suites: ["contract"],
    reason: "commit policy tooling and contribution contract changed"
  },
  {
    id: "smoke-tests",
    patterns: [/^tests\/codex-starter\/smoke\//],
    suites: ["smoke"],
    reason: "runtime smoke coverage changed"
  },
  {
    id: "runtime-artifacts",
    patterns: [
      "codex-starter/install.sh",
      "codex-starter/AGENTS.md",
      "codex-starter/.codex/config.toml",
      "codex-starter/.codex/hooks.json",
      "codex-starter/.codex/routing-policy.md",
      /^codex-starter\/\.codex\/agents\//,
      /^codex-starter\/\.codex\/hooks\//,
      /^codex-starter\/\.codex\/scripts\//,
      /^codex-starter\/\.codex\/bootstrap-state\//,
      /^codex-starter\/\.agents\/skills\//
    ],
    suites: ["smoke"],
    reason: "installed runtime artifacts and smoke fixtures depend on these files; prompt-text semantics are not implied"
  },
  {
    id: "runtime-policy-json",
    patterns: [
      "codex-starter/.codex/delivery-policy.json",
      "codex-starter/.codex/evolution-policy.json",
      "codex-starter/.codex/validation-profile.json"
    ],
    suites: ["smoke"],
    reason: "runtime policy json changes affect executable runtime behavior"
  },
  {
    id: "archived-or-legacy-paths",
    patterns: [
      /^claude-starter\//,
      /^codex-starter\/tests\//,
      /^tests\/codex-starter\/behavior\//,
      /^tests\/codex-starter\/mutation\//
    ],
    suites: [],
    reason: "archived component or retired legacy suite path with no active mapped suite"
  },
  {
    id: "docs-and-maintenance-guides",
    patterns: [
      "AGENTS.md",
      "README.md",
      "CONTRIBUTING.md",
      "NEXT_SESSION_CONTEXT.md",
      "CLAUDE_STARTER_ARCHIVE.md",
      "tests/codex-starter/README.md"
    ],
    suites: [],
    reason: "documentation and maintenance guidance changes have no direct executable suite mapping"
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

  if (leafSuiteNames.length > 1 && leafSuiteNames.every((name) => remaining.has(name))) {
    return ["full"];
  }

  return leafSuiteNames.filter((name) => remaining.has(name));
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

  const leafSuites = leafSuiteNames.filter((name) => selectedLeafSuites.has(name));
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
