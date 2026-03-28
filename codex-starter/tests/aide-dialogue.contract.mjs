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

export function runAideDialogueRegressionTests(rootDir) {
  const aideSkill = readText(path.join(rootDir, ".agents", "skills", "aide", "SKILL.md"));
  const conductSkill = readText(path.join(rootDir, ".agents", "skills", "conduct", "SKILL.md"));
  const routingPolicy = readText(path.join(rootDir, ".codex", "routing-policy.md"));
  const coderAgent = readText(path.join(rootDir, ".codex", "agents", "coder.toml"));
  const testerAgent = readText(path.join(rootDir, ".codex", "agents", "tester.toml"));
  const productAssistant = readText(path.join(rootDir, ".codex", "agents", "product_assistant.toml"));
  const repoExplorer = readText(path.join(rootDir, ".codex", "agents", "repo_explorer.toml"));
  const agentsGuide = readText(path.join(rootDir, "AGENTS.md"));
  const readme = readText(path.join(rootDir, "README.md"));
  const usage = readText(path.join(rootDir, "docs", "usage.md"));
  const overview = readText(path.join(rootDir, "docs", "overview.md"));
  const detailedGuide = readText(path.join(rootDir, "docs", "detailed-guide.md"));

  const userFacingGuidance = [aideSkill, agentsGuide, readme, usage, overview].join("\n");
  const authorityGuidance = [aideSkill, conductSkill, routingPolicy, agentsGuide].join("\n");

  function testPureQaStaysInsideAide() {
    assertAll(aideSkill, [/directly answer (?:lightweight )?analysis, Q&A, discussion, and option-comparison requests/i], "pure Q&A");
    assertAll(aideSkill, [/prefer the minimum local context needed to answer well/i], "pure Q&A minimal read");
  }

  function testOptionComparisonStaysAdviceMode() {
    assertAll(aideSkill, [/answer directly when the user mainly wants understanding, tradeoff analysis, planning advice, or route recommendations/i], "option comparison");
    assertAll(routingPolicy, [/Keep (?:lightweight )?discussion, Q&A, and option-comparison work inside `Aide`/], "option comparison policy");
  }

  function testExplicitCodeFixDelegatesEarly() {
    assertAll(aideSkill, [/concrete repo-change requests are not discussion-shaped work/i, /delegate instead of doing it yourself/i], "code fix delegation");
    assertAll(routingPolicy, [/must not execute concrete repo changes itself/i, /prefer cached state plus minimal boundary evidence/i], "code fix policy");
    assertAll(coderAgent, [/Write-capable implementation specialist/i], "coder role exists");
  }

  function testExplicitNonCodeArtifactRoutesToProductAssistant() {
    assertAll(aideSkill, [/Route to `product_assistant` when the primary deliverable is a non-code artifact/i], "product route");
    assertAll(conductSkill, [/route directly to `product_assistant`/i], "conduct product route");
    assertAll(productAssistant, [/"role": "product_assistant"/], "product assistant structured role");
  }

  function testAmbiguousOwnerUsesRepoExplorerOrConduct() {
    assertAll(aideSkill, [/if ownership is obvious, assign directly/i, /if ownership or boundaries are unclear, use `repo_explorer` or `conduct`/i], "ambiguous owner");
    assertAll(conductSkill, [/use `repo_explorer` before assigning a writer when ownership or boundaries are unclear/i], "conduct ambiguous owner");
    assertAll(repoExplorer, [/Read-only repository explorer/i], "repo explorer role");
  }

  function testNewProjectConcreteTaskStillDelegatesBeforeFullScan() {
    assertAll(aideSkill, [/if repo context is missing or stale but the user already asked for a concrete repo change, do a minimal owner scan first/i], "new project delegation");
    assertAll(aideSkill, [/missing or stale repo context alone is not a reason to delay delegation/i], "new project delegation precedence");
    assertAll(routingPolicy, [/Missing or stale repo context does not override early delegation/i], "routing precedence");
  }

  function testUserAsksHowSystemWorksAllowsInternalTerms() {
    assertAll(aideSkill, [/unless the user explicitly asks how the system works/i], "internal term exception");
  }

  function testAssistantLikeToneIsSpecified() {
    assertAll(aideSkill, [/sound like a capable personal assistant/i, /avoid stiff AI phrasing/i], "assistant tone");
    assertAll(aideSkill, [/when reporting the next step, say only who acts next, what they will do, and one short reason in plain language/i], "assistant tone plain language");
    assertAll(readme, [/team secretary/i], "README secretary framing");
  }

  function testHighRiskBugfixCanEnableTesterWithoutTurningAideIntoImplementer() {
    assertAll(routingPolicy, [/enable `tester` and `coder` when explicit red\/green separation or handoff value is real/i, /enable `\/qc` when risk is high/i], "high risk bugfix");
    assertAll(authorityGuidance, [/must not execute concrete repo changes itself/i], "high risk bugfix non-implementer");
    assertAll(testerAgent, [/You own task-level validation strategy and evidence/i], "tester role exists");
  }

  function testReleaseStyleTaskUsesConductSubmitPath() {
    assertAll(routingPolicy, [/`environment setup` belongs to `conduct`/i, /`\/submit` is the governed delivery step/i], "release path");
    assertAll(readme, [/main execution roles: `tester`, `coder`, optional `\/qc`, optional `\/submit`/i], "release docs");
  }

  function testSingleSentenceTaskAvoidsJargonDump() {
    assertAll(aideSkill, [/acknowledge that task directly instead of asking a generic/i], "single sentence task");
    assertAll(userFacingGuidance, [/avoid generic "what can I help with"/i], "single sentence task guidance");
    assertAll(aideSkill, [/do not narrate your hidden workflow/i], "single sentence task no jargon");
  }

  function testCodeBackgroundAnalysisAllowsAnswerWithoutDelegation() {
    assertAll(aideSkill, [/directly answer (?:lightweight )?analysis, Q&A, discussion, and option-comparison requests/i], "code background analysis");
    assertAll(aideSkill, [/before delegation, limit yourself to the smallest evidence set needed/i], "code background minimal evidence");
  }

  function testReadHeavyInvestigationUsesRepoExplorerBeforeAideDeepRead() {
    assertAll(
      aideSkill,
      [
        /if ownership or boundaries are unclear, use `repo_explorer` or `conduct` to resolve the assignment instead of doing a deep code read as `Aide`/i,
        /when you only need ownership, entrypoint, or validation clues, prefer `repo_explorer` over broad local reading/i
      ],
      "read-heavy investigation ownership"
    );
    assertAll(
      conductSkill,
      [/use `repo_explorer` before assigning a writer when ownership or boundaries are unclear/i, /do not ask `Aide` to deep-read implementation details/i],
      "read-heavy investigation conduct boundary"
    );
    assertAll(
      routingPolicy,
      [/When ownership is unclear, prefer `repo_explorer` or `conduct` before broad local reading by `Aide`\./i],
      "read-heavy investigation policy"
    );
  }

  function testEnvironmentJudgementAndPrepBelongToConduct() {
    assertAll(aideSkill, [/hand delivery routing to `conduct` when environment setup matters/i], "environment owner aide handoff");
    assertAll(conductSkill, [/`environment setup`: `skip`, `current-workspace`, or `isolated-workspace`/i], "environment owner conduct scope");
    assertAll(routingPolicy, [/`environment setup` belongs to `conduct`/i], "environment owner policy");
    assertAll(overview, [/(?:Environment judgment and )?`environment setup` belong[s]? to `conduct`, not `\/Aide`\./i], "environment owner overview");
  }

  function testExecutionTaskChainPrefersRealSubagents() {
    assertAll(routingPolicy, [/When execution roles are active, prefer real subagents when delegation is available\./i], "real subagent policy");
    assertAll(agentsGuide, [/Prefer real subagents for .*`tester`, `coder`, `product_assistant`, `qc`, and `submit` when delegation adds value/i], "real subagent guide");
  }

  function testAnalysisReplyStaysSecretaryCoordinator() {
    assertAll(
      aideSkill,
      [/sound like a capable personal assistant/i, /`Aide` is the coordinator, not the default implementer/i, /do not read implementation files line by line just to feel informed/i],
      "analysis secretary coordinator"
    );
    assertAll(readme, [/team secretary and the team's people manager, not the default implementer/i], "analysis secretary readme");
    assertAll(overview, [/acting like a capable secretary for the user and a people manager for the team/i], "analysis secretary overview");
  }

  function testUserFacingRepliesHideInternalLabelsByDefault() {
    assertAll(aideSkill, [/never expose internal workflow terms such as `intake`, `route`, `delivery mode`, `task class`/i], "hide internal labels");
    assertAll(routingPolicy, [/Do not expose task class, delivery mode, enabled modules, or other internal workflow labels/i], "hide internal labels policy");
  }

  [
    testPureQaStaysInsideAide,
    testOptionComparisonStaysAdviceMode,
    testExplicitCodeFixDelegatesEarly,
    testExplicitNonCodeArtifactRoutesToProductAssistant,
    testAmbiguousOwnerUsesRepoExplorerOrConduct,
    testNewProjectConcreteTaskStillDelegatesBeforeFullScan,
    testUserAsksHowSystemWorksAllowsInternalTerms,
    testAssistantLikeToneIsSpecified,
    testHighRiskBugfixCanEnableTesterWithoutTurningAideIntoImplementer,
    testReleaseStyleTaskUsesConductSubmitPath,
    testSingleSentenceTaskAvoidsJargonDump,
    testCodeBackgroundAnalysisAllowsAnswerWithoutDelegation,
    testReadHeavyInvestigationUsesRepoExplorerBeforeAideDeepRead,
    testEnvironmentJudgementAndPrepBelongToConduct,
    testExecutionTaskChainPrefersRealSubagents,
    testAnalysisReplyStaysSecretaryCoordinator,
    testUserFacingRepliesHideInternalLabelsByDefault
  ].forEach((testFn) => testFn());
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  runAideDialogueRegressionTests(rootDir);
  process.stdout.write("aide dialogue regression tests passed\n");
}
