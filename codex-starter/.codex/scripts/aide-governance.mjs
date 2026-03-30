#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  compareGovernanceSeverity,
  compactText,
  getProjectContext,
  loadEvolutionRegistry,
  loadRuntimeState,
  normalizeGovernanceSeverity,
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
    severity: normalizeGovernanceSeverity(entry.severity || "L2"),
    capability: entry.capability || "audit",
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

function collectAuditFindings(projectDir) {
  const findings = [];
  const skillDir = path.join(projectDir, ".agents", "skills");
  const agentDir = path.join(projectDir, ".codex", "agents");
  const skillFiles = listFiles(skillDir, (filePath) => filePath.endsWith("SKILL.md"));
  const agentFiles = listFiles(agentDir, (filePath) => filePath.endsWith(".toml"));

  for (const filePath of skillFiles) {
    const skill = parseSkillMetadata(filePath);
    const file = relativePath(projectDir, filePath);

    if (!skill.name) {
      addFinding(findings, {
        severity: "L3",
        title: "Skill missing name metadata",
        impact: "The skill contract is harder to route and audit consistently.",
        target: file,
        file,
        recommendation: "Add a stable frontmatter name field."
      });
    }

    if (!skill.description) {
      addFinding(findings, {
        severity: "L2",
        title: "Skill missing description metadata",
        impact: "The skill intent is harder to understand at intake time.",
        target: file,
        file,
        recommendation: "Add a short frontmatter description."
      });
    }

    if (!hasSection(skill.text, "## Read Order") && !hasSection(skill.text, "## Sources of truth")) {
      addFinding(findings, {
        severity: "L2",
        title: "Skill lacks a clear read-order or source-of-truth section",
        impact: "The role may gather context inconsistently and drift across sessions.",
        target: file,
        file,
        recommendation: "Add a section that makes the authority chain explicit."
      });
    }

    if (skill.name === "aide") {
      for (const heading of ["## Capability Ratings", "## Automatic Triggers", "## Governance Output", "## Product Review"]) {
        if (!hasSection(skill.text, heading)) {
          addFinding(findings, {
            severity: "L3",
            title: `Aide governance contract is incomplete: missing ${heading}`,
            impact: "Severity-based governance and automatic writeback review become inconsistent.",
            target: file,
            file,
            recommendation: `Add ${heading} to the Aide skill contract.`
          });
        }
      }
    }

    if (skill.name === "architect") {
      for (const heading of ["## Session-End Retrospective", "## Output contract", "## Structured Result"]) {
        if (!hasSection(skill.text, heading)) {
          addFinding(findings, {
            severity: "L3",
            title: `Architect knowledge-capture contract is incomplete: missing ${heading}`,
            impact: "Architecture decisions and wrong assumptions are harder to feed back into /Aide.",
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
        severity: "L2",
        title: "Agent metadata is incomplete",
        impact: "The role is harder to route and audit consistently.",
        target: file,
        file,
        recommendation: "Keep name and description fields present in every agent definition."
      });
    }

    if (!/developer_instructions\s*=/.test(text)) {
      addFinding(findings, {
        severity: "L3",
        title: "Agent is missing developer instructions",
        impact: "The role can drift because its operating contract is implicit.",
        target: file,
        file,
        recommendation: "Add explicit developer instructions."
      });
    }

    if (isWriter && !text.includes("## Structured Result")) {
      addFinding(findings, {
        severity: "L3",
        title: "Write-capable agent lacks a structured result footer",
        impact: "Runtime automation cannot reliably extract completion status or blockers.",
        target: file,
        file,
        recommendation: "Add a stable `## Structured Result` footer."
      });
    }
  }

  return findings.sort((left, right) => {
    const severityOrder = compareGovernanceSeverity(left.severity, right.severity);
    if (severityOrder !== 0) {
      return severityOrder;
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
  if (/route|routing|delivery mode|environment setup|\/qc|\/submit/.test(normalizedLine)) {
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

    const severity = files.length >= 4 ? "L3" : files.length >= 3 ? "L2" : "L1";
    candidates.push({
      severity,
      preview: entry.preview,
      files,
      proposedAuthority: dedupAuthoritySuggestion(normalized, files),
      rationale: `This line or rule fragment appears in ${files.length} governance files and is a good consolidation target.`
    });
  }

  return candidates.sort((left, right) => {
    const severityOrder = compareGovernanceSeverity(left.severity, right.severity);
    if (severityOrder !== 0) {
      return severityOrder;
    }
    return right.files.length - left.files.length;
  });
}

function collectPendingAideReviews(state) {
  return (Array.isArray(state.pendingActions) ? state.pendingActions : [])
    .filter((item) => item.type === "aide_review")
    .sort((left, right) => {
      const severityOrder = compareGovernanceSeverity(left.severity, right.severity);
      if (severityOrder !== 0) {
        return severityOrder;
      }

      const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}

function renderPendingReviews(lines, state, limit) {
  const reviews = collectPendingAideReviews(state);
  lines.push("Pending Aide reviews:");

  if (reviews.length === 0) {
    lines.push("- none");
    return;
  }

  reviews.slice(0, limit).forEach((item) => {
    const severity = normalizeGovernanceSeverity(item.severity || "L2");
    const capability = item.capability || "investigation";
    const target = item.routeTarget ? ` -> ${item.routeTarget}` : "";
    lines.push(`- [${severity}] [${capability}] ${compactText(item.note || "review pending", 120)}${target}`);
  });
}

function collectActiveEvolutionCandidates(projectDir) {
  const registry = loadEvolutionRegistry(projectDir);
  return (Array.isArray(registry.candidates) ? registry.candidates : [])
    .filter((item) => String(item.status || "queued").trim().toLowerCase() === "queued")
    .sort((left, right) => {
      const severityOrder = compareGovernanceSeverity(left.severity, right.severity);
      if (severityOrder !== 0) {
        return severityOrder;
      }

      const leftTime = new Date(left.updatedAt || left.lastSeenAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.updatedAt || right.lastSeenAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}

function renderEvolutionCandidates(lines, projectDir, limit) {
  const candidates = collectActiveEvolutionCandidates(projectDir);
  lines.push("Evolution candidates:");

  if (candidates.length === 0) {
    lines.push("- none");
    return;
  }

  candidates.slice(0, limit).forEach((item) => {
    const capability = item.capability ? ` [${item.capability}]` : "";
    lines.push(
      `- [${normalizeGovernanceSeverity(item.severity || "L2")}]${capability} ${compactText(
        item.summary || "candidate queued",
        120
      )}`
    );
  });
}

function renderAuditFindings(lines, projectDir, limit) {
  const findings = collectAuditFindings(projectDir);
  lines.push("Quality audit findings:");

  if (findings.length === 0) {
    lines.push("- none");
    return;
  }

  findings.slice(0, limit).forEach((item) => {
    lines.push(
      `- [${item.severity}] ${item.title} (${item.file || item.target}) -> ${compactText(
        item.recommendation || item.impact,
        120
      )}`
    );
  });
}

function renderDedup(lines, projectDir, limit) {
  const candidates = collectDedupCandidates(projectDir);
  lines.push("Dedup candidates:");

  if (candidates.length === 0) {
    lines.push("- none");
    return;
  }

  candidates.slice(0, limit).forEach((item) => {
    lines.push(
      `- [${item.severity}] ${compactText(item.preview, 100)} -> ${item.proposedAuthority} (${item.files.length} files)`
    );
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
    const mode = String(input.mode || "summary").trim().toLowerCase();
    const parsedLimit = Number.parseInt(String(input.limit || ""), 10);
    const defaultLimit = mode === "summary" ? 5 : 20;
    const limit = Math.max(1, Math.min(20, Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit));
    const lines = [];

    if (mode === "investigate") {
      lines.push("Aide governance investigation:");
      renderPendingReviews(lines, state, limit);
      lines.push("");
      renderEvolutionCandidates(lines, projectDir, limit);
    } else if (mode === "audit") {
      lines.push("Aide quality audit:");
      renderAuditFindings(lines, projectDir, limit);
    } else if (mode === "dedup") {
      lines.push("Aide dedup review:");
      renderDedup(lines, projectDir, limit);
    } else {
      lines.push("Aide governance summary:");
      renderPendingReviews(lines, state, limit);
      lines.push("");
      renderEvolutionCandidates(lines, projectDir, Math.min(limit, 3));
      lines.push("");
      renderAuditFindings(lines, projectDir, Math.min(limit, 3));
      lines.push("");
      renderDedup(lines, projectDir, Math.min(limit, 3));
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
