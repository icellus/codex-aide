# Testing

本文件定义 `/workspace/agent-skills` 中 `codex-starter` 的开发期校验模型。

它不定义：

- 安装流程 smoke
- 安装后目标仓库中的 runtime 用户工作流
- runtime authority 本身

`standards/*.json`、`fixtures/codex-starter-dev/**`、`scripts/validate-*.mjs` 只属于开发期治理。
它们校验 runtime authority 和实现是否对齐，但它们本身不是 runtime authority。

## Principles

- 这些规则适用于所有贡献者，无论改动来自手工、Codex、其他 AI 助手还是无 AI 工具。
- 把 `codex-starter` 当作长期维护产品，而不是一次性任务产物。
- 优先提高长期信号密度，而不是为了当前改动临时放宽标准。
- 优先少量稳定执行器加显式规则数据，避免大量一次性脚本。
- 测试资产应保持易审查、易删除、易证明有价值。
- 开发期校验默认以 CLI 为主，不绑定某个客户端或某个 AI 运行时。

## Validation Model

开发期校验有两个维度：

### Layer

- `contract`
  - 只放可执行契约。
  - 允许两类断言：`shape` 和 `behavior`。
  - `shape` 用于单文件/单 owner 的结构约束、解析约束、target validator。
  - `behavior` 用于 fixture 驱动的脚本执行与结果断言。
  - 不要把仅靠文本重复成立的 runtime 语义伪装成 `contract`。

- `consistency`
  - 只放跨文件一致性。
  - 适用范围限于 authority boundary、owner/handoff 约束、special-flow、path convention、integration wiring。
  - 不是 runtime 行为语义的 owner，也不是状态机/事件语义的替代实现。

- `meta`
  - 校验 registry、proof fixture、预算、套件完整性和 failing proof 路径。
  - 用来保证“测试系统本身”可信。

### Assertion Kind

- `shape`
  - 结构、解析、段落/字段约束、target validator。

- `behavior`
  - 运行脚本、驱动场景、比对结果。
  - 执行期入口应先确定唯一的绝对 `projectDir`；写入 state/log/progress 的持久化路径仍应保持 repo-relative。

- `consistency`
  - 跨文件 owner、边界、handoff、special-flow、路径约定的一致性。

- `meta`
  - registry 和 proof 体系本身的健康度。

`contract` 是 layer，不等于 assertion kind。  
`contract` 层中的检查必须明确属于 `shape` 或 `behavior` 之一。

## Default Entry Points

统一入口保持不变：

```bash
node scripts/validate-codex-starter-dev.mjs contract
node scripts/validate-codex-starter-dev.mjs consistency
node scripts/validate-codex-starter-dev.mjs meta
node scripts/validate-codex-starter-dev.mjs full
```

默认含义：

- `contract`: 可执行契约检查，含 `shape + behavior`
- `consistency`: 跨文件一致性检查
- `meta`: 测试系统自校验
- `full`: `contract + consistency + meta`

Git hooks 使用：

- `pre-commit` -> `contract`
- `pre-push` -> `full`

`standards/codex-starter-test-registry.json` 是默认套件的分发表。  
如果 registry 无法读取，开发期校验应直接失败，而不是假装还能代表当前套件。

## Source Of Truth

开发期校验由以下文件共同定义：

- [AGENTS.md](/workspace/agent-skills/AGENTS.md)
- [TESTING.md](/workspace/agent-skills/TESTING.md)
- [scripts/validate-codex-starter-dev.mjs](/workspace/agent-skills/scripts/validate-codex-starter-dev.mjs)
- [scripts/validate-codex-starter-authority.mjs](/workspace/agent-skills/scripts/validate-codex-starter-authority.mjs)
- [standards/codex-starter-authority-map.json](/workspace/agent-skills/standards/codex-starter-authority-map.json)
- [standards/codex-starter-consistency-map.json](/workspace/agent-skills/standards/codex-starter-consistency-map.json)
- [standards/codex-starter-test-registry.json](/workspace/agent-skills/standards/codex-starter-test-registry.json)
- [fixtures/codex-starter-dev](/workspace/agent-skills/fixtures/codex-starter-dev)

其中：

- `authority-map.json` 和 `consistency-map.json` 是开发期规则数据。
- 它们描述“如何验证”，不是 runtime authority。

