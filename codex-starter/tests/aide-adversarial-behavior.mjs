import assert from "node:assert/strict";

const ISSUE_CODES = {
  INTERNAL_WORKFLOW_LEAK: "internal-workflow-leak",
  FLOW_MACHINE_STATUS_DUMP: "flow-machine-status-dump",
  FULL_REPO_READ_FIRST: "full-repo-read-first",
  FULL_SCAN_BEFORE_DELEGATION: "full-scan-before-delegation",
  KEEPS_ALL_ROLES_AFTER_NARROWING: "keeps-all-roles-after-narrowing"
};

const INTERNAL_WORKFLOW_TERMS = [
  { label: "task class", pattern: /\btask class\b|任务分类/i },
  { label: "delivery mode", pattern: /\bdelivery mode\b|交付模式/i },
  { label: "module", pattern: /\benabled modules?\b|模块状态|已启用模块/i },
  { label: "governance", pattern: /\bgovernance\b|治理流程/i },
  { label: "intake", pattern: /\bintake\b|受理阶段|入口分流/i },
  { label: "route", pattern: /\broute\b|路由决策|路由状态/i }
];

const MACHINE_STYLE_LINE = /^(?:[-*]|\d+\.)\s*(?:status|状态|phase|阶段|step|步骤|queue|队列|handoff|执行者|进度)\b/i;
const STATUS_INLINE = /(?:status|状态)\s*[:：]/i;
const MACHINE_TEMPLATES = [
  /\bstatus\s*[:：]/gi,
  /状态\s*[:：]/g,
  /\bphase\b/gi,
  /步骤\s*[一二三四五六七八九十\d]/g,
  /\bqueue\b/gi,
  /\bhandoff\b/gi,
  /状态播报|进度播报/g
];

const FULL_REPO_READ_FIRST_PATTERNS = [
  /(?:先|first).{0,24}(?:读|看|扫描|read|scan).{0,24}(?:整个|整個|全量|全部|whole|entire).{0,18}(?:仓库|repo|repository)/i,
  /(?:先|first).{0,24}(?:整个|整個|全量|全部|whole|entire).{0,18}(?:仓库|repo|repository).{0,24}(?:读|看|扫描|read|scan)/i,
  /(?:before|再).{0,20}(?:开始|动手|implement|code).{0,20}(?:读完|看完|read|scan).{0,20}(?:whole|entire|整个).{0,12}(?:repo|repository|仓库)/i
];

const FULL_SCAN_BEFORE_DELEGATION_PATTERNS = [
  /(?:先|first).{0,20}(?:full scan|全量扫描|完整扫描|全面扫描).{0,36}(?:再|then|before).{0,20}(?:委派|分派|delegat)/i,
  /(?:full scan|全量扫描|完整扫描).{0,36}(?:decide|determine|判断|决定).{0,20}(?:委派|分派|delegat)/i
];

const ROLE_PATTERNS = {
  tester: /(?:\btester\b|测试角色|测试代理)/i,
  coder: /(?:\bcoder\b|开发角色|编码代理)/i,
  qc: /(?:\/qc|\bqc\b|质量审计|审计角色)/i
};

const KEEP_ALL_ROLES_SIGNAL =
  /(?:all|全部|都).{0,10}(?:active|enabled|在线|挂着|保留|不退)|(?:先不退|先别退|暂不退)/i;

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function findInternalWorkflowLeaks(reply) {
  return INTERNAL_WORKFLOW_TERMS.filter((item) => item.pattern.test(reply)).map((item) => item.label);
}

function looksLikeFlowMachineStatusDump(reply) {
  const lines = reply
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const templatedLines = lines.filter((line) => MACHINE_STYLE_LINE.test(line) || STATUS_INLINE.test(line)).length;
  const repetitiveTemplateHits = MACHINE_TEMPLATES.reduce((sum, pattern) => sum + countMatches(reply, pattern), 0);
  return templatedLines >= 4 || (templatedLines >= 3 && repetitiveTemplateHits >= 6);
}

function mentionsFullRepoReadFirst(reply) {
  return FULL_REPO_READ_FIRST_PATTERNS.some((pattern) => pattern.test(reply));
}

function mentionsFullScanBeforeDelegation(reply) {
  return FULL_SCAN_BEFORE_DELEGATION_PATTERNS.some((pattern) => pattern.test(reply));
}

function keepsTesterCoderQcTogether(reply) {
  const hasTester = ROLE_PATTERNS.tester.test(reply);
  const hasCoder = ROLE_PATTERNS.coder.test(reply);
  const hasQc = ROLE_PATTERNS.qc.test(reply);
  return hasTester && hasCoder && hasQc && KEEP_ALL_ROLES_SIGNAL.test(reply);
}

