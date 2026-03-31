import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function listFilesRecursive(rootDir, predicate = () => true) {
  if (!fileExists(rootDir)) {
    return [];
  }

  const results = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, predicate));
    } else if (entry.isFile() && predicate(fullPath)) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

function relativeRepoPath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function displayPath(repoRoot, filePath) {
  const relativePath = relativeRepoPath(repoRoot, filePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
}

function startsWithAny(target, prefixes) {
  return prefixes.some((prefix) => target.startsWith(prefix));
}

function loadJsonFile(repoRoot, filePath, errors) {
  if (!fileExists(filePath)) {
    errors.push(`${displayPath(repoRoot, filePath)}: file not found`);
    return null;
  }

  try {
    return readJson(filePath);
  } catch (error) {
    errors.push(`${displayPath(repoRoot, filePath)}: invalid JSON (${error.message})`);
    return null;
  }
}

function loadTextFile(repoRoot, filePath, errors) {
  if (!fileExists(filePath)) {
    errors.push(`${displayPath(repoRoot, filePath)}: file not found`);
    return null;
  }

  try {
    return readText(filePath);
  } catch (error) {
    errors.push(`${displayPath(repoRoot, filePath)}: unreadable file (${error.message})`);
    return null;
  }
}

function collectAuthorityFiles(repoRoot) {
  const files = [];
  const starterRoot = path.join(repoRoot, "codex-starter");
  const include = [
    path.join(starterRoot, "AGENTS.md"),
    path.join(starterRoot, ".codex", "policies"),
    path.join(starterRoot, ".codex", "skills"),
    path.join(starterRoot, ".codex", "agents"),
    path.join(starterRoot, ".codex", "context")
  ];

  for (const candidate of include) {
    if (!fileExists(candidate)) {
      continue;
    }

    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      files.push(candidate);
      continue;
    }

    files.push(...listFilesRecursive(candidate));
  }

  return files.sort();
}

function validateAllowedSections(repoRoot, owner, errors) {
  if (!owner.allowed_sections) {
    return;
  }

  const filePath = path.join(repoRoot, owner.path);
  const text = loadTextFile(repoRoot, filePath, errors);
  if (text === null) {
    return;
  }
  const found = Array.from(text.matchAll(/^##\s+(.+)$/gm)).map((match) => match[1].trim());

  for (const heading of found) {
    if (!owner.allowed_sections.includes(heading)) {
      errors.push(`${owner.path}: disallowed section heading "${heading}"`);
    }
  }
}

function validateForbidden(repoRoot, owner, errors) {
  if (!owner.path) {
    return;
  }

  const filePath = path.join(repoRoot, owner.path);
  const text = loadTextFile(repoRoot, filePath, errors);
  if (text === null) {
    return;
  }

  for (const pattern of owner.forbidden_patterns || []) {
    if (text.includes(pattern)) {
      errors.push(`${owner.path}: forbidden pattern "${pattern}"`);
    }
  }

  const lowered = text.toLowerCase();
  for (const term of owner.forbidden_terms || []) {
    if (lowered.includes(term.toLowerCase())) {
      errors.push(`${owner.path}: forbidden term "${term}"`);
    }
  }
}

function validateRequired(repoRoot, owner, errors) {
  const targets = [];

  if (owner.path) {
    targets.push(path.join(repoRoot, owner.path));
  }

  if (owner.path_prefix) {
    const prefixPath = path.join(repoRoot, owner.path_prefix);
    if (!fileExists(prefixPath)) {
      errors.push(`${owner.path_prefix}: path not found`);
      return;
    }
    targets.push(...listFilesRecursive(prefixPath));
  }

  for (const filePath of targets) {
    const rel = relativeRepoPath(repoRoot, filePath);
    const text = loadTextFile(repoRoot, filePath, errors);
    if (text === null) {
      continue;
    }

    for (const term of owner.required_terms || []) {
      if (!text.includes(term)) {
        errors.push(`${rel}: missing required term "${term}"`);
      }
    }

    if (owner.required_sections_any_of?.length) {
      const found = owner.required_sections_any_of.some((heading) => text.includes(heading));
      if (!found) {
        errors.push(
          `${rel}: missing required section; expected one of ${owner.required_sections_any_of.join(", ")}`
        );
      }
    }
  }
}

function validateDuplicateRules(repoRoot, spec, authorityFiles, errors) {
  const relativeFiles = authorityFiles.map((filePath) => ({
    path: relativeRepoPath(repoRoot, filePath),
    text: readText(filePath)
  }));

  for (const rule of spec.duplicate_rules || []) {
    const matches = [];

    for (const file of relativeFiles) {
      const matched =
        rule.pattern_any_of?.some((pattern) => file.text.includes(pattern)) ||
        (rule.pattern ? file.text.includes(rule.pattern) : false);

      if (matched) {
        matches.push(file.path);
      }
    }

    if (matches.length === 0) {
      continue;
    }

    const allowed = rule.allowed_paths || [];
    for (const match of matches) {
      if (!startsWithAny(match, allowed)) {
        errors.push(`${match}: violates duplicate rule "${rule.id}"`);
      }
    }
  }
}

function validateAuthorityKeywords(repoRoot, spec, authorityFiles, errors) {
  const relativeFiles = authorityFiles.map((filePath) => ({
    path: relativeRepoPath(repoRoot, filePath),
    text: readText(filePath)
  }));

  for (const item of spec.authority_keywords || []) {
    for (const file of relativeFiles) {
      if (!file.text.includes(item.keyword)) {
        continue;
      }

      if (!startsWithAny(file.path, item.authoritative_paths || [])) {
        errors.push(`${file.path}: keyword "${item.keyword}" appears outside its declared authority set`);
      }
    }
  }
}

function validateAuthority({
  repoRoot = defaultRepoRoot,
  specPath = path.join(repoRoot, "standards", "codex-starter-authority-map.json")
} = {}) {
  const errors = [];
  const spec = loadJsonFile(repoRoot, specPath, errors);

  if (spec === null) {
    return {
      ok: false,
      errors,
      checked_files: []
    };
  }

  for (const owner of spec.owners || []) {
    validateAllowedSections(repoRoot, owner, errors);
    validateForbidden(repoRoot, owner, errors);
    validateRequired(repoRoot, owner, errors);
  }

  const authorityFiles = collectAuthorityFiles(repoRoot);
  validateDuplicateRules(repoRoot, spec, authorityFiles, errors);
  validateAuthorityKeywords(repoRoot, spec, authorityFiles, errors);

  return {
    ok: errors.length === 0,
    errors,
    checked_files: authorityFiles.map((filePath) => relativeRepoPath(repoRoot, filePath))
  };
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo-root") {
      options.repoRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--spec") {
      options.specPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

function runCli(argv = process.argv.slice(2)) {
  let options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(
      "Usage: node scripts/validate-codex-starter-authority.mjs [--repo-root <path>] [--spec <path>]\n"
    );
    return 2;
  }

  const result = validateAuthority(options);

  if (result.errors.length > 0) {
    process.stderr.write("codex-starter authority validation failed:\n");
    for (const error of result.errors) {
      process.stderr.write(`- ${error}\n`);
    }
    return 1;
  }

  process.stdout.write("codex-starter authority validation passed\n");
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(runCli());
}

export { validateAuthority };
