import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isDirectRun, starterRootDir } from "../helpers/test-paths.mjs";

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeRegex(pattern) {
  if (pattern instanceof RegExp) {
    return new RegExp(pattern.source, pattern.flags.replace(/g/g, ""));
  }
  return new RegExp(String(pattern), "i");
}

function assertAll(text, patterns, label) {
  patterns.forEach((pattern) => {
    assert.match(text, normalizeRegex(pattern), `${label} missing ${pattern}`);
  });
}

function assertAny(files, patterns, label) {
  patterns.forEach((pattern) => {
    const regex = normalizeRegex(pattern);
    const hit = files.some((file) => regex.test(file.text));
    assert.equal(hit, true, `${label} missing ${regex}`);
  });
}

function assertNoMatch(text, pattern, label) {
  assert.doesNotMatch(text, normalizeRegex(pattern), `${label} has forbidden match ${pattern}`);
}

function findUnguardedLines(files, triggerPattern, guardPattern, radius = 1) {
  const trigger = normalizeRegex(triggerPattern);
  const guard = normalizeRegex(guardPattern);
  const offenders = [];

  files.forEach((file) => {
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (!trigger.test(line)) {
        return;
      }
      const start = Math.max(0, idx - radius);
      const end = Math.min(lines.length - 1, idx + radius);
      const window = lines.slice(start, end + 1).join(" ");
      if (!guard.test(window)) {
        offenders.push(`${file.relPath}:${idx + 1}: ${line.trim()}`);
      }
    });
  });

  return offenders;
}

function assertNoUnguardedLines(files, triggerPattern, guardPattern, label, radius = 1) {
  const offenders = findUnguardedLines(files, triggerPattern, guardPattern, radius);
  assert.equal(
    offenders.length,
    0,
    `${label} found conflicting unguarded lines:\n${offenders.slice(0, 8).join("\n")}`
  );
}