function validateAideResponse({ reply, context = {} }) {
  const issues = [];
  const isLongReply = Boolean(context.isLongReply) || reply.length >= 280;
  const explicitWorkflowQuestion = Boolean(context.explicitWorkflowQuestion);

  if (isLongReply && !explicitWorkflowQuestion) {
    const leakedTerms = findInternalWorkflowLeaks(reply);
    if (leakedTerms.length > 0) {
      issues.push({
        code: ISSUE_CODES.INTERNAL_WORKFLOW_LEAK,
        message: `long reply leaked internal workflow terms: ${leakedTerms.join(", ")}`
      });
    }
  }

  if (isLongReply && looksLikeFlowMachineStatusDump(reply)) {
    issues.push({
      code: ISSUE_CODES.FLOW_MACHINE_STATUS_DUMP,
      message: "long reply sounds like templated process status broadcast"
    });
  }

  if (context.explicitCodeTask && mentionsFullRepoReadFirst(reply)) {
    issues.push({
      code: ISSUE_CODES.FULL_REPO_READ_FIRST,
      message: "explicit code task should not start with full-repo read"
    });
  }

  if ((context.contextState === "new" || context.contextState === "stale") && mentionsFullScanBeforeDelegation(reply)) {
    issues.push({
      code: ISSUE_CODES.FULL_SCAN_BEFORE_DELEGATION,
      message: "new/stale context should not force full scan before delegation choice"
    });
  }

  if (context.taskNarrowed && keepsTesterCoderQcTogether(reply)) {
    issues.push({
      code: ISSUE_CODES.KEEPS_ALL_ROLES_AFTER_NARROWING,
      message: "narrowed task should not keep tester/coder/qc all active"
    });
  }

  return issues;
}

function assertExpectedFailure(testCase) {
  const issues = validateAideResponse(testCase);
  assert.ok(
    issues.length > 0,
    `${testCase.id} should fail but passed\nreply:\n${testCase.reply}\nissues:${JSON.stringify(issues, null, 2)}`
  );
  assert.ok(
    issues.some((issue) => issue.code === testCase.expectedCode),
    `${testCase.id} should include issue ${testCase.expectedCode}\nactual issues: ${issues
      .map((issue) => issue.code)
      .join(", ")}`
  );
}

function assertExpectedPass(testCase) {
  const issues = validateAideResponse(testCase);
  assert.equal(
    issues.length,
    0,
    `${testCase.id} should pass but failed\nreply:\n${testCase.reply}\nissues:${JSON.stringify(issues, null, 2)}`
  );
}

const negativeCases = [
  {
    id: "long-reply-leaks-internal-terms",
    context: { isLongReply: true },
    expectedCode: ISSUE_CODES.INTERNAL_WORKFLOW_LEAK,
    reply: [
      "Boss，下面是我的完整执行说明：我已经完成 intake，并把 task class 设成 bugfix。",
      "这次 delivery mode 会走 long-running，先同步 governance 再更新 route，避免你看到不一致结果。",
      "当前 enabled modules 包含 tester、coder、qc 与 submit，我会按这条内部分流顺序推进。",
      "我会持续报告每一步内部字段，直到所有模块状态都变成 done。"
    ].join("\n")
  },
  {
    id: "long-reply-looks-like-flow-machine",
    context: { isLongReply: true },
    expectedCode: ISSUE_CODES.FLOW_MACHINE_STATUS_DUMP,
    reply: [
      "状态播报：",
      "1. Status: accepted",
      "2. Status: triage_done",
      "3. Phase: planning",
      "4. Queue: writer_pending",
      "5. Handoff: queued",
      "6. Status: waiting_ack",
      "下一步：等待下一次状态轮询。"
    ].join("\n")
  },
  {
    id: "explicit-code-task-says-read-entire-repo-first",
    context: { explicitCodeTask: true },
    expectedCode: ISSUE_CODES.FULL_REPO_READ_FIRST,
    reply: "这是明确代码任务，但我会先把整个仓库从头到尾读一遍再开始改。"
  },
  {
    id: "stale-context-says-full-scan-before-delegation",
    context: { contextState: "stale" },
    expectedCode: ISSUE_CODES.FULL_SCAN_BEFORE_DELEGATION,
    reply: "现在上下文是 stale，我先 full scan，再决定是否委派给 coder。"
  },
  {
    id: "task-narrowed-keeps-tester-coder-qc",
    context: { taskNarrowed: true },
    expectedCode: ISSUE_CODES.KEEPS_ALL_ROLES_AFTER_NARROWING,
    reply: "范围已经收窄，但 tester、coder、/qc 我先都挂着，先不退，避免后续再拉起。"
  }
];

const positiveCases = [
  {
    id: "long-reply-natural-without-internal-jargon",
    context: { isLongReply: true },
    reply: [
      "Boss，我先把当前目标复述成一句话：修复登录接口在空 token 下报错。",
      "我会先确认触发路径和受影响文件，然后把改动交给实现角色，最后做一轮最小验证，确保行为回归稳定。",
      "你会收到三类信息：已确认的问题、已完成的改动、下一步需要你拍板的点。"
    ].join("\n")
  },
  {
    id: "explicit-code-task-uses-minimal-scan-then-delegate",
    context: { explicitCodeTask: true },
    reply: "这是明确代码任务。我先确认目标文件和失败测试的边界，然后尽快委派给 coder 实现。"
  },
  {
    id: "new-context-minimal-owner-scan-not-full-scan",
    context: { contextState: "new" },
    reply: "仓库是新上下文，我先做最小 owner scan 看改动边界，再直接委派给 coder。"
  },
  {
    id: "task-narrowed-drops-extra-roles",
    context: { taskNarrowed: true },
    reply: "任务已收窄到小修复，tester 和 /qc 退出，仅保留 coder。"
  },
  {
    id: "workflow-terms-allowed-when-user-explicitly-asks",
    context: { isLongReply: true, explicitWorkflowQuestion: true },
    reply: "你在问系统如何工作：intake 负责入口整理，route 负责分派，governance 负责策略约束。"
  }
];

export function runAideAdversarialBehaviorTests() {
  negativeCases.forEach(assertExpectedFailure);
  positiveCases.forEach(assertExpectedPass);
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  runAideAdversarialBehaviorTests();
  process.stdout.write(
    `aide adversarial behavior tests passed (${negativeCases.length} negative + ${positiveCases.length} positive)\n`
  );
}
