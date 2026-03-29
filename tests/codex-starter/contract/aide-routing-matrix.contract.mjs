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

export function runAideRoutingMatrixContractTests(rootDir) {
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

  const scenarioMatrix = [
    {
      id: "discussion-qna-aide-only",
      authorityPatterns: [
        /for (?:lightweight )?advice, Q&A, analysis, and option comparison, keep only `Aide` active(?: unless the task later turns into delivery)?/i,
        /Keep (?:lightweight )?discussion, Q&A, and option-comparison work inside `Aide` when the user is not asking for a durable artifact or an execution workflow\./i
      ],
      docsPatterns: [
        /\|\s*discussion \/ Q&A\s*\|\s*`Aide`\s*direct\s*\|/i,
        /\|\s*discussion \/ Q&A\s*\|\s*`Aide`\s*直接处理\s*\|/i,
        /execution roles stay disabled by default|默认不启用执行角色/i
      ]
    },
    {
      id: "small-clear-repo-change-single-writer-first",
      authorityPatterns: [
        /for a clear small repo change, activate one clear execution role first; usually `coder` for code, config, script, or test work, or `product_assistant` for non-code artifacts/i,
        /For a clear small repo change, activate one clear execution role first instead of waking multiple roles\./i,
        /if ownership is obvious, assign directly to `coder`, `tester`, or `product_assistant` instead of doing another round of local implementation analysis yourself/i,
        /Any route that activates `coder` must include a downstream `tester` handoff before the task can settle or submit\./i
      ],
      docsPatterns: [
        /\|\s*small bugfix\s*\|\s*`Aide -> coder -> tester -> (?:optional qc -> )?submit`\s*\|/i,
        /\|\s*小 bugfix\s*\|\s*`Aide -> coder -> tester -> (?:optional qc -> )?submit`\s*\|/i,
        /`Aide` should activate one clear execution role first when the task is already concrete|如果任务已经很具体，`Aide` 应先激活一个明确的执行角色/i
      ]
    },
    {
      id: "higher-risk-bugfix-tester-coder-qc-gating",
      authorityPatterns: [
        /enable `coder` for implementation ownership, and always enable downstream `tester` when `coder` is active/i,
        /enable `\/qc` when risk is high, the user asks for an audit, or release confidence needs it/i,
        /If `coder` is active, keep `tester` active in the same delivery chain as a required downstream handoff\./i,
        /Activate `\/qc` only when risk is high or explicit audit confidence is needed; `\/qc` does not replace `tester`\./i
      ],
      docsPatterns: [
        /\|\s*higher-risk bugfix\s*\|\s*`Aide -> tester -> coder -> tester -> optional qc -> submit`\s*\|/i,
        /\|\s*较高风险 bugfix\s*\|\s*`Aide -> tester -> coder -> tester -> optional qc -> submit`\s*\|/i,
        /For non-trivial behavior changes, `tester` owns task-level validation handoff|对非平凡行为改动，`tester` 负责任务级验证 handoff/i
      ]
    },
    {
      id: "feature-route-keeps-coder-to-tester-handoff",
      authorityPatterns: [
        /Any route that activates `coder` must include a downstream `tester` handoff before the task can settle or submit\./i,
        /`\/qc` is decided by task risk and audit need only, and `\/qc` cannot replace the required `tester` handoff after `coder`\./i
      ],
      docsPatterns: [
        /\|\s*feature\s*\|\s*`Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> tester -> optional qc -> submit`\s*\|/i,
        /\|\s*feature\s*\|\s*`Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> tester -> optional qc -> submit`\s*\|/i
      ]
    },
    {
      id: "product-artifact-routes-to-product-assistant",
      authorityPatterns: [
        /Route to `product_assistant` when the primary deliverable is a non-code artifact\./i,
        /Route directly to `product_assistant` when the primary deliverable is a non-code artifact\./i,
        /route directly to `product_assistant` when the primary deliverable is a non-code artifact/i
      ],
      docsPatterns: [
        /\|\s*product\s*\|\s*`Aide -> product_assistant`\s*\|/i,
        /For product tasks:[\s\S]*`Aide` routes to `product_assistant`[\s\S]*`tester`, `qc`, and `submit` are normally not involved/i,
        /对 product 任务：[\s\S]*`Aide` 路由到 `product_assistant`[\s\S]*一般不会启用 `tester`、`qc`、`submit`/i
      ]
    },
    {
      id: "release-governed-delivery-conduct-and-submit",
      authorityPatterns: [
        /`environment setup` belongs to `conduct`/i,
        /activate `conduct` when environment setup(?: decisions\/preparation)?, conflict checks, (?:route composition|or multi-role delivery routing|multi-role delivery routing actually matter|or longer delivery planning actually matter)/i,
        /activate `\/submit` only when governed delivery or commit\/push follow-through matters/i,
        /`\/submit` is the governed delivery step after local completion or QC pass when commit, push, or post-push follow-through matters\./i
      ],
      docsPatterns: [
        /\|\s*release\s*\|\s*`Aide -> conduct -> optional qc -> submit`\s*\|/i,
        /release or governed delivery work|release \/ governed delivery|受控交付/i,
        /coding-line work is ready for governed delivery|coding 线任务需要进入受控交付/i
      ]
    },
    {
      id: "new-repo-concrete-change-minimal-triage-then-delegate",
      authorityPatterns: [
        /Missing or stale repo context does not override early delegation for a clearly scoped implementation task; use minimal triage first, then delegate\./i,
        /if repo context is missing or stale but the user already asked for a concrete repo change, do a minimal owner scan first and delegate as soon as the next owner is clear/i,
        /reserve a full scan for explicit repo-wide assessment, unclear ownership after minimal triage, or genuinely high-risk changes whose boundaries are still unknown/i,
        /Use a full scan before delegation only when the user explicitly asked for repo-wide assessment, ownership is still unclear after minimal triage, or change boundaries remain high-risk and unknown\./i
      ],
      docsPatterns: [
        /On a concrete repo-change task, missing context should trigger only the minimum owner scan needed for delegation first; a full scan is for repo-wide assessment, unresolved ownership, or genuinely unknown high-risk boundaries\./i,
        /a concrete repo-change request should usually start with a minimal owner scan, then delegate as soon as the next owner is clear/i,
        /not an automatic full scan or a whole-team wake-up|而不是自动 full scan 或默认把整支团队都拉起来/i,
        /New repo state or thin context alone is not a reason to activate `tester`, `architect`, `qc`, or other extra roles/i
      ]
    },
    {
      id: "read-heavy-investigation-prefers-repo-explorer",
      authorityPatterns: [
        /if ownership or boundaries are unclear, use `repo_explorer` or `conduct` to resolve the assignment instead of doing a deep code read as `Aide`/i,
        /do not ask `Aide` to deep-read implementation details that the eventual writer will need to read again unless the routing decision truly depends on that evidence/i,
        /When ownership is unclear, prefer `repo_explorer` or `conduct` before broad local reading by `Aide`\./i
      ],
      docsPatterns: [
        /for read-heavy analysis, default to a short-lived `repo_explorer` read and then close the user reply as `Aide`/i,
        /For read-heavy analysis, default to a short-lived `repo_explorer` pass and let `Aide` synthesize the final response\./i,
        /for read-heavy analysis, prefer a short-lived `repo_explorer` pass and keep `Aide` as the final user-facing responder/i
      ]
    },
    {
      id: "environment-judgement-and-setup-owned-by-conduct",
      authorityPatterns: [
        /`environment setup` belongs to `conduct`/i,
        /activate `conduct` when environment setup(?: decisions\/preparation)?, conflict checks, (?:route composition|or multi-role delivery routing|multi-role delivery routing actually matter|or longer delivery planning actually matter)/i,
        /`environment setup`: `skip`, `current-workspace`, or `isolated-workspace`/i
      ],
      docsPatterns: [
        /(?:Environment judgment and )?`environment setup` belong[s]? to `conduct`, not `\/Aide`\./i,
        /`environment setup` 属于 `conduct`，不属于 `\/Aide`。/i,
        /`conduct` applies the active delivery route when environment judgment or setup, module activation, or longer execution planning matters\./i
      ]
    },
    {
      id: "new-task-chain-prefers-real-subagents",
      authorityPatterns: [
        /When execution roles are active, prefer real subagents when delegation is available\./i,
        /Prefer real subagents for .*`tester`, `coder`, `product_assistant`, `qc`, and `submit` when delegation adds value/i
      ],
      docsPatterns: [
        /for new task chains, prefer real subagents when delegation is available to reduce main-thread context pollution/i,
        /For new task chains, prefer real subagents when delegation is available so the main thread stays focused on coordination and user communication\./i,
        /prefer real subagents for new task chains when available/i
      ]
    },
    {
      id: "analysis-replies-stay-secretary-coordinator",
      authorityPatterns: [
        /sound like a capable personal assistant who understands the work context, not like a workflow engine explaining its internals/i,
        /`Aide` is the coordinator, not the default implementer/i,
        /do not read implementation files line by line just to feel informed when the task is clearly headed to `coder` or `tester`/i
      ],
      docsPatterns: [
        /secretary-style coordination and closeout rather than acting as the primary deep-dive troubleshooter/i,
        /`Aide` is intended to act like the user's team secretary and the team's people manager, not the default implementer(?: or primary deep-dive troubleshooter)?\./i,
        /acting like a capable secretary for the user and a people manager for the team/i
      ]
    },
    {
      id: "narrowed-task-drops-extra-roles",
      authorityPatterns: [
        /when the task narrows or uncertainty is resolved, drop roles that are no longer needed instead of keeping the whole team active/i,
        /When the task narrows or uncertainty is resolved, drop roles that are no longer needed instead of keeping the whole team active\./i,
        /extra roles should be activated only when they add real routing, validation, audit, or delivery value, then dropped again when no longer needed/i
      ],
      docsPatterns: [
        /drop extra roles again when they are no longer needed|drop them again when the task narrows/i,
        /extra roles should be dropped again once the task no longer needs them|当任务收窄或风险解除后，额外角色应及时退出/i,
        /任务收窄后再把多余角色收回去/i
      ]
    }
  ];

  scenarioMatrix.forEach((scenario) => {
    assertAll(authority, scenario.authorityPatterns, `${scenario.id} authority`);
    assertAll(docs, scenario.docsPatterns, `${scenario.id} docs`);
  });
}

if (isDirectRun(import.meta.url)) {
  runAideRoutingMatrixContractTests(starterRootDir);
  process.stdout.write("aide routing matrix contract tests passed\n");
}
