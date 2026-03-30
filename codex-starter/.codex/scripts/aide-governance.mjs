#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  compareGovernanceLevel,
  compactText,
  getProjectContext,
  loadAideGovernancePolicy,
  loadGovernanceRegistry,
  loadRuntimeState,
  normalizeGovernanceLevel,
  readJsonStdinEnvelope,
  startRuntimeInvocationLogging
} from "./runtime-utils.mjs";

function relativePath(projectDir, filePath) {
  return path.relative(projectDir, filePath).replace(/\\/g, "/") || path.basename(filePath);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listFiles(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const results = [];

  for (const name of fs.readdirSync(dirPath)) {
    const filePath = path.join(dirPath, name);

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results.push(...listFiles(filePath, predicate));
      } else if (stat.isFile() && predicate(filePath)) {
        results.push(filePath);
      }
    } catch {
      continue;
    }
  }

  return results.sort();
}

function parseSkillMetadata(filePath) {
  const text = readText(filePath);
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
  const block = frontmatter?.[1] || "";

  return {
    filePath,
    text,
    name: block.match(/^name:\s*(.+)$/m)?.[1]?.trim() || "",
    description: block.match(/^description:\s*(.+)$/m)?.[1]?.trim() || ""
  };
}

function addFinding(findings, entry) {
  findings.push({
    level: normalizeGovernanceLevel(entry.level || "G2"),
    title: entry.title || "Untitled finding",
    impact: entry.impact || "",
    target: entry.target || "",
    file: entry.file || "",
    recommendation: entry.recommendation || ""
  });
}

function hasSection(text, heading) {
  return String(text || "").includes(heading);
}

function governanceDisposition(policy, level, fallback = "ask-user") {
  const normalizedLevel = normalizeGovernanceLevel(level);
  const defaults = policy?.default_disposition && typeof policy.default_disposition === "object"
    ? policy.default_disposition
    : {};
  return String(defaults[normalizedLevel] || fallback).trim() || fallback;
}

function pushGovernanceRecord(lines, record) {
  lines.push(`- issue: ${record.issue || "unknown"}`);
  lines.push(`  level: ${normalizeGovernanceLevel(record.level)}`);
  lines.push(`  impact: ${record.impact || "unknown"}`);
  lines.push(`  authority_target: ${record.authority_target || "to-be-determined"}`);
  lines.push(`  recommended_action: ${record.recommended_action || "review and decide next step"}`);
  lines.push(`  disposition: ${record.disposition || "ask-user"}`);
}

function levelForAuditFinding(item) {
  const title = String(item.title || "").toLowerCase();
  const file = String(item.file || item.target || "");

  if (
    title.includes("structured result footer") ||
    title.includes("runtime automation") ||
    file.includes("/scripts/")
  ) {
    return "G3";
  }

  if (
    title.includes("governance") ||
    title.includes("authority") ||
    title.includes("role contract") ||
    title.includes("developer instructions")
  ) {
    return "G2";
  }

  return "G1";
}

function levelForPendingReview(item) {
  return normalizeGovernanceLevel(item.level || "G2");
}

function levelForGovernanceCandidate(item) {
  return normalizeGovernanceLevel(item.level || item.governanceLevel || "G2");
}

