import path from "node:path";

import { validateGovernanceTarget } from "../../../codex-aide/.codex/scripts/guards/validate-governance-target.mjs";

import {
  defaultRepoRoot,
  fileExists,
  getConsistencySpecPath,
  listFilesRecursive,
  loadJsonFile,
  readText
} from "./shared.mjs";

const validConsistencyKinds = new Set([
  "ownership",
  "handoff",
  "path-convention",
  "authority-boundary",
  "special-flow",
  "integration-wiring"
]);

function collectJsonFiles(repoRoot) {
  const roots = [path.join(repoRoot, "tests", "standards"), path.join(repoRoot, "codex-aide", ".codex")];
  return roots.flatMap((rootDir) => listFilesRecursive(rootDir, (filePath) => filePath.endsWith(".json")));
}

function validateJsonContracts({ repoRoot = defaultRepoRoot } = {}) {
  const errors = [];

  for (const filePath of collectJsonFiles(repoRoot)) {
    try {
      JSON.parse(readText(filePath));
    } catch (error) {
      errors.push(`${path.relative(repoRoot, filePath).replace(/\\/g, "/")}: invalid JSON (${error.message})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function validatePatternArray(ruleId, targetPath, fieldName, value, errors) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${ruleId}: ${targetPath}: ${fieldName} must be a non-empty array when provided`);
    return [];
  }

  const patterns = [];
  for (const pattern of value) {
    if (typeof pattern !== "string" || pattern.length === 0) {
      errors.push(`${ruleId}: ${targetPath}: ${fieldName} entries must be non-empty strings`);
      continue;
    }
    patterns.push(pattern);
  }

  return patterns;
}

function resolveConsistencyTargetPath({ spec, ruleId, target, errors }) {
  const pathAlias = typeof target.path_alias === "string" ? target.path_alias.trim() : "";
  if (pathAlias) {
    const resolvedPath = spec?.path_aliases?.[pathAlias];
    if (typeof resolvedPath !== "string" || resolvedPath.length === 0) {
      errors.push(`${ruleId}: unknown path_alias "${pathAlias}"`);
      return null;
    }

    return resolvedPath;
  }

  if (!target.path) {
    errors.push(`${ruleId}: target is missing path`);
    return null;
  }

  return target.path;
}

function validateConsistency({
  repoRoot = defaultRepoRoot,
  specPath = getConsistencySpecPath(repoRoot)
} = {}) {
  const errors = [];
  const spec = loadJsonFile(repoRoot, specPath, errors);
  const seenRuleIds = new Set();

  if (spec === null) {
    return { ok: false, errors };
  }

  if (!Array.isArray(spec.rules) || spec.rules.length === 0) {
    return {
      ok: false,
      errors: ["tests/standards/codex-aide-consistency-map.json: rules must be a non-empty array"]
    };
  }

  if (spec.path_aliases !== undefined && (!spec.path_aliases || typeof spec.path_aliases !== "object" || Array.isArray(spec.path_aliases))) {
    errors.push("tests/standards/codex-aide-consistency-map.json: path_aliases must be an object when provided");
  }

  for (const rule of spec.rules) {
    if (!rule.id) {
      errors.push("tests/standards/codex-aide-consistency-map.json: every rule must declare id");
      continue;
    }

    if (seenRuleIds.has(rule.id)) {
      errors.push(`tests/standards/codex-aide-consistency-map.json: duplicate rule id "${rule.id}"`);
      continue;
    }
    seenRuleIds.add(rule.id);

    if (!rule.intent || typeof rule.intent !== "string") {
      errors.push(`${rule.id}: rule must declare intent`);
    }

    if (!rule.kind || typeof rule.kind !== "string") {
      errors.push(`${rule.id}: rule must declare kind`);
    } else if (!validConsistencyKinds.has(rule.kind)) {
      errors.push(`${rule.id}: unsupported kind "${rule.kind}"`);
    }

    if (!Array.isArray(rule.targets) || rule.targets.length === 0) {
      errors.push(`${rule.id}: rule must declare at least one target`);
      continue;
    }

    for (const target of rule.targets) {
      const targetPath = resolveConsistencyTargetPath({
        spec,
        ruleId: rule.id,
        target,
        errors
      });
      if (!targetPath) {
        continue;
      }

      const filePath = path.join(repoRoot, targetPath);
      if (!fileExists(filePath)) {
        errors.push(`${rule.id}: ${targetPath}: file not found`);
        continue;
      }

      const allOf = validatePatternArray(rule.id, targetPath, "all_of", target.all_of, errors);
      const anyOf = validatePatternArray(rule.id, targetPath, "any_of", target.any_of, errors);
      const noneOf = validatePatternArray(rule.id, targetPath, "none_of", target.none_of, errors);

      if (allOf.length === 0 && anyOf.length === 0 && noneOf.length === 0) {
        errors.push(`${rule.id}: ${targetPath}: target must declare at least one of all_of, any_of, none_of`);
        continue;
      }

      const text = readText(filePath);

      for (const pattern of allOf) {
        if (!text.includes(pattern)) {
          errors.push(`${rule.id}: ${targetPath}: missing required pattern "${pattern}"`);
        }
      }

      if (anyOf.length > 0 && !anyOf.some((pattern) => text.includes(pattern))) {
        errors.push(`${rule.id}: ${targetPath}: missing one of required patterns ${anyOf.join(", ")}`);
      }

      for (const pattern of noneOf) {
        if (text.includes(pattern)) {
          errors.push(`${rule.id}: ${targetPath}: forbidden pattern "${pattern}"`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateGovernanceTargetContracts({ repoRoot = defaultRepoRoot } = {}) {
  const errors = [];
  const projectDir = path.join(repoRoot, "codex-aide");
  const targets = [
    "AGENTS.md",
    ".codex/policies/routing-policy.md",
    ".codex/policies/aide-governance-policy.md",
    ".codex/context/project-profile.md"
  ];

  for (const targetPath of targets) {
    const result = validateGovernanceTarget({ projectDir, targetPath });
    if (!result.ok) {
      for (const error of result.errors || []) {
        errors.push(`${targetPath}: ${error}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export { validateConsistency, validateGovernanceTargetContracts, validateJsonContracts };