function extractUserFacingReplyBullets(text) {
  const match = text.match(/user-facing reply(?:,)? return only:\s*\n((?:- .*(?:\n|$)){2,8})/i);
  if (!match) {
    return [];
  }
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function loadCorpus(rootDir) {
  const authorityFiles = [
    {
      key: "aideSkill",
      relPath: ".agents/skills/aide/SKILL.md",
      text: readText(path.join(rootDir, ".agents", "skills", "aide", "SKILL.md"))
    },
    {
      key: "conductSkill",
      relPath: ".agents/skills/conduct/SKILL.md",
      text: readText(path.join(rootDir, ".agents", "skills", "conduct", "SKILL.md"))
    },
    {
      key: "routingPolicy",
      relPath: ".codex/routing-policy.md",
      text: readText(path.join(rootDir, ".codex", "routing-policy.md"))
    },
    {
      key: "agentsGuide",
      relPath: "AGENTS.md",
      text: readText(path.join(rootDir, "AGENTS.md"))
    }
  ];

  const docsFiles = [
    {
      key: "readme",
      relPath: "README.md",
      text: readText(path.join(rootDir, "README.md"))
    },
    {
      key: "overview",
      relPath: "docs/overview.md",
      text: readText(path.join(rootDir, "docs", "overview.md"))
    },
    {
      key: "usage",
      relPath: "docs/usage.md",
      text: readText(path.join(rootDir, "docs", "usage.md"))
    },
    {
      key: "detailedGuide",
      relPath: "docs/detailed-guide.md",
      text: readText(path.join(rootDir, "docs", "detailed-guide.md"))
    },
    {
      key: "zhOverview",
      relPath: "docs/overview.zh-CN.md",
      text: readText(path.join(rootDir, "docs", "overview.zh-CN.md"))
    },
    {
      key: "zhUsage",
      relPath: "docs/usage.zh-CN.md",
      text: readText(path.join(rootDir, "docs", "usage.zh-CN.md"))
    },
    {
      key: "zhDetailedGuide",
      relPath: "docs/detailed-guide.zh-CN.md",
      text: readText(path.join(rootDir, "docs", "detailed-guide.zh-CN.md"))
    }
  ];

  return {
    authorityFiles,
    docsFiles,
    allFiles: [...authorityFiles, ...docsFiles]
  };
}

export function runAideConflictContractTests(rootDir) {
  const { authorityFiles, docsFiles, allFiles } = loadCorpus(rootDir);

  const aideSkill = authorityFiles.find((file) => file.key === "aideSkill").text;
  const routingPolicy = authorityFiles.find((file) => file.key === "routingPolicy").text;

  function testAideCannotBecomeDefaultImplementer() {
    assertAny(
      authorityFiles,
      [/coordinator, not the default implementer/i, /must not execute concrete repo changes itself/i, /do not implement repository changes/i],
      "aide non-implementer authority"
    );
    assertAny(
      docsFiles,
      [/not the default implementer/i, /不要自己下场实现/i],
      "aide non-implementer docs"
    );

    assertNoUnguardedLines(
      allFiles,
      /(?:\bAide\b|\/Aide|`Aide`).{0,120}(?:default implementer|默认执行者|自己下场实现|implement(?:s|ing)?(?:\s+\w+){0,4}\s+(?:repo|repository|code|change|artifact))/i,
      /(?:not|must not|do not|don't|cannot|can't|delegate|instead|不是|不能|不要|不应|不得)/i,
      "aide implementer conflict"
    );
  }

  function testNewRepoOrThinContextCannotDefaultWakeWholeTeam() {
    assertAny(
      authorityFiles,
      [/new repo, cold start, or thin context is not by itself a reason to activate the whole team/i, /do not wake them up just because the repo is new/i],
      "new/thin context authority"
    );
    assertAny(
      docsFiles,
      [/do not activate the whole team only because the repo is new/i, /新仓库或上下文不足，本身不应该让全队一起醒来/i],
      "new/thin context docs"
    );

    assertNoUnguardedLines(
      allFiles,
      /(?:new repo|cold start|thin context|missing context|stale context|新仓库|冷启动|上下文不足|上下文偏薄|上下文过期).{0,140}(?:activate everyone|activate the whole team|wake every role|wake the whole team|全队一起醒来|整支团队都激活|所有角色都该一起上线)/i,
      /(?:not|do not|should not|is not|isn't|不要|不应|不能|不是|并非|不代表|unless|only when|除非)/i,
      "new/thin context whole-team conflict"
    );
  }

  function testInternalWorkflowTermsStayOutOfUserVisibleReplyContract() {
    assertAll(
      aideSkill,
      [/never expose internal workflow terms/i, /unless the user explicitly asks how the system works/i],
      "aide user-facing language guard"
    );
    assertAll(
      routingPolicy,
      [/Do not expose task class, delivery mode, enabled modules, or other internal workflow labels/i],
      "routing user-facing language guard"
    );

    const aideBullets = extractUserFacingReplyBullets(aideSkill);
    const policyBullets = extractUserFacingReplyBullets(routingPolicy);
    assert.ok(aideBullets.length >= 3, "aide user-facing reply contract bullets missing");
    assert.ok(policyBullets.length >= 3, "routing user-facing reply contract bullets missing");

    const replyContract = [...aideBullets, ...policyBullets].join("\n");
    assertNoMatch(
      replyContract,
      /task class|delivery mode|enabled modules|module|governance|hot state|cold start|任务分类|交付模式|启用模块|治理|冷启动/i,
      "user-visible reply contract should stay plain-language"
    );

    assertNoUnguardedLines(
      authorityFiles,
      /(?:user-facing reply|用户可见答复|对用户回复).{0,140}(?:task class|delivery mode|enabled modules|internal workflow|route labels|任务分类|交付模式|启用模块|内部流程词)/i,
      /(?:do not|never|unless|only when.*explicitly asks|不.*暴露|除非用户明确询问|默认不应|仅在.*询问)/i,
      "internal workflow term exposure conflict"
    );
  }

  function testFullScanCannotBeAutoTriggeredByNewOrStaleContext() {
    assertAny(
      authorityFiles,
      [/missing or stale repo context does not override early delegation/i, /minimal triage first/i, /full scan.*only when/i],
      "full scan precedence authority"
    );
    assertAny(
      docsFiles,
      [/minimum owner scan needed for delegation first/i, /先做足以安全分派的最小 owner scan/i],
      "full scan precedence docs"
    );

    assertNoUnguardedLines(
      allFiles,
      /(?:new repo|cold start|missing|stale|thin context|新仓库|冷启动|上下文不足|上下文过期).{0,140}(?:full scan|全面扫描|全量扫描|repo-wide assessment)/i,
      /(?:smallest scan|minimal owner scan|minimum owner scan needed|minimal triage|not|do not|should not|is not|isn't|only when|unless|reserve|is for repo-wide assessment|先做最小|最小 owner scan|不是.*理由|不应|除非|仅在|取决于范围|depending on scope)/i,
      "full scan auto-trigger conflict"
    );

    const aideHasScopeConditional = /may be a minimal owner scan or a full scan depending on scope/i.test(aideSkill);
    if (aideHasScopeConditional) {
      assert.match(
        aideSkill,
        /missing or stale repo context alone is not a reason to delay delegation/i,
        "ambiguity guard missing: scope-conditional full scan must be paired with explicit non-auto-trigger precedence"
      );
    }
  }

  function testMultiWriterSteadyStateConcurrencyIsDisallowed() {
    assertAny(
      authorityFiles,
      [/allow only one write-capable subagent at a time/i, /Avoid multiple write-capable execution roles at the same time unless `conduct` coordinates a staged handoff/i, /do not keep multiple write-capable execution roles active at the same time unless `conduct` explicitly stages the handoff/i],
      "multi-writer authority"
    );
    assertAll(
      authorityFiles.find((file) => file.key === "conductSkill").text,
      [/another active write-capable role/i, /If a conflict exists, stop and report it/i],
      "conduct write-conflict stop"
    );

    assertNoUnguardedLines(
      allFiles,
      /(?:multiple|more than one|多个).{0,80}(?:write-capable|writer|执行角色).{0,80}(?:at the same time|同时|并发|parallel|concurrent)/i,
      /(?:do not|must not|avoid|allow only one|unless.*conduct|conflict|stop and report|不应|不要|仅允许一个|除非.*conduct|冲突|停止)/i,
      "multi-writer concurrency conflict",
      3
    );

    const combined = allFiles.map((file) => file.text).join("\n");
    assertNoMatch(
      combined,
      /(?:default|by default|normally|常态|默认).{0,100}(?:multiple|more than one|多个).{0,80}(?:write-capable|writer|执行角色).{0,80}(?:active|parallel|concurrent|同时|并发)/i,
      "multi-writer steady-state should not be allowed"
    );
  }

  [
    testAideCannotBecomeDefaultImplementer,
    testNewRepoOrThinContextCannotDefaultWakeWholeTeam,
    testInternalWorkflowTermsStayOutOfUserVisibleReplyContract,
    testFullScanCannotBeAutoTriggeredByNewOrStaleContext,
    testMultiWriterSteadyStateConcurrencyIsDisallowed
  ].forEach((testFn) => testFn());
}

if (isDirectRun(import.meta.url)) {
  runAideConflictContractTests(starterRootDir);
  process.stdout.write("aide conflict contract tests passed\n");
}
