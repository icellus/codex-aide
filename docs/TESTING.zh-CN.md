# 测试与开发校验

[English](../TESTING.md)

如有歧义，以英文主文件为准。

本文件定义本仓库中 `codex-aide` 的开发期校验模型。

它不定义以下内容：

- 安装 smoke 检查
- 安装后目标仓库中的运行期用户工作流
- 运行时权威本身

像 `tests/standards/*.json`、`tests/fixtures/codex-aide-dev/**`、`scripts/validate-*.mjs` 这样的文件都属于开发治理资产。
它们用于校验运行时权威与实现是否一致，并不是运行时权威本身。

## 原则

- 这些规则适用于所有贡献者，无论是手工修改、通过 Codex、通过其他 AI 助手，还是不使用 AI 工具
- 把 `codex-aide` 当成持续维护的产品，而不是一次性任务产物
- 追求长期稳定信号，而不是只为了让当前改动过关
- 优先使用少量稳定执行器加显式规则数据，而不是不断堆叠一次性脚本
- 测试资产应易审阅、易删除、易说明存在理由
- 开发校验应保持 CLI-first、工具无关，确保 shell、hooks、CI、编辑器集成都能跑同一套检查

## 校验模型

开发校验按两个维度组织：`layer` 和 `assertion_kind`。

### Layer

- `contract`
  - 只放可执行契约检查
  - 这一层可以包含 `shape` 和 `behavior`
  - 不要把只是文本重复校验的东西伪装成运行行为契约

- `consistency`
  - 只放跨文件一致性检查
  - 这一层负责权威边界、所有权、handoff、特殊流程、路径约定和接线一致性
  - 它不负责运行时状态机、事件模型等行为语义

- `meta`
  - 测试系统自身的校验
  - 负责注册表健康、proof fixtures、预算、套件完整性和 failing-proof 预期

### Assertion Kind

- `shape`
  - 结构、可解析性、单文件不变量和目标校验器

- `behavior`
  - 基于夹具执行并断言结果的检查
  - 执行入口应尽早建立唯一、规范化的绝对 `projectDir`
  - 写入运行时状态的机器消费路径应保持绝对路径
  - 宿主维护期的校验入口必须运行在仓库隔离镜像中，而不是直接跑在宿主工作树上
  - 开发校验不得在宿主工作区创建 repo 根级 `.codex/`、`.codex/state/*.json`、`.codex/logs/**`、`.codex/progress/**` 等运行态产物

- `consistency`
  - 跨文件的一致性检查，覆盖所有权、边界、handoff、路径约定、特殊流程和接线

- `meta`
  - 测试系统自身健康

`contract` 是 layer，不是 assertion kind。
`contract` 层中的每个检查都必须明确分类为 `shape` 或 `behavior`。

## 默认入口

统一使用开发校验器：

```bash
node scripts/validate-codex-aide-dev.mjs contract
node scripts/validate-codex-aide-dev.mjs consistency
node scripts/validate-codex-aide-dev.mjs meta
node scripts/validate-codex-aide-dev.mjs full
```

默认校验器运行在仓库的隔离临时镜像中，必须保证宿主工作区不会出现 repo 根级 `.codex/` 等运行态目录。

默认含义：

- `contract`：执行 `shape + behavior`
- `consistency`：跨文件一致性检查
- `meta`：测试系统自身校验
- `full`：`contract + consistency + meta`

Git hooks 使用：

- `pre-commit` -> `contract`，范围限定在校验维护边界中的 staged 文件
- `pre-push` -> `full`，范围限定在 push 引用中的校验维护文件
- repository CI -> `full`，让 PR 和 push 在 GitHub Actions 中也暴露同一套开发校验结果

Hook 范围规则：

- 若当前 staged 集合或 push 引用中没有校验维护文件，hook 可以跳过校验
- changed-file 范围可以过滤昂贵的 `contract` `behavior`，但不能跳过仍属于当前模式的 `shape`、`consistency` 或 `meta`
- 当 `scripts/validate-codex-aide-dev.mjs` 或 `tests/standards/codex-aide-test-registry.json` 变更时，不得按 changed files 过滤 `contract` `behavior`

`tests/standards/codex-aide-test-registry.json` 是默认套件的分发表。
如果无法读取注册表，开发校验必须失败，而不是假装套件仍然已知。

## 权威来源

开发校验由以下文件定义：

- [AGENTS.md](../AGENTS.md)
- [TESTING.zh-CN.md](TESTING.zh-CN.md)
- [scripts/validate-codex-aide-dev.mjs](../scripts/validate-codex-aide-dev.mjs)
- [scripts/validate-codex-aide-authority.mjs](../scripts/validate-codex-aide-authority.mjs)
- [tests/standards/codex-aide-authority-map.json](../tests/standards/codex-aide-authority-map.json)
- [tests/standards/codex-aide-consistency-map.json](../tests/standards/codex-aide-consistency-map.json)
- [tests/standards/codex-aide-test-registry.json](../tests/standards/codex-aide-test-registry.json)
- [tests/fixtures/codex-aide-dev](../tests/fixtures/codex-aide-dev)