## Daily Decision Rules

修改 testing 时按以下顺序决策：

1. 先判断是否根本不需要新检查。
2. 如需保留原规则，优先更新已有检查。
3. 只有规则或逃逸 failure mode 真正新增时，才加新检查。
4. 重复、过时或无 owner 的检查应在同一改动中删除或合并。

### When To Add No New Check

以下情况不要新增检查：

- 改动不影响受治理规则、不变量或 failure mode
- 只是文档改动，不改变开发期校验行为
- 只是重构执行器，而现有检查仍覆盖相同 `rule_id`
- 只是更新既有检查的数据、措辞、owner 或可接受输出形状

如果决定“不新增检查”，需要在变更说明、review note 或验证说明中记录原因。

### When To Update An Existing Check

在以下情况下应更新已有检查而不是新增：

- 仍然是同一个 `rule_id`
- 现有检查仍是该行为/约束的正确 owner
- 只是刷新 wording、fixture 文本、owner、目标文件或规则表达

### When To Add A New Check

只有以下条件同时满足时才新增：

- 被保护的规则或 failure mode 确实是新的
- 当前活跃覆盖无法准确表达它
- 新检查有明确长期 owner
- 当前改动结束后它仍然有持续价值

新增前必须能回答：

- 它保护哪个 `rule_id` 或哪个 escaped failure mode
- 现有覆盖为什么不够
- 为什么更新旧检查还不够
- 它是永久检查还是 `temporary`
- 如果是 `temporary`，删除条件是什么

### When To Delete Or Merge Checks

出现以下任一情况时，应删除或合并：

- 底层规则被移除或故意替换
- 检查只覆盖了过时实现路径
- 另一个活跃检查已覆盖同一 `rule_id` 和 failure mode
- `temporary` 检查已到删除条件
- 该检查实际上只是文本重复验证，却被错误当成 runtime 行为契约

## Test Asset Rules

- 保持一个默认入口。
- 优先把新覆盖加到规则数据或小型 fixture，而不是新建执行器。
- 能复用现有执行器时，不要新增执行器。
- 不要把大快照或整文件 golden copy 当成常规覆盖。
- 不要用厚 mock 代替规则语义验证。
- 优先使用最小真实文本 fixture，直接驱动 validator。
- 开发期资产应主要增长在规则数据和小型 fixture，而不是脚本数量。

## Registry Rules

所有活跃开发期检查都必须登记在 [standards/codex-starter-test-registry.json](/workspace/agent-skills/standards/codex-starter-test-registry.json)。

最小字段：

- `id`
- `layer`
- `assertion_kind`
- `rule_id`
- `failure_mode`
- `source_paths`
- `owner`
- `status`
- `executor`

额外规则：

- `temporary` 检查必须声明 `remove_when`
- 维护 failing proof 的检查必须声明 `proof_fixture_root`
- fixture 数量和大小必须受 registry budget 约束
- `layer` 与 `assertion_kind` 必须匹配：
  - `contract -> shape|behavior`
  - `consistency -> consistency`
  - `meta -> meta`

## Consistency Scope

`standards/codex-starter-consistency-map.json` 只允许表达以下跨文件一致性：

- `ownership`
- `handoff`
- `path-convention`
- `authority-boundary`
- `special-flow`
- `integration-wiring`

不要把以下内容继续塞进 consistency：

- runtime 状态机合法状态集合
- runtime 事件枚举
- 归档闭环行为本身
- 任何应该由脚本执行或 fixture 行为检查证明的语义

## Failing Proof Requirement

开发期 validator 不能只靠 pass case 获得信任。

- 对 authority、consistency、behavior 这类检查，维护至少一条故意失败的 proof 路径。
- failing proof fixture 必须最小、专用、可理解。
- live tree 通过但没有 maintained failing proof 的检查，应视为不完整。

## Review And Delivery

每次 `codex-starter` 开发交付至少报告：

- 跑了哪些 layer
- 每个 layer 下跑了哪些 assertion kind
- 覆盖了什么规则、边界或 drift
- 哪些检查被更新、删除、迁移或故意不新增
- 还剩哪些验证缺口和 owner

不要把文本存在性检查描述成行为覆盖。  
不要把局部迭代检查描述成完整开发期验证。
