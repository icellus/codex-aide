import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isDirectRun, starterRootDir } from "../helpers/test-paths.mjs";

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertAll(text, patterns, label) {
  patterns.forEach((pattern) => {
    assert.match(text, pattern, `${label} missing ${pattern}`);
  });
}

export function runAideAuthorityAlignmentTests(rootDir) {
  const aideSkill = readText(path.join(rootDir, ".agents", "skills", "aide", "SKILL.md"));
  const conductSkill = readText(path.join(rootDir, ".agents", "skills", "conduct", "SKILL.md"));
  const routingPolicy = readText(path.join(rootDir, ".codex", "routing-policy.md"));
  const agentsGuide = readText(path.join(rootDir, "AGENTS.md"));
  const readme = readText(path.join(rootDir, "README.md"));
  const overview = readText(path.join(rootDir, "docs", "overview.md"));
  const usage = readText(path.join(rootDir, "docs", "usage.md"));
  const detailedGuide = readText(path.join(rootDir, "docs", "detailed-guide.md"));
  const zhOverview = readText(path.join(rootDir, "docs", "overview.zh-CN.md"));
  const zhUsage = readText(path.join(rootDir, "docs", "usage.zh-CN.md"));
  const zhDetailedGuide = readText(path.join(rootDir, "docs", "detailed-guide.zh-CN.md"));

  const authority = [aideSkill, conductSkill, routingPolicy, agentsGuide].join("\n");
  const docs = [readme, overview, usage, detailedGuide, zhOverview, zhUsage, zhDetailedGuide].join("\n");

  function testSecretaryAndPeopleManagerFramingIsConsistent() {
    assertAll(authority, [/team-secretary and people-manager|team secretary and people manager/i], "secretary framing authority");
    assertAll(docs, [/team secretary and people manager|团队秘书兼人事主管/i], "secretary framing docs");
  }

  function testAideStaysOutOfDefaultImplementation() {
    assertAll(authority, [/not the default implementer|must not become the default implementer|must not execute concrete repo changes itself/i], "non-implementer authority");
    assertAll(docs, [/not the default implementer|不要自己下场实现/i], "non-implementer docs");
  }

  function testMinimalOwnerScanBeatsAutomaticFullScan() {
    assertAll(authority, [/minimal owner scan first|minimal triage first|choose the smallest scan that answers the current task/i], "minimal scan authority");
    assertAll(docs, [/minimum owner scan needed for delegation first|最小 owner scan|最小边界信息|获取足以安全路由的仓库上下文/i], "minimal scan docs");
  }

  function testFullScanIsReservedForSpecificCases() {
    assertAll(authority, [/full scan.*explicitly asked for repo-wide assessment|full scan.*ownership is still unclear after minimal triage|full scan.*high-risk/i], "full scan authority");
    assertAll(docs, [/full scan is for repo-wide assessment, unresolved ownership, or genuinely unknown high-risk boundaries|full scan.*repo-wide assessment|自动 full scan/i], "full scan docs");
  }

  function testUserFacingRepliesHideWorkflowLabels() {
    assertAll(authority, [/never expose internal workflow terms/i, /Do not expose task class, delivery mode, enabled modules/i], "workflow label hiding");
  }

  [
    testSecretaryAndPeopleManagerFramingIsConsistent,
    testAideStaysOutOfDefaultImplementation,
    testMinimalOwnerScanBeatsAutomaticFullScan,
    testFullScanIsReservedForSpecificCases,
    testUserFacingRepliesHideWorkflowLabels
  ].forEach((testFn) => testFn());
}

if (isDirectRun(import.meta.url)) {
  runAideAuthorityAlignmentTests(starterRootDir);
  process.stdout.write("aide authority alignment tests passed\n");
}
