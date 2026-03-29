import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isDirectRun, starterRootDir } from "../helpers/test-paths.mjs";

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertContains(text, expected, label) {
  assert.ok(text.includes(expected), `${label} missing exact text: ${expected}`);
}

export function runAideBaselineContractTests(rootDir) {
  const aideSkill = readText(path.join(rootDir, ".agents", "skills", "aide", "SKILL.md"));
  const routingPolicy = readText(path.join(rootDir, ".codex", "routing-policy.md"));
  const agentsGuide = readText(path.join(rootDir, "AGENTS.md"));
  const hostAgentsGuide = readText(path.resolve(rootDir, "..", "AGENTS.md"));
  const repoExplorerAgent = readText(path.join(rootDir, ".codex", "agents", "repo_explorer.toml"));

  function testDefaultChineseExistsInAuthority() {
    assertContains(
      aideSkill,
      "- default to Chinese unless the user explicitly asks for another language",
      "aide default Chinese"
    );
    assertContains(
      agentsGuide,
      "- Default to Chinese replies unless the user explicitly asks for another language.",
      "AGENTS default Chinese"
    );
  }

  function testDefaultAddressBossExistsInAuthority() {
    assertContains(
      aideSkill,
      "- keep the default preferred address as literal `Boss`; do not translate it to `老板`, do not change its casing, and do not swap it for another title unless the user explicitly asks",
      "aide default Boss"
    );
    assertContains(
      agentsGuide,
      "- Use the literal address `Boss` by default; do not translate it or change its casing unless the user explicitly changes how they want to be addressed.",
      "AGENTS default Boss"
    );
  }

  function testColdThreadFirstGreetingConstraintsExist() {
    assertContains(
      aideSkill,
      "- on the first user turn of a cold thread, use a warm, lively, contextual greeting that reacts to the user's actual message, then move straight into the next useful step",
      "aide cold-thread greeting"
    );
    assertContains(
      aideSkill,
      '- if the user already stated a task or question, acknowledge that task directly instead of asking a generic "what can I help with" follow-up',
      "aide first-turn no generic follow-up"
    );
    assertContains(
      agentsGuide,
      '- cold start with no explicit supported route alias -> let `Aide` handle the first user turn by default, reply in Chinese with a warm contextual greeting that acknowledges the user\'s actual message, keep the default address as `Boss`, and avoid generic "what can I help with" follow-ups after the user already gave a task',
      "AGENTS cold-thread first-turn rule"
    );
  }

  function testOnlyMainAgentOrRuntimeScriptsWriteSharedState() {
    assertContains(
      agentsGuide,
      "- only the main agent or runtime scripts write `.codex/state/*.json`, `.codex/project-profile.md`, or `PROGRESS.md`",
      "AGENTS shared state writer boundary"
    );
    assertContains(
      aideSkill,
      "- only the main agent updates `.codex/state/*.json`, `.codex/project-profile.md`, `PROGRESS.md`, or `.codex/validation-profile.json`",
      "aide main-agent-only updates"
    );
  }

  function testDiscussionAnalysisDefaultsToNoDurableStateWrite() {
    assertContains(
      routingPolicy,
      "For `exploration`, `analysis`, and discussion-shaped work with no durable artifact:",
      "routing discussion/analysis section"
    );
    assertContains(
      routingPolicy,
      "- default state behavior: no durable state write",
      "routing no durable state write default"
    );
    assertContains(
      aideSkill,
      "For discussion-shaped turns with no durable artifact or execution handoff:",
      "aide discussion state section"
    );
    assertContains(
      aideSkill,
      "- prefer no durable state write",
      "aide discussion no durable write default"
    );
  }

  function testRepoExplorerIsShortLivedReadOnlyHelper() {
    assertContains(
      aideSkill,
      "- use `repo_explorer` only as a short-lived read-only helper when ownership, entrypoints, or boundaries are unclear; release it once routing is clear",
      "aide repo_explorer short-lived helper"
    );
    assertContains(
      routingPolicy,
      "- Use `repo_explorer` only as a short-lived read-only helper when ownership, entrypoints, or boundaries are unclear.",
      "routing repo_explorer short-lived helper"
    );
    assertContains(
      repoExplorerAgent,
      "description = \"Read-only repository explorer for mapping code ownership, validation signals, and CI or release clues before routing or edits.\"",
      "repo_explorer read-only description"
    );
    assertContains(repoExplorerAgent, "sandbox_mode = \"read-only\"", "repo_explorer read-only sandbox");
  }

  function testHostIsolationHardBoundaryAcrossHostAndStarterAuthority() {
    assertContains(
      hostAgentsGuide,
      "- While maintaining `/workspace/agent-skills`, treat `codex-starter/**` as the development target, not the active authority for the current maintenance session.",
      "root AGENTS host-isolation development-target rule"
    );
    assertContains(
      hostAgentsGuide,
      "- Do not let `codex-starter` runtime defaults (for example assistant persona, route aliases, or routing rules) leak back into host maintenance sessions unless this root guide or explicit user instruction says so.",
      "root AGENTS host-isolation anti-leak rule"
    );
    assertContains(
      hostAgentsGuide,
      "- This isolation rule does not weaken `codex-starter` runtime authority after it is installed into a target repository.",
      "root AGENTS host-isolation non-weakening rule"
    );
    assertContains(
      agentsGuide,
      "- Runtime authority scope: this file governs sessions after `codex-starter` is installed in a target repository.",
      "starter AGENTS runtime scope rule"
    );
    assertContains(
      agentsGuide,
      "- Source-maintenance boundary: when editing `codex-starter/**` inside a separate host maintenance repository, host-level authority governs that maintenance session; this starter content is the development object under edit.",
      "starter AGENTS source-maintenance boundary rule"
    );
    assertContains(
      aideSkill,
      "- source-maintenance isolation: when this skill file is being edited in a host maintenance repository, treat it as an artifact under development and follow host-level authority for that maintenance session",
      "aide source-maintenance isolation rule"
    );
  }

  [
    testDefaultChineseExistsInAuthority,
    testDefaultAddressBossExistsInAuthority,
    testColdThreadFirstGreetingConstraintsExist,
    testOnlyMainAgentOrRuntimeScriptsWriteSharedState,
    testDiscussionAnalysisDefaultsToNoDurableStateWrite,
    testRepoExplorerIsShortLivedReadOnlyHelper,
    testHostIsolationHardBoundaryAcrossHostAndStarterAuthority
  ].forEach((testFn) => testFn());
}

if (isDirectRun(import.meta.url)) {
  runAideBaselineContractTests(starterRootDir);
  process.stdout.write("aide baseline contract tests passed\n");
}
