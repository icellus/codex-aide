import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertAll(text, patterns, label) {
  patterns.forEach((pattern) => {
    assert.match(text, pattern, `${label} missing ${pattern}`);
  });
}

export function runAideStaffingContractTests(rootDir) {
  const aideSkill = readText(path.join(rootDir, ".agents", "skills", "aide", "SKILL.md"));
  const routingPolicy = readText(path.join(rootDir, ".codex", "routing-policy.md"));
  const agentsGuide = readText(path.join(rootDir, "AGENTS.md"));
  const readme = readText(path.join(rootDir, "README.md"));
  const overview = readText(path.join(rootDir, "docs", "overview.md"));
  const usage = readText(path.join(rootDir, "docs", "usage.md"));
  const detailedGuide = readText(path.join(rootDir, "docs", "detailed-guide.md"));
  const zhOverview = readText(path.join(rootDir, "docs", "overview.zh-CN.md"));
  const zhUsage = readText(path.join(rootDir, "docs", "usage.zh-CN.md"));
  const zhDetailedGuide = readText(path.join(rootDir, "docs", "detailed-guide.zh-CN.md"));

  const authority = [aideSkill, routingPolicy, agentsGuide].join("\n");
  const docs = [readme, overview, usage, detailedGuide, zhOverview, zhUsage, zhDetailedGuide].join("\n");

  function testSmallestTeamIsTheDefaultStaffingRule() {
    assertAll(authority, [/smallest active team/i], "smallest team authority");
    assertAll(docs, [/smallest active team|最小团队|最小团队开始/i], "smallest team docs");
  }

  function testDiscussionKeepsOnlyAideActive() {
    assertAll(authority, [/keep only `Aide` active/i], "discussion aide-only authority");
    assertAll(docs, [/Aide` direct|`Aide` 直接处理|Aide` 直接处理/i], "discussion aide-only docs");
  }

  function testClearRepoChangeUsesOneExecutionRoleFirst() {
    assertAll(authority, [/activate one clear execution role first/i], "single execution role first");
    assertAll(authority, [/prefer cached state plus minimal boundary evidence/i], "minimal evidence first");
  }

  function testTesterQcSubmitNeedSpecificJustification() {
    assertAll(authority, [/Add `tester` only when task-level validation ownership, red\/green separation, or non-trivial behavior risk is real/i], "tester justification");
    assertAll(authority, [/Activate `\/qc` only for explicit audit need or higher-risk delivery/i], "qc justification");
    assertAll(authority, [/Activate `\/submit` only when governed delivery or commit\/push follow-through matters/i], "submit justification");
  }

  function testRepoExplorerIsShortLivedReadOnlyHelp() {
    assertAll(authority, [/short-lived read-only helper/i], "repo explorer short-lived");
    assertAll(authority, [/release it once routing is clear|Use `repo_explorer` only as a short-lived read-only helper/i], "repo explorer release");
  }

  function testNewRepoDoesNotWakeWholeTeam() {
    assertAll(authority, [/not a reason to activate everyone at once|not by itself a reason to activate the whole team/i], "new repo no whole team");
    assertAll(docs, [/新仓库或上下文不足，本身不应该让全队一起醒来|do not activate the whole team only because the repo is new/i], "new repo docs");
  }

  function testRolesDropAgainWhenTaskNarrows() {
    assertAll(authority, [/drop roles that are no longer needed/i], "drop roles authority");
    assertAll(docs, [/drop extra roles again when they are no longer needed|任务收窄后再把多余角色收回去|额外角色应及时退出/i], "drop roles docs");
  }

  function testConductAndPlanningRolesStayConditional() {
    assertAll(authority, [/Activate `conduct` when environment setup, conflict checks, or multi-role delivery routing actually matter/i], "conduct conditional");
    assertAll(authority, [/Activate `prd`, `architect`, or `plan` only for genuine scope, HOW, or implementation-structure uncertainty/i], "planning roles conditional");
  }

  [
    testSmallestTeamIsTheDefaultStaffingRule,
    testDiscussionKeepsOnlyAideActive,
    testClearRepoChangeUsesOneExecutionRoleFirst,
    testTesterQcSubmitNeedSpecificJustification,
    testRepoExplorerIsShortLivedReadOnlyHelp,
    testNewRepoDoesNotWakeWholeTeam,
    testRolesDropAgainWhenTaskNarrows,
    testConductAndPlanningRolesStayConditional
  ].forEach((testFn) => testFn());
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  runAideStaffingContractTests(rootDir);
  process.stdout.write("aide staffing contract tests passed\n");
}