在这个模型里：

- `authority-map.json` 和 `consistency-map.json` 属于开发期规则数据
- 它们描述“如何校验”，而不是定义运行时权威

## 日常决策规则

修改测试时，按以下顺序判断：

1. 先判断是否可以不新增检查
2. 若必须改覆盖，优先更新已有检查
3. 只有当规则或逃逸故障模式真的是新的，才新增检查
4. 若存在重复、过时或失去清晰所有权的检查，应在同一改动中删除或合并

### 何时不新增检查

以下任一情况成立时，不要新增检查：

- 改动没有改变受治理规则、不变量或故障模式
- 改动只是文档，不影响开发校验行为
- 只是重构执行器，而现有检查仍覆盖同一 `rule_id`
- 只是更新了已有检查，没有引入新的规则或故障模式

决定不新增检查时，应在变更说明、评审说明、PR 描述或校验备注中记录原因。

### 何时更新已有检查

满足以下情况时，应更新已有检查而不是新增：

- 仍然是同一个 `rule_id`
- 现有检查仍然是该行为或约束的正确 owner
- 改动只刷新了措辞、夹具、owner、目标文件或接受的输出形态

### 何时新增检查

只有在以下条件全部成立时，才新增检查：

- 保护的规则或逃逸故障模式确实是新的
- 现有有效覆盖无法诚实表达它
- 新检查有明确的长期 owner
- 当前改动结束后，这个检查仍然有持续价值

新增前，应基于仓库证据回答：

- 它保护的是哪个 `rule_id` 或哪种逃逸故障模式
- 为什么现有覆盖不够
- 为什么更新已有检查不够
- 它是永久还是 `temporary`
- 如果是 `temporary`，何时删除

### 何时删除或合并检查

满足以下任一情况时，应删除或合并检查：

- 底层规则被移除或被有意替换
- 检查只覆盖了已废弃实现路径
- 另一个有效检查已经覆盖了同一 `rule_id` 和故障模式
- `temporary` 检查已经达到删除条件
- 检查只是验证重复文案，却被错误当成行为覆盖

## 测试资产规则

- 保持一个默认开发校验入口
- 优先通过规则数据或小型夹具扩展覆盖，而不是新增执行器
- 如果现有执行器已经能诚实表达该规则，不要新增执行器
- 不要把大快照或整文件 golden copy 当作常规覆盖手段
- 不要对内部规则语义使用厚重 mock
- 优先使用最小、真实、可直接驱动校验器的夹具
- 测试资产增长应主要体现在规则数据和小夹具，而不是脚本数量

## 注册表规则

每个有效的开发校验检查都必须登记到 [tests/standards/codex-aide-test-registry.json](../tests/standards/codex-aide-test-registry.json)。

最少字段：

- `id`
- `layer`
- `assertion_kind`
- `rule_id`
- `failure_mode`
- `source_paths`
- `owner`
- `status`
- `executor`

附加规则：

- `temporary` 检查必须声明 `remove_when`
- 维护 failing proof 的检查必须声明 `proof_fixture_root`
- 夹具数量和大小必须满足注册表预算
- `layer` 与 `assertion_kind` 必须保持一致：
  - `contract -> shape|behavior`
  - `consistency -> consistency`
  - `meta -> meta`

## 一致性范围

`tests/standards/codex-aide-consistency-map.json` 只允许表达以下跨文件一致性类别：

- `ownership`
- `handoff`
- `path-convention`
- `authority-boundary`
- `special-flow`
- `integration-wiring`

不要把以下内容放进 consistency 规则：

- 运行时状态机合法性
- 运行时事件枚举
- archive loop 本身的行为
- 任何应通过脚本执行或 fixture-driven behavior 证明的语义

## Failing Proof 要求

开发校验不能只靠“通过情况”建立信任。

- authority、consistency、behavior 检查都必须至少维护一个故意失败的 proof 路径
- failing-proof fixtures 应保持最小、专用、可读
- 如果一个校验器在 live tree 上能通过，但没有维护 failing proof 路径，应视为不完整

## 评审与交付

每次 `codex-aide` 开发改动都应报告：

- 跑了哪些 layer
- 每个 layer 跑了哪些 assertion kind
- 它们覆盖了哪些规则、边界或 drift
- 检查是更新、删除、迁移，还是有意不新增
- 仍然存在的校验缺口及其 owner

不要把文本存在性检查描述成行为覆盖。
不要把局部迭代检查描述成完整开发校验。
