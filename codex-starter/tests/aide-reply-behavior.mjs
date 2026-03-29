import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INTERNAL_TERM_PATTERNS = [
  /\bintake\b/i,
  /\broute\b/i,
  /\brouting\b/i,
  /\bdelivery mode\b/i,
  /\btask class\b/i,
  /\bworkflow\b/i,
  /任务分类/,
  /交付模式/,
  /路由/,
  /分流/,
  /内部工作流/
];

const TEMPLATE_OPENER_PATTERNS = [
  /^(好的|收到|明白了|了解了)[，,。]?\s*(下面|以下|按流程|按步骤|我将按)/,
  /^(你好|您好)[，,。].{0,20}(下面|以下|流程|步骤)/,
  /(步骤如下|处理流程|执行流程|第1步|第一步|1\.)/
];

const ROBOTIC_TONE_PATTERNS = [
  /作为(一名)?AI(语言模型|助手)?/i,
  /根据您的请求/,
  /启动(执行)?工作流/,
  /激活.*模块/,
  /进入下一阶段/,
  /\bpipeline\b/i
];

const ROLE_PATTERN = /\b(coder|tester|conduct|product_assistant|repo_explorer)\b|开发同学|测试同学|产品同学/i;
const CODER_PATTERN = /\bcoder\b|开发同学/i;
const TESTER_PATTERN = /\btester\b|测试同学/i;
const QC_PATTERN = /(?:\/qc|\bqc\b|质量审计)/i;
const HANDOFF_PATTERN = /(交给|交由|请|让|由|安排.*接手|接手)/;
const NEXT_STEP_PATTERN = /(下一步|接下来|先|会|将).{0,24}(修复|实现|修改|补|验证|排查|起草|梳理|定位|提交|更新|编写|生成)/;
const REASON_MARKER_PATTERN = /(因为|原因是|这样可以|为了|以便)/;
const READ_HEAVY_ANALYSIS_TASK_PATTERN = /(read-heavy|深读|通读|逐行|深挖|全量扫描|大范围排查|investigation|调查根因)/i;
const REPO_EXPLORER_REPLY_PATTERN = /\brepo_explorer\b|repo explorer|仓库探索|只读子代理/i;
const PRIMARY_DEEP_DIVE_PATTERN = /我(先|会|将|打算|准备|直接).{0,24}(自己|亲自|在主线程)?.{0,24}(深读|通读|逐行|埋头|深挖|全量扫描|深度排查|从头到尾看|把仓库都看一遍|调查根因|定位根因)/;
const MEMO_STYLE_PATTERN =
  /(##?\s*(背景|现状|分析|结论|风险|计划|行动项)|\bTL;DR\b|一、|二、|三、|^\s*[-*]\s*(背景|现状|分析|结论|风险))/im;

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  const chunks = normalize(text)
    .split(/[。！？!?]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return chunks.length > 0 ? chunks : [normalize(text)];
}

function hasAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function asksSystemMechanism(userMessage) {
  return /((怎么(工作|运作|路由|分流))|(怎么做).*(route|routing|task class|delivery mode|intake|路由|分流)|系统机制|内部机制|内部流程|为什么.*(task class|delivery mode|route|intake)|解释.*(路由|分流|task class|delivery mode|intake))/i.test(
    userMessage
  );
}

function isExplicitImplementationTask(userMessage) {
  return /(修复|实现|新增|改|重构|补.*测试|写.*代码|提交代码|bug|接口|函数|脚本|页面|接口)/i.test(userMessage);
}

function isSingleSentenceTask(userMessage) {
  return splitSentences(userMessage).length === 1;
}

function isReadHeavyAnalysisTask(userMessage) {
  return READ_HEAVY_ANALYSIS_TASK_PATTERN.test(userMessage);
}

function reasonIsShort(reply) {
  const match = reply.match(REASON_MARKER_PATTERN);
  if (!match) {
    return false;
  }
  const start = (match.index ?? 0) + match[0].length;
  const rest = reply.slice(start);
  const reason = rest.split(/[。！？!?，,]/)[0].trim();
  return reason.length > 0 && reason.length <= 24;
}

function isSelfImplementing(reply) {
  return /我(来|会|将|直接).{0,10}(改|修改|修复|实现|写|提交|重构|补(上)?测试|补单测)/.test(reply);
}

function soundsLikePrimaryDeepDive(reply) {
  return PRIMARY_DEEP_DIVE_PATTERN.test(reply);
}

export function validateAideVisibleReply({ userMessage, reply }) {
  const normalizedUserMessage = normalize(userMessage);
  const normalizedReply = normalize(reply);
  const errors = [];

  const mechanismAsked = asksSystemMechanism(normalizedUserMessage);
  const explicitImplementation = isExplicitImplementationTask(normalizedUserMessage);
  const readHeavyAnalysisTask = isReadHeavyAnalysisTask(normalizedUserMessage);
  const singleSentenceTask = isSingleSentenceTask(normalizedUserMessage);
  const sentenceCount = splitSentences(normalizedReply).length;
  const mentionsCoder = CODER_PATTERN.test(normalizedReply);
  const mentionsTester = TESTER_PATTERN.test(normalizedReply);

  if (!mechanismAsked && hasAnyPattern(normalizedReply, INTERNAL_TERM_PATTERNS)) {
    errors.push("internal_terms_not_allowed");
  }

  if (!(ROLE_PATTERN.test(normalizedReply) && HANDOFF_PATTERN.test(normalizedReply))) {
    errors.push("missing_owner_handoff");
  }
  if (!NEXT_STEP_PATTERN.test(normalizedReply)) {
    errors.push("missing_next_step");
  }
  if (!REASON_MARKER_PATTERN.test(normalizedReply) || !reasonIsShort(normalizedReply)) {
    errors.push("missing_short_reason");
  }

  if (sentenceCount > 2 || /(步骤如下|处理流程|执行流程|(^|\n)\s*(\d+[.)]|[-*])\s+)/m.test(normalizedReply)) {
    errors.push("not_compact_handoff_reply");
  }

  if (explicitImplementation && isSelfImplementing(normalizedReply)) {
    errors.push("aide_should_not_self_implement");
  }

  if (explicitImplementation && mentionsCoder && !mentionsTester) {
    errors.push("coder_requires_tester_handoff");
  }

  if (explicitImplementation && QC_PATTERN.test(normalizedReply) && !mentionsTester) {
    errors.push("qc_cannot_replace_tester");
  }

  if (!mechanismAsked && soundsLikePrimaryDeepDive(normalizedReply)) {
    errors.push("analysis_reply_should_stay_secretary_coordinator");
  }

  if (readHeavyAnalysisTask && !REPO_EXPLORER_REPLY_PATTERN.test(normalizedReply)) {
    errors.push("read_heavy_analysis_should_handoff_to_repo_explorer");
  }

  if (readHeavyAnalysisTask && (sentenceCount > 2 || MEMO_STYLE_PATTERN.test(normalizedReply))) {
    errors.push("read_heavy_analysis_should_avoid_memo_style");
  }

  if (singleSentenceTask && hasAnyPattern(normalizedReply, TEMPLATE_OPENER_PATTERNS)) {
    errors.push("template_opening_not_allowed_for_single_sentence_task");
  }

  if (!/[\u4e00-\u9fff]/.test(normalizedReply) || hasAnyPattern(normalizedReply, ROBOTIC_TONE_PATTERNS)) {
    errors.push("robotic_or_non_assistant_tone");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function assertFixture(fixture) {
  const result = validateAideVisibleReply({
    userMessage: fixture.userMessage,
    reply: fixture.reply
  });

  assert.equal(
    result.ok,
    fixture.expectPass,
    `${fixture.id} expected pass=${fixture.expectPass} but got pass=${result.ok}; errors=${result.errors.join(",")}`
  );

  if (fixture.expectErrors) {
    fixture.expectErrors.forEach((errorCode) => {
      assert.ok(
        result.errors.includes(errorCode),
        `${fixture.id} should include error ${errorCode}, got [${result.errors.join(", ")}]`
      );
    });
  }
}

export function runAideReplyBehaviorTests() {
  const fixtures = [
    {
      id: "pass-default-no-internal-terms",
      userMessage: "把登录超时的 bug 修一下，并补一个回归测试。",
      reply: "由 coder 先改、tester 接着验证，下一步先修复登录超时并补回归测试，因为这是代码实现任务。",
      expectPass: true
    },
    {
      id: "fail-default-leaks-internal-workflow-terms",
      userMessage: "把登录超时的 bug 修一下。",
      reply: "我会先做 intake 和 route，再按 delivery mode 交给 coder。",
      expectPass: false,
      expectErrors: ["internal_terms_not_allowed", "missing_next_step", "missing_short_reason"]
    },
    {
      id: "pass-only-owner-next-step-short-reason",
      userMessage: "新增一个导出 CSV 的接口。",
      reply: "由 coder 实现、tester 复核，下一步实现导出 CSV 接口，因为这样交接完整。",
      expectPass: true
    },
    {
      id: "fail-missing-short-reason",
      userMessage: "新增一个导出 CSV 的接口。",
      reply: "由 coder 接手，下一步实现导出 CSV 接口。",
      expectPass: false,
      expectErrors: ["missing_short_reason"]
    },
    {
      id: "fail-explicit-implementation-self-implement",
      userMessage: "请修复结算页空指针。",
      reply: "我来直接改这个 bug，改完给你结果，因为我已经知道位置。",
      expectPass: false,
      expectErrors: ["aide_should_not_self_implement"]
    },
    {
      id: "fail-single-sentence-task-template-opener",
      userMessage: "把首页标题改成 Dashboard。",
      reply: "好的，收到你的需求，下面按流程处理：1. 归类任务；2. 路由到 coder；3. 进入交付阶段。",
      expectPass: false,
      expectErrors: ["template_opening_not_allowed_for_single_sentence_task"]
    },
    {
      id: "pass-system-mechanism-question-allows-internal-terms",
      userMessage: "你们系统内部怎么做 route 和 task class？",
      reply: "这类问题我会先做 intake，再按 task class route 给 coder，下一步由 coder 实现，因为这样分工更稳。",
      expectPass: true
    },
    {
      id: "pass-chinese-assistant-tone",
      userMessage: "补上登录接口的单测。",
      reply: "由 coder 实现后交 tester 验证，下一步补上登录接口单测，因为这样能先挡住回归。",
      expectPass: true
    },
    {
      id: "fail-robotic-process-tone",
      userMessage: "补上登录接口的单测。",
      reply: "作为 AI 助手，我将启动执行工作流并激活 implementation 模块，随后进入下一阶段。",
      expectPass: false,
      expectErrors: ["robotic_or_non_assistant_tone"]
    },
    {
      id: "pass-read-heavy-analysis-delegates-to-repo-explorer",
      userMessage: "先做一轮 read-heavy 调研，找登录回调偶发超时根因，不急着改代码。",
      reply: "我会请 repo_explorer 接手，下一步做 read-heavy 排查并标出边界，因为这样主线程更干净。",
      expectPass: true
    },
    {
      id: "fail-read-heavy-analysis-aide-self-deep-dive",
      userMessage: "先做一轮 read-heavy 调研，找登录回调偶发超时根因，不急着改代码。",
      reply: "我会自己先通读仓库并逐行排查登录链路，下一步列出可疑点，因为我要先把细节摸透。",
      expectPass: false,
      expectErrors: [
        "analysis_reply_should_stay_secretary_coordinator",
        "read_heavy_analysis_should_handoff_to_repo_explorer"
      ]
    },
    {
      id: "fail-coder-mentioned-without-tester-handoff",
      userMessage: "修一下支付接口重试逻辑并补测试。",
      reply: "我会请 coder 接手，下一步修复重试逻辑并补测试，因为这块改动很集中。",
      expectPass: false,
      expectErrors: ["coder_requires_tester_handoff"]
    },
    {
      id: "fail-read-heavy-analysis-memo-style",
      userMessage: "先做 read-heavy 调研，定位回调超时根因，不要改代码。",
      reply: "## 背景\n## 分析\n我会请 repo_explorer 接手并整理多个章节，下一步分三部分输出证据，因为这样更完整。",
      expectPass: false,
      expectErrors: ["read_heavy_analysis_should_avoid_memo_style"]
    }
  ];

  fixtures.forEach(assertFixture);
  return fixtures.length;
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  const count = runAideReplyBehaviorTests();
  process.stdout.write(`aide reply behavior tests passed (${count} fixtures)\n`);
}
