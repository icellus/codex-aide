import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const specPath = path.join(repoRoot, "standards", "codex-starter-authority-map.json");

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

function relativeRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function startsWithAny(target, prefixes) {
  return prefixes.some((prefix) => target.startsWith(prefix));
}

function collectAuthorityFiles() {
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

function validateAllowedSections(owner, errors) {
  if (!owner.allowed_sections) {
    return;
  }

  const filePath = path.join(repoRoot, owner.path);
  const text = readText(filePath);
  const found = Array.from(text.matchAll(/^##\s+(.+)$/gm)).map((match) => match[1].trim());

  for (const heading of found) {
    if (!owner.allowed_sections.includes(heading)) {
      errors.push(`${owner.path}: disallowed section heading "${heading}"`);
    }
  }
}

function validateForbidden(owner, errors) {
  if (!owner.path) {
    return;
  }

  const filePath = path.join(repoRoot, owner.path);
  const text = readText(filePath);

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

function validateRequired(owner, errors) {
  const targets = [];

  if (owner.path) {
    targets.push(path.join(repoRoot, owner.path));
  }

  if (owner.path_prefix) {
    targets.push(...listFilesRecursive(path.join(repoRoot, owner.path_prefix)));
  }

  for (const filePath of targets) {
    const rel = relativeRepoPath(filePath);
    const text = readText(filePath);

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

function validateDuplicateRules(spec, authorityFiles, errors) {
  const relativeFiles = authorityFiles.map((filePath) => ({
    path: relativeRepoPath(filePath),
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

function validateAuthorityKeywords(spec, authorityFiles, errors) {
  const relativeFiles = authorityFiles.map((filePath) => ({
    path: relativeRepoPath(filePath),
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

function main() {
  const spec = readJson(specPath);
  const errors = [];

  for (const owner of spec.owners || []) {
    validateAllowedSections(owner, errors);
    validateForbidden(owner, errors);
    validateRequired(owner, errors);
  }

  const authorityFiles = collectAuthorityFiles();
  validateDuplicateRules(spec, authorityFiles, errors);
  validateAuthorityKeywords(spec, authorityFiles, errors);

  if (errors.length > 0) {
    process.stderr.write("codex-starter authority validation failed:\n");
    for (const error of errors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exit(1);
  }

  process.stdout.write("codex-starter authority validation passed\n");
}

main();
