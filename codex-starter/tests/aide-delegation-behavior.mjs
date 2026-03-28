import assert from "node:assert/strict";

const KNOWN_ROLES = new Set([
  "aide",
  "coder",
  "tester",
  "qc",
  "submit",
  "conduct",
  "product_assistant",
  "repo_explorer",
  "architect",
  "plan",
  "prd"
]);

const EXECUTION_ROLES = new Set(
  [...KNOWN_ROLES].filter((role) => role !== "aide")
);

const DELIVERY_MODES = new Set(["discussion", "delivery"]);
const NEXT_TYPES = new Set(["answer", "delegate", "triage_then_delegate"]);
const TRIAGE_LEVELS = new Set(["none", "minimal", "full"]);
const GATE_LEVELS = new Set(["off", "optional", "required"]);
const REPO_CONTEXTS = new Set(["fresh", "new", "stale"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function assertUniqueArray(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.equal(new Set(value).size, value.length, `${label} must not contain duplicates`);
}

function assertSameMembers(actual, expected, label) {
  assert.deepEqual(
    [...new Set(actual)].sort(),
    [...new Set(expected)].sort(),
    `${label} members mismatch`
  );
}

function assertIncludesAll(actual, expected, label) {
  const actualSet = new Set(actual);
  expected.forEach((value) => {
    assert.ok(actualSet.has(value), `${label} missing ${value}`);
  });
}

function executionRoles(decision) {
  return decision.activeRoles.filter((role) => role !== "aide");
}

function validateDecisionShape(fixture) {
  assertNonEmptyString(fixture.id, "fixture.id");
  assertNonEmptyString(fixture.input.userTask, `${fixture.id}: input.userTask`);

  const context = fixture.input.context;
  const decision = fixture.decision;

  assert.ok(context && typeof context === "object", `${fixture.id}: input.context must be an object`);
  assert.ok(decision && typeof decision === "object", `${fixture.id}: decision must be an object`);

  assert.ok(DELIVERY_MODES.has(decision.mode), `${fixture.id}: invalid decision.mode`);
  assertUniqueArray(decision.activeRoles, `${fixture.id}: decision.activeRoles`);
  assertUniqueArray(decision.droppedRoles, `${fixture.id}: decision.droppedRoles`);
  assert.ok(decision.activeRoles.includes("aide"), `${fixture.id}: activeRoles must include aide`);

  decision.activeRoles.forEach((role) => {
    assert.ok(KNOWN_ROLES.has(role), `${fixture.id}: unknown active role ${role}`);
  });
  decision.droppedRoles.forEach((role) => {
    assert.ok(KNOWN_ROLES.has(role), `${fixture.id}: unknown dropped role ${role}`);
    assert.ok(!decision.activeRoles.includes(role), `${fixture.id}: dropped role still active: ${role}`);
  });

  assert.ok(NEXT_TYPES.has(decision.next.type), `${fixture.id}: invalid decision.next.type`);
  assert.ok(KNOWN_ROLES.has(decision.next.owner), `${fixture.id}: invalid decision.next.owner`);
  assert.ok(
    decision.activeRoles.includes(decision.next.owner),
    `${fixture.id}: decision.next.owner must be in activeRoles`
  );
  assertNonEmptyString(decision.next.reason, `${fixture.id}: decision.next.reason`);

  assert.ok(TRIAGE_LEVELS.has(decision.triage.level), `${fixture.id}: invalid triage.level`);
  assert.equal(
    typeof decision.triage.blocksDelegation,
    "boolean",
    `${fixture.id}: triage.blocksDelegation must be boolean`
  );
  if (decision.triage.level === "none") {
    assert.equal(decision.triage.blocksDelegation, false, `${fixture.id}: none triage cannot block`);
  }
  if (decision.triage.level === "minimal") {
    assert.equal(
      decision.triage.blocksDelegation,
      false,
      `${fixture.id}: minimal triage should not block delegation`
    );
  }
  if (decision.triage.level === "full") {
    assert.equal(
      decision.triage.blocksDelegation,
      true,
      `${fixture.id}: full triage should block until completed`
    );
  }
  if (decision.next.type === "triage_then_delegate") {
    assert.notEqual(decision.triage.level, "none", `${fixture.id}: triage_then_delegate needs triage`);
  }
  if (decision.next.type === "answer") {
    assert.equal(decision.next.owner, "aide", `${fixture.id}: answer must stay in aide`);
  }

  assert.ok(GATE_LEVELS.has(decision.gates.qc), `${fixture.id}: invalid gates.qc`);
  assert.ok(GATE_LEVELS.has(decision.gates.submit), `${fixture.id}: invalid gates.submit`);
  if (decision.gates.qc !== "off") {
    assert.ok(decision.activeRoles.includes("qc"), `${fixture.id}: qc gate requires qc active`);
  }
  if (decision.gates.submit !== "off") {
    assert.ok(decision.activeRoles.includes("submit"), `${fixture.id}: submit gate requires submit active`);
  }
  if (decision.activeRoles.includes("qc")) {
    assert.notEqual(decision.gates.qc, "off", `${fixture.id}: qc cannot be active with qc gate off`);
  }
  if (decision.activeRoles.includes("submit")) {
    assert.notEqual(
      decision.gates.submit,
      "off",
      `${fixture.id}: submit cannot be active with submit gate off`
    );
  }

  assert.ok(Array.isArray(decision.route), `${fixture.id}: decision.route must be an array`);
  assert.ok(decision.route.length > 0, `${fixture.id}: decision.route must not be empty`);
  decision.route.forEach((step, index) => {
    assert.ok(step && typeof step === "object", `${fixture.id}: route[${index}] must be object`);
    assert.ok(KNOWN_ROLES.has(step.owner), `${fixture.id}: route[${index}] has unknown owner ${step.owner}`);
    assert.ok(
      decision.activeRoles.includes(step.owner),
      `${fixture.id}: route[${index}] owner ${step.owner} must be active`
    );
    assertNonEmptyString(step.action, `${fixture.id}: route[${index}].action`);
    if (index === 0) {
      assert.equal(step.owner, "aide", `${fixture.id}: route must start with aide`);
    }
  });

  assert.ok(REPO_CONTEXTS.has(context.repoContext), `${fixture.id}: invalid context.repoContext`);
  assert.equal(
    typeof context.concreteChange,
    "boolean",
    `${fixture.id}: context.concreteChange must be boolean`
  );
  assert.ok(["low", "medium", "high"].includes(context.risk), `${fixture.id}: invalid context.risk`);

  if (context.concreteChange && (context.repoContext === "new" || context.repoContext === "stale")) {
    assert.notEqual(
      decision.triage.level,
      "full",
      `${fixture.id}: concrete change in new/stale repo should not force a full scan`
    );
  }

  if (decision.activeRoles.includes("conduct")) {
    assert.ok(
      context.needsEnvironmentSetup || context.governedDelivery || context.routeComplexity === "high",
      `${fixture.id}: conduct should only activate for setup/planning/governed-delivery needs`
    );
  }

  if (decision.activeRoles.includes("submit") || decision.gates.submit === "required") {
    assert.ok(
      context.governedDelivery || context.requiresCommitPush,
      `${fixture.id}: submit should require governed delivery or commit/push follow-through`
    );
  }

  if (decision.activeRoles.includes("qc") || decision.gates.qc === "required") {
    assert.ok(
      context.risk === "high" || context.auditRequested === true,
      `${fixture.id}: qc should require high risk or explicit audit need`
    );
  }

  if (Array.isArray(context.previouslyActiveRoles)) {
    const previous = new Set(context.previouslyActiveRoles);
    decision.droppedRoles.forEach((role) => {
      assert.ok(previous.has(role), `${fixture.id}: dropped role ${role} not found in previous roles`);
    });
  }
}

function verifyDiscussionAideOnly(fixture) {
  const { id, decision } = fixture;
  assertSameMembers(decision.activeRoles, ["aide"], `${id}: discussion should keep only aide active`);
  assert.equal(decision.next.type, "answer", `${id}: discussion should answer directly`);
  assert.equal(decision.next.owner, "aide", `${id}: discussion should stay in aide`);
  assert.equal(executionRoles(decision).length, 0, `${id}: discussion should not wake execution roles`);
}

function verifySmallChangeSingleDelegate(fixture) {
  const { id, decision } = fixture;
  assertSameMembers(
    executionRoles(decision),
    ["coder"],
    `${id}: small clear change should use one clear execution role`
  );
  assert.equal(decision.next.type, "delegate", `${id}: small clear change should delegate`);
  assert.equal(decision.next.owner, "coder", `${id}: small clear change should delegate to coder`);
  ["tester", "qc", "submit", "conduct"].forEach((role) => {
    assert.ok(!decision.activeRoles.includes(role), `${id}: ${role} should stay inactive`);
  });
}

function verifyHighRiskBugfixGated(fixture) {
  const { id, decision } = fixture;
  const routeOwners = decision.route.map((step) => step.owner);

  assertIncludesAll(decision.activeRoles, ["tester", "coder", "qc"], `${id}: gated bugfix roles`);
  assert.equal(decision.next.owner, "tester", `${id}: high-risk bugfix should start with tester`);
  assert.equal(decision.gates.qc, "required", `${id}: high-risk bugfix should require qc gate`);
  assert.ok(routeOwners.includes("tester"), `${id}: route should include tester`);
  assert.ok(routeOwners.includes("coder"), `${id}: route should include coder`);
  assert.ok(routeOwners.includes("qc"), `${id}: route should include qc`);
  assert.ok(
    routeOwners.indexOf("coder") > routeOwners.indexOf("tester"),
    `${id}: coder should come after tester handoff`
  );
  assert.ok(
    routeOwners.indexOf("qc") > routeOwners.indexOf("coder"),
    `${id}: qc should run after coding step`
  );
}

function verifyProductArtifactRoute(fixture) {
  const { id, decision } = fixture;
  assertSameMembers(
    decision.activeRoles,
    ["aide", "product_assistant"],
    `${id}: product artifact should route to product_assistant`
  );
  assert.equal(decision.next.owner, "product_assistant", `${id}: wrong product route owner`);
  assert.equal(decision.next.type, "delegate", `${id}: product route should delegate`);
  ["coder", "tester", "qc", "submit", "conduct"].forEach((role) => {
    assert.ok(!decision.activeRoles.includes(role), `${id}: ${role} should not be enabled`);
  });
}

function verifyReleaseGovernedDelivery(fixture) {
  const { id, input, decision } = fixture;
  assertIncludesAll(decision.activeRoles, ["conduct", "submit"], `${id}: release route roles`);
  assert.equal(decision.next.owner, "conduct", `${id}: release should start with conduct`);
  assert.equal(decision.gates.submit, "required", `${id}: release should require submit gate`);
  assert.equal(input.context.governedDelivery, true, `${id}: expected governed delivery context`);
  assert.equal(input.context.needsEnvironmentSetup, true, `${id}: expected environment setup context`);
}

function verifyNewRepoConcreteMinimalTriage(fixture) {
  const { id, decision } = fixture;
  const routeOwners = decision.route.map((step) => step.owner);

  assert.equal(decision.next.type, "triage_then_delegate", `${id}: should do triage_then_delegate`);
  assert.equal(decision.next.owner, "repo_explorer", `${id}: minimal triage should use repo_explorer`);
  assert.equal(decision.triage.level, "minimal", `${id}: new repo concrete change should use minimal triage`);
  assert.equal(
    decision.triage.blocksDelegation,
    false,
    `${id}: minimal triage should not block delegation`
  );
  assert.ok(routeOwners.includes("coder"), `${id}: route should still delegate to coder`);
  assert.ok(routeOwners.indexOf("coder") > routeOwners.indexOf("repo_explorer"), `${id}: delegate after triage`);
}

function verifyNarrowedTaskDropsRoles(fixture) {
  const { id, decision } = fixture;
  assertSameMembers(
    decision.activeRoles,
    ["aide", "coder"],
    `${id}: narrowed task should retain only aide + coder`
  );
  assertIncludesAll(decision.droppedRoles, ["tester", "qc"], `${id}: narrowed task should drop extra roles`);
  assert.equal(decision.next.owner, "coder", `${id}: narrowed task should continue with coder`);
  ["tester", "qc", "repo_explorer", "conduct", "submit"].forEach((role) => {
    assert.ok(!decision.activeRoles.includes(role), `${id}: ${role} should be dropped/inactive`);
  });
}

const behaviorFixtures = [
  {
    id: "discussion-qna-aide-only",
    input: {
      userTask: "帮我比较两种方案的 tradeoff，不要改代码。",
      context: {
        repoContext: "fresh",
        concreteChange: false,
        risk: "low"
      }
    },
    decision: {
      mode: "discussion",
      activeRoles: ["aide"],
      droppedRoles: [],
      next: {
        type: "answer",
        owner: "aide",
        reason: "用户要讨论和建议，不是执行交付。"
      },
      triage: {
        level: "none",
        blocksDelegation: false
      },
      gates: {
        qc: "off",
        submit: "off"
      },
      route: [
        { owner: "aide", action: "direct_qna_reply" }
      ]
    },
    verify: verifyDiscussionAideOnly
  },
  {
    id: "small-clear-repo-change-single-delegate",
    input: {
      userTask: "把 login helper 里一个明显的 null crash 修掉并补一个单测。",
      context: {
        repoContext: "fresh",
        concreteChange: true,
        risk: "low"
      }
    },
    decision: {
      mode: "delivery",
      activeRoles: ["aide", "coder"],
      droppedRoles: [],
      next: {
        type: "delegate",
        owner: "coder",
        reason: "任务边界清晰，先给一个明确执行角色。"
      },
      triage: {
        level: "none",
        blocksDelegation: false
      },
      gates: {
        qc: "off",
        submit: "off"
      },
      route: [
        { owner: "aide", action: "classify_small_clear_change" },
        { owner: "coder", action: "implement_fix_and_unit_test" }
      ]
    },
    verify: verifySmallChangeSingleDelegate
  },
  {
    id: "higher-risk-bugfix-tester-coder-qc-gating",
    input: {
      userTask: "线上高优先级回归，先复现再修复，并给我一轮独立审查把关。",
      context: {
        repoContext: "fresh",
        concreteChange: true,
        risk: "high",
        auditRequested: true
      }
    },
    decision: {
      mode: "delivery",
      activeRoles: ["aide", "tester", "coder", "qc"],
      droppedRoles: [],
      next: {
        type: "delegate",
        owner: "tester",
        reason: "高风险修复先走 red/green 和验证 owner 分离。"
      },
      triage: {
        level: "minimal",
        blocksDelegation: false
      },
      gates: {
        qc: "required",
        submit: "off"
      },
      route: [
        { owner: "aide", action: "set_high_risk_bugfix_route" },
        { owner: "tester", action: "reproduce_and_capture_failure" },
        { owner: "coder", action: "implement_fix_for_failing_case" },
        { owner: "tester", action: "verify_fix_and_regression_scope" },
        { owner: "qc", action: "independent_quality_gate" }
      ]
    },
    verify: verifyHighRiskBugfixGated
  },
  {
    id: "product-artifact-routes-to-product-assistant",
    input: {
      userTask: "根据现有需求做一版 PRD 草稿和发布说明，不需要改代码。",
      context: {
        repoContext: "fresh",
        concreteChange: false,
        risk: "medium"
      }
    },
    decision: {
      mode: "delivery",
      activeRoles: ["aide", "product_assistant"],
      droppedRoles: [],
      next: {
        type: "delegate",
        owner: "product_assistant",
        reason: "主要产物是非代码 artifact。"
      },
      triage: {
        level: "none",
        blocksDelegation: false
      },
      gates: {
        qc: "off",
        submit: "off"
      },
      route: [
        { owner: "aide", action: "classify_non_code_artifact_task" },
        { owner: "product_assistant", action: "draft_product_artifact" }
      ]
    },
    verify: verifyProductArtifactRoute
  },
  {
    id: "release-governed-delivery-conduct-submit-conditions",
    input: {
      userTask: "准备发布：要做环境检查、整理交付并完成受控提交。",
      context: {
        repoContext: "fresh",
        concreteChange: false,
        risk: "medium",
        governedDelivery: true,
        needsEnvironmentSetup: true,
        requiresCommitPush: true
      }
    },
    decision: {
      mode: "delivery",
      activeRoles: ["aide", "conduct", "submit"],
      droppedRoles: [],
      next: {
        type: "delegate",
        owner: "conduct",
        reason: "先由 conduct 处理环境/冲突检查和路由编排，再进入 submit。"
      },
      triage: {
        level: "minimal",
        blocksDelegation: false
      },
      gates: {
        qc: "off",
        submit: "required"
      },
      route: [
        { owner: "aide", action: "classify_release_governed_delivery" },
        { owner: "conduct", action: "run_env_and_delivery_preflight" },
        { owner: "submit", action: "perform_governed_commit_push_followthrough" }
      ]
    },
    verify: verifyReleaseGovernedDelivery
  },
  {
    id: "new-repo-concrete-change-minimal-triage-then-delegate",
    input: {
      userTask: "这是个新仓库：请把 API client 重试次数从 1 改成 3，并补回归测试。",
      context: {
        repoContext: "new",
        concreteChange: true,
        risk: "medium"
      }
    },
    decision: {
      mode: "delivery",
      activeRoles: ["aide", "repo_explorer", "coder"],
      droppedRoles: [],
      next: {
        type: "triage_then_delegate",
        owner: "repo_explorer",
        reason: "先做最小 owner 定位，再尽快交给 coder。"
      },
      triage: {
        level: "minimal",
        blocksDelegation: false
      },
      gates: {
        qc: "off",
        submit: "off"
      },
      route: [
        { owner: "aide", action: "classify_concrete_change_on_new_repo" },
        { owner: "repo_explorer", action: "minimal_owner_scan_only" },
        { owner: "coder", action: "apply_targeted_change" }
      ]
    },
    verify: verifyNewRepoConcreteMinimalTriage
  },
  {
    id: "narrowed-task-drops-extra-roles",
    input: {
      userTask: "范围已经收窄，只改一个函数，不再需要额外审查链路。",
      context: {
        repoContext: "fresh",
        concreteChange: true,
        risk: "low",
        previouslyActiveRoles: ["aide", "tester", "coder", "qc"]
      }
    },
    decision: {
      mode: "delivery",
      activeRoles: ["aide", "coder"],
      droppedRoles: ["tester", "qc"],
      next: {
        type: "delegate",
        owner: "coder",
        reason: "任务已收窄，撤掉不再需要的额外角色。"
      },
      triage: {
        level: "none",
        blocksDelegation: false
      },
      gates: {
        qc: "off",
        submit: "off"
      },
      route: [
        { owner: "aide", action: "shrink_scope_and_drop_extra_roles" },
        { owner: "coder", action: "finish_narrowed_change" }
      ]
    },
    verify: verifyNarrowedTaskDropsRoles
  }
];

function validateScenario(fixture) {
  validateDecisionShape(fixture);
  fixture.verify(fixture);
}

function copyFixtureForMutation(baseFixture, id) {
  return {
    id,
    input: clone(baseFixture.input),
    decision: clone(baseFixture.decision),
    verify: baseFixture.verify
  };
}

function runPositiveBehaviorScenarios() {
  behaviorFixtures.forEach((fixture) => validateScenario(fixture));
}

function runNegativeGuardrailScenarios() {
  const byId = new Map(behaviorFixtures.map((fixture) => [fixture.id, fixture]));
  const mutationScenarios = [
    {
      id: "discussion-illegal-delegation",
      baseId: "discussion-qna-aide-only",
      mutate(fixture) {
        fixture.decision.activeRoles = ["aide", "coder"];
        fixture.decision.next = {
          type: "delegate",
          owner: "coder",
          reason: "wrong mutation"
        };
        fixture.decision.route.push({ owner: "coder", action: "implement_code_change" });
      },
      expected: /discussion should keep only aide active|discussion should answer directly/i
    },
    {
      id: "small-change-extra-role",
      baseId: "small-clear-repo-change-single-delegate",
      mutate(fixture) {
        fixture.decision.activeRoles = ["aide", "coder", "tester"];
      },
      expected: /small clear change should use one clear execution role/i
    },
    {
      id: "high-risk-without-qc-gate",
      baseId: "higher-risk-bugfix-tester-coder-qc-gating",
      mutate(fixture) {
        fixture.decision.activeRoles = ["aide", "tester", "coder"];
        fixture.decision.gates.qc = "off";
        fixture.decision.route = fixture.decision.route.filter((step) => step.owner !== "qc");
      },
      expected: /high-risk bugfix should require qc gate|high-risk bugfix should include qc|missing qc/i
    },
    {
      id: "product-artifact-routed-to-coder",
      baseId: "product-artifact-routes-to-product-assistant",
      mutate(fixture) {
        fixture.decision.activeRoles = ["aide", "coder"];
        fixture.decision.next = {
          type: "delegate",
          owner: "coder",
          reason: "wrong mutation"
        };
        fixture.decision.route = [
          { owner: "aide", action: "wrong_route" },
          { owner: "coder", action: "wrong_owner" }
        ];
      },
      expected: /product artifact should route to product_assistant|wrong product route owner/i
    },
    {
      id: "release-without-governed-submit-gate",
      baseId: "release-governed-delivery-conduct-submit-conditions",
      mutate(fixture) {
        fixture.decision.gates.submit = "off";
      },
      expected: /submit cannot be active with submit gate off|release should require submit gate/i
    },
    {
      id: "new-repo-full-scan-block",
      baseId: "new-repo-concrete-change-minimal-triage-then-delegate",
      mutate(fixture) {
        fixture.decision.triage.level = "full";
        fixture.decision.triage.blocksDelegation = true;
      },
      expected: /concrete change in new\/stale repo should not force a full scan|new repo concrete change should use minimal triage/i
    },
    {
      id: "narrowed-task-keeps-extra-roles",
      baseId: "narrowed-task-drops-extra-roles",
      mutate(fixture) {
        fixture.decision.activeRoles = ["aide", "coder", "tester"];
        fixture.decision.droppedRoles = [];
      },
      expected: /narrowed task should retain only aide \+ coder|narrowed task should drop extra roles/i
    }
  ];

  mutationScenarios.forEach((scenario) => {
    const base = byId.get(scenario.baseId);
    assert.ok(base, `${scenario.id}: base fixture not found`);

    const mutated = copyFixtureForMutation(base, scenario.id);
    scenario.mutate(mutated);

    assert.throws(
      () => validateScenario(mutated),
      scenario.expected,
      `${scenario.id}: mutated route should be rejected`
    );
  });
}

export function runAideDelegationBehaviorTests() {
  runPositiveBehaviorScenarios();
  runNegativeGuardrailScenarios();
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  runAideDelegationBehaviorTests();
  process.stdout.write(
    `aide delegation behavior tests passed (${behaviorFixtures.length} fixtures + 7 guardrail mutations)\n`
  );
}