function collectAuditFindings(projectDir) {
  const findings = [];
  const governancePolicy = loadAideGovernancePolicy(projectDir);
  const skillDirs = [path.join(projectDir, ".codex", "skills"), path.join(projectDir, ".agents", "skills")];
  const agentDir = path.join(projectDir, ".codex", "agents");
  const skillFiles = Array.from(
    new Set(skillDirs.flatMap((dirPath) => listFiles(dirPath, (filePath) => filePath.endsWith("SKILL.md"))))
  ).sort();
  const agentFiles = listFiles(agentDir, (filePath) => filePath.endsWith(".toml"));

  for (const filePath of skillFiles) {
    const skill = parseSkillMetadata(filePath);
    const file = relativePath(projectDir, filePath);

    if (!skill.name) {
      addFinding(findings, {
        level: "G2",
        title: "Skill missing name metadata",
        impact: "The skill contract is harder to route and audit consistently.",
        target: file,
        file,
        recommendation: "Add a stable frontmatter name field."
      });
    }

    if (!skill.description) {
      addFinding(findings, {
        level: "G1",
        title: "Skill missing description metadata",
        impact: "The skill intent is harder to understand at intake time.",
        target: file,
        file,
        recommendation: "Add a short frontmatter description."
      });
    }

    if (!hasSection(skill.text, "## Read Order") && !hasSection(skill.text, "## Sources of truth")) {
      addFinding(findings, {
        level: "G2",
        title: "Skill lacks a clear read-order or source-of-truth section",
        impact: "The role may gather context inconsistently and drift across sessions.",
        target: file,
        file,
        recommendation: "Add a section that makes the authority chain explicit."
      });
    }

    if (skill.name === "aide") {
      if (!hasSection(skill.text, "## Capability Ratings")) {
        addFinding(findings, {
          level: "G2",
          title: "Aide role contract is incomplete: missing ## Capability Ratings",
          impact: "Aide capability boundaries are harder to keep stable over time.",
          target: file,
          file,
          recommendation: "Add ## Capability Ratings to the Aide skill contract."
        });
      }

      if (!skill.text.includes(".codex/policies/aide-governance-policy.md")) {
        addFinding(findings, {
          level: "G2",
          title: "Aide governance authority is not delegated to the governance policy",
          impact: "Governance rules may drift back into the Aide skill instead of staying in one policy owner.",
          target: file,
          file,
          recommendation: "Reference .codex/policies/aide-governance-policy.md from the Aide skill."
        });
      }
    }

    if (skill.name === "architect") {
      for (const heading of ["## Session-End Retrospective", "## Output contract", "## Structured Result"]) {
        if (!hasSection(skill.text, heading)) {
          addFinding(findings, {
            level: "G2",
            title: `Architect knowledge-capture contract is incomplete: missing ${heading}`,
            impact: "Architecture decisions and wrong assumptions are harder to feed back into Aide.",
            target: file,
            file,
            recommendation: `Add ${heading} so architect closes each session with structured knowledge capture.`
          });
        }
      }
    }
  }

  for (const filePath of agentFiles) {
    const text = readText(filePath);
    const file = relativePath(projectDir, filePath);
    const isWriter = /workspace-write/.test(text);

    if (!/name\s*=/.test(text) || !/description\s*=/.test(text)) {
      addFinding(findings, {
        level: "G2",
        title: "Agent metadata is incomplete",
        impact: "The role is harder to route and audit consistently.",
        target: file,
        file,
        recommendation: "Keep name and description fields present in every agent definition."
      });
    }

    if (!/developer_instructions\s*=/.test(text)) {
      addFinding(findings, {
        level: "G2",
        title: "Agent is missing developer instructions",
        impact: "The role can drift because its operating contract is implicit.",
        target: file,
        file,
        recommendation: "Add explicit developer instructions."
      });
    }

    if (isWriter && !text.includes("## Structured Result")) {
      addFinding(findings, {
        level: "G3",
        title: "Write-capable agent lacks a structured result footer",
        impact: "Runtime automation cannot reliably extract completion status or blockers.",
        target: file,
        file,
        recommendation: "Add a stable `## Structured Result` footer."
      });
    }
  }

  const governanceFile = relativePath(projectDir, governancePolicy.filePath || path.join(projectDir, ".codex", "policies", "aide-governance-policy.md"));
  if (!governancePolicy.text) {
    addFinding(findings, {
      level: "G2",
      title: "Aide governance policy is missing",
      impact: "Governance objects, triggers, levels, and dispositions no longer have a single owner file.",
      target: governanceFile,
      file: governanceFile,
      recommendation: "Add .codex/policies/aide-governance-policy.md as the single governance authority."
    });
  } else {
    for (const heading of ["## Governance Objects", "## Governance Triggers", "## Governance Levels", "## Governance Output", "## State Persistence", "## Automatic Disposition"]) {
      if (!hasSection(governancePolicy.text, heading)) {
        addFinding(findings, {
          level: "G2",
          title: `Aide governance policy is incomplete: missing ${heading}`,
          impact: "Governance rules become harder to audit and keep consistent across scripts and contracts.",
          target: governanceFile,
          file: governanceFile,
          recommendation: `Add ${heading} to .codex/policies/aide-governance-policy.md.`
        });
      }
    }

    const autoFixLevels = Array.isArray(governancePolicy.auto_fix_levels) ? governancePolicy.auto_fix_levels : [];
    if (autoFixLevels.some((level) => String(level || "").trim().toUpperCase() !== "G1")) {
      addFinding(findings, {
        level: "G3",
        title: "Aide governance policy allows auto-fix outside G1",
        impact: "Automatic governance writeback could expand beyond the agreed low-risk boundary.",
        target: governanceFile,
        file: governanceFile,
        recommendation: "Keep auto_fix_levels restricted to G1 only."
      });
    }
  }

  return findings.sort((left, right) => {
    const levelOrder = compareGovernanceLevel(left.level, right.level);
    if (levelOrder !== 0) {
      return levelOrder;
    }
    return String(left.title).localeCompare(String(right.title));
  });
}

function isUsefulDedupLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return false;
  }

  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("```") ||
    trimmed === "---" ||
    trimmed.startsWith("|") ||
    trimmed.startsWith("name =") ||
    trimmed.startsWith("description =") ||
    trimmed.startsWith("model =") ||
    trimmed.startsWith("sandbox_mode =")
  ) {
    return false;
  }

  return trimmed.length >= 40;
}

function normalizeDedupLine(line) {
  return String(line || "")
    .trim()
    .toLowerCase()
    .replace(/^[-*\d. )]+/, "")
    .replace(/[`"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.;:,]+$/g, "");
}

function dedupAuthoritySuggestion(normalizedLine, files) {
  if (/\broute\b|\brouting\b|delivery mode|environment setup|\bqc\b|\bsubmit\b/.test(normalizedLine)) {
    return ".codex/policies/routing-policy.md";
  }

  if (/validation profile|repository baseline|task-level validation/.test(normalizedLine)) {
    return ".codex/policies/validation-profile.json";
  }

  if (/only the main agent updates|runtime files|slash command|command map/.test(normalizedLine)) {
    return "AGENTS.md";
  }

  if (files.every((file) => file.startsWith(".codex/agents/"))) {
    return "extract a shared subagent baseline";
  }

  if (files.some((file) => file.includes("/aide/"))) {
    return ".codex/skills/aide/SKILL.md";
  }

  return "the smallest shared authority file";
}

function collectDedupCandidates(projectDir) {
  const filePaths = [
    path.join(projectDir, "AGENTS.md"),
    ...listFiles(path.join(projectDir, ".codex", "skills"), (filePath) => filePath.endsWith("SKILL.md")),
    ...listFiles(path.join(projectDir, ".codex", "agents"), (filePath) => filePath.endsWith(".toml"))
  ].filter((filePath) => fs.existsSync(filePath));

  const groups = new Map();

  for (const filePath of filePaths) {
    const file = relativePath(projectDir, filePath);
    const lines = readText(filePath).split(/\r?\n/);

    for (const rawLine of lines) {
      if (!isUsefulDedupLine(rawLine)) {
        continue;
      }

      const normalized = normalizeDedupLine(rawLine);
      if (!normalized) {
        continue;
      }

      const existing = groups.get(normalized) || {
        preview: rawLine.trim(),
        files: new Set()
      };

      existing.files.add(file);
      groups.set(normalized, existing);
    }
  }

  const candidates = [];

  for (const [normalized, entry] of groups.entries()) {
    const files = Array.from(entry.files).sort();
    if (files.length < 2) {
      continue;
    }

    const level = files.length >= 4 ? "G2" : "G1";
    candidates.push({
      level,
      preview: entry.preview,
      files,
      proposedAuthority: dedupAuthoritySuggestion(normalized, files),
      rationale: `This line or rule fragment appears in ${files.length} governance files and is a good consolidation target.`
    });
  }

  return candidates.sort((left, right) => {
    const levelOrder = compareGovernanceLevel(left.level, right.level);
    if (levelOrder !== 0) {
      return levelOrder;
    }
    return right.files.length - left.files.length;
  });
}

function collectPendingGovernanceReviews(state) {
  return (Array.isArray(state.pendingActions) ? state.pendingActions : [])
    .filter((item) => item.type === "governance_review")
    .sort((left, right) => {
      const levelOrder = compareGovernanceLevel(left.level, right.level);
      if (levelOrder !== 0) {
        return levelOrder;
      }

      const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}

function renderPendingReviews(lines, state, limit, governancePolicy) {
  const reviews = collectPendingGovernanceReviews(state);
  lines.push("Pending governance reviews:");

  if (reviews.length === 0) {
    lines.push("- none");
    return;
  }

  reviews.slice(0, limit).forEach((item) => {
    const level = levelForPendingReview(item);
    pushGovernanceRecord(lines, {
      issue: compactText(item.issue || item.note || "review pending", 120),
      level,
      impact: item.impact || `governance signal from ${String(item.sourceRole || "runtime").trim() || "runtime"}`,
      authority_target: item.authority_target || item.planPath || "to-be-determined",
      recommended_action: item.recommended_action || "review the signal and choose the smallest authority owner",
      disposition: item.disposition || governanceDisposition(governancePolicy, level)
    });
  });
}

function collectActiveGovernanceCandidates(projectDir) {
  const registry = loadGovernanceRegistry(projectDir);
  return (Array.isArray(registry.candidates) ? registry.candidates : [])
    .filter((item) => String(item.status || "queued").trim().toLowerCase() === "queued")
    .sort((left, right) => {
      const levelOrder = compareGovernanceLevel(left.level, right.level);
      if (levelOrder !== 0) {
        return levelOrder;
      }

      const leftTime = new Date(left.updatedAt || left.lastSeenAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.updatedAt || right.lastSeenAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}

function renderGovernanceCandidates(lines, projectDir, limit, governancePolicy) {
  const candidates = collectActiveGovernanceCandidates(projectDir);
  lines.push("Governance queue:");

  if (candidates.length === 0) {
    lines.push("- none");
    return;
  }

  candidates.slice(0, limit).forEach((item) => {
    const level = levelForGovernanceCandidate(item);
    pushGovernanceRecord(lines, {
      issue: compactText(item.issue || item.summary || "candidate queued", 120),
      level,
      impact: item.impact || `governance candidate from ${String(item.sourceType || "unknown")}`,
      authority_target: item.authority_target || item.planPath || "to-be-determined",
      recommended_action:
        item.recommended_action ||
        (level === "G1"
          ? "review whether this low-risk guidance should write back now"
          : "review before writeback or broader governance correction"),
      disposition: item.disposition || governanceDisposition(governancePolicy, level, "queue")
    });
  });
}

function renderAuditFindings(lines, projectDir, limit, governancePolicy) {
  const findings = collectAuditFindings(projectDir);
  lines.push("Quality audit findings:");

  if (findings.length === 0) {
    lines.push("- none");
    return;
  }

  findings.slice(0, limit).forEach((item) => {
    const level = item.level || levelForAuditFinding(item);
    pushGovernanceRecord(lines, {
      issue: item.title,
      level,
      impact: compactText(item.impact || "governance quality risk", 120),
      authority_target: item.target || item.file || "to-be-determined",
      recommended_action: compactText(item.recommendation || "correct the smallest owner file", 120),
      disposition: governanceDisposition(governancePolicy, level)
    });
  });
}

function renderDedup(lines, projectDir, limit, governancePolicy) {
  const candidates = collectDedupCandidates(projectDir);
  lines.push("Dedup candidates:");

  if (candidates.length === 0) {
    lines.push("- none");
    return;
  }

  candidates.slice(0, limit).forEach((item) => {
    const level = item.files.length >= 4 ? "G2" : "G1";
    pushGovernanceRecord(lines, {
      issue: compactText(item.preview, 100),
      level,
      impact: compactText(item.rationale, 120),
      authority_target: item.proposedAuthority,
      recommended_action: `shrink duplicate text into ${item.proposedAuthority}`,
      disposition: governanceDisposition(governancePolicy, level)
    });
  });
}

async function main() {
  const envelope = await readJsonStdinEnvelope();
  const input = envelope.value;
  const project = getProjectContext(input);
  const projectDir = project.projectDir;
  const logger = startRuntimeInvocationLogging({
    projectDir,
    scriptName: "aide-governance.mjs",
    input,
    rawInput: envelope.raw,
    metadata: {
      projectDirSource: project.source
    }
  });
  const restoreStreams = logger.captureProcessStreams();

  try {
    const state = loadRuntimeState(projectDir);
    const governancePolicy = loadAideGovernancePolicy(projectDir);
    const mode = String(input.mode || "summary").trim().toLowerCase();
    const parsedLimit = Number.parseInt(String(input.limit || ""), 10);
    const defaultLimit = mode === "summary" ? 5 : 20;
    const limit = Math.max(1, Math.min(20, Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit));
    const lines = [];

    if (mode === "investigate") {
      lines.push("Aide governance investigation:");
      renderPendingReviews(lines, state, limit, governancePolicy);
      lines.push("");
      renderGovernanceCandidates(lines, projectDir, limit, governancePolicy);
    } else if (mode === "audit") {
      lines.push("Aide quality audit:");
      renderAuditFindings(lines, projectDir, limit, governancePolicy);
    } else if (mode === "dedup") {
      lines.push("Aide dedup review:");
      renderDedup(lines, projectDir, limit, governancePolicy);
    } else {
      lines.push("Aide governance summary:");
      renderPendingReviews(lines, state, limit, governancePolicy);
      lines.push("");
      renderGovernanceCandidates(lines, projectDir, Math.min(limit, 3), governancePolicy);
      lines.push("");
      renderAuditFindings(lines, projectDir, Math.min(limit, 3), governancePolicy);
      lines.push("");
      renderDedup(lines, projectDir, Math.min(limit, 3), governancePolicy);
    }

    process.stdout.write(`${lines.join("\n")}\n`);
    logger.finalize({
      status: "ok",
      metadata: {
        mode,
        limit
      }
    });
  } catch (error) {
    process.stderr.write(`aide-governance error: ${error instanceof Error ? error.message : String(error)}\n`);
    logger.finalize({
      status: "error",
      error
    });
    process.exit(1);
  } finally {
    restoreStreams();
  }
}

await main();
