# `/Aide` 能力进化与角色自动调整讨论上下文

这份文件用于开启一个新的讨论线程。

它是冷文档，只给人读，不属于运行时热路径，也不是权威配置文件。

## 讨论目标

围绕 `codex-starter` 当前实现，专门讨论这几个问题：

- `/Aide` 已经具备哪些治理能力
- 当前实现离“支持进化”还差什么
- `/Aide` 是否应该支持角色能力的自动调整与进化
- 哪些信号可以触发这种进化
- 哪些进化应该自动排队，哪些进化必须人工确认
- 在不显著增加热路径上下文和 token 成本的前提下，如何设计这套能力

## 建议先读的文件

- `codex-starter/README.md`
- `codex-starter/docs/overview.md`
- `codex-starter/docs/usage.md`
- `codex-starter/.agents/skills/aide/SKILL.md`
- `codex-starter/.agents/skills/architect/SKILL.md`
- `codex-starter/.codex/routing-policy.md`
- `codex-starter/.codex/validation-profile.json`
- `codex-starter/.codex/scripts/aide-governance.mjs`
- `codex-starter/.codex/scripts/runtime-state.mjs`
- `codex-starter/.codex/scripts/runtime-utils.mjs`
- `codex-starter/.codex/scripts/session-context.mjs`

## 当前实现的基线

### 1. `/Aide` 的当前定位

当前 `/Aide` 已经不只是 intake 命令。

它现在更接近：

- 当前任务和仓库状态的维护入口
- 默认路由与治理动作的入口
- 团队层面问题的调查者
- 共享规则的 writeback 入口

更准确地说：

- 其他角色解决的是“当前这个功能怎么做好”
- `/Aide` 解决的是“团队为什么会产出这种问题，以及以后怎么少犯”

### 2. 当前已经实现的核心能力

当前已经落地的能力包括：

- 问题调查与默认路由
- Agent / Skill 契约质量审计
- 跨 Agent / Skill 规则去重
- `L1` 到 `L4` 的治理评级
- 自动排队 `/Aide` review
- `architect` 的结构化 session-end retrospective

这些能力背后的核心原则已经明确：

- `/Aide` 不只修这次产物，更关注系统性根因
- 审计不是文案挑刺，而是找会持续降低团队效能的问题
- 去重不是删字，而是给每条规则找单一权威

### 3. 当前自动触发的基线

当前已经接入的自动触发信号包括：

- 重复 QC failure pattern
- `tester` 或 `coder` 的 blocked handoff
- 任务切换或清理时发现旧任务没有正常收口
- `architect` 每次会话结束后的结构化回顾

其中需要特别注意：

- 负责结构化回顾的是 `architect`，不是 `conduct`
- 这是知识捕获动作，不是失败后才触发的补救动作

### 4. 当前实现的边界

虽然 `/Aide` 已经有治理能力，但当前系统还不是完整的“自动进化引擎”。

当前更像是：

- 自动收集信号
- 自动排队治理 review
- `/Aide` 负责调查、定级、归因、决定 writeback 目标
- 真正的 writeback 仍然偏人控或半自动

所以当前缺的不是“有没有治理入口”，而是：

- 进化模型还没有独立定义
- 角色自动调整还没有系统建模
- 哪些情况允许自动升级到共享规则，还没有稳定阈值

## 这次新讨论建议先解决的核心问题

### 1. 先定义“进化”到底指什么

这里至少要区分几种不同层级：

- 经验捕获：把一次任务的经验记下来
- 进化候选：把经验变成可评估的 writeback 候选
- 角色调整：修改某个角色的 skill / prompt / 默认行为
- 流程调整：修改 routing、QC、follow、handoff 规则
- 自动化升级：把某类 review 从手工触发升级成自动触发

如果不先把这些层级分开，很容易把“记经验”和“改系统”混成一件事。

### 2. 明确“角色自动调整进化”的范围

建议新讨论先定边界：

- 是只调整单个角色的 skill 协议
- 还是允许调整 subagent prompt
- 是否允许调整 routing policy
- 是否允许调整 runtime script
- 是否允许修改仓库级验证基线

如果不先定范围，就很容易把 `/Aide` 变成无边界自改系统。

### 3. 明确进化的证据来源

这次讨论必须明确哪些信号可以作为进化证据。

候选来源至少包括：

- `architect` 每次会话的结构化回顾
- 重复 QC failure pattern
- 重复 blocked handoff
- `/Aide audit` 发现的系统性缺口
- `/Aide dedup` 发现的重复 authority
- 用户手动纠正后的显式反馈
- 多次指向同一 authority target 的 writeback candidates

### 4. 明确自动触发和自动应用的边界

这是最关键的问题之一。

建议至少区分：

- 自动触发 review
- 自动生成进化候选
- 自动建议 writeback
- 自动执行低风险 writeback

这四层不是一回事。

如果不做分层，就会出现两种坏结果：

- 太保守，永远只有提醒，没有进化
- 太激进，系统开始过拟合并不断改自己

### 5. 明确写回目标和权威边界

如果 `/Aide` 要支持进化，就必须明确写回落点。

常见目标包括：

- `.agents/skills/*/SKILL.md`
- `.codex/agents/*.toml`
- `.codex/routing-policy.md`
- `.codex/validation-profile.json`
- `.codex/scripts/*.mjs`
- 高层使用文档

需要避免的问题是：

- 同一条经验被写进多个文件
- 局部例外被误写成全局规则
- 运行时热文件承载长期治理内容

### 6. 明确冷状态与热状态的边界

这次讨论也要明确：

- 进化候选和证据不应进入热路径
- 当前任务热状态仍然应该保持轻量
- 角色进化历史、候选队列、采纳记录应该进入冷状态

如果把这些内容放进热状态，会直接抬高恢复成本和 token 成本。

## 建议在新线程里优先评估的方案方向

### 方向 A：保持人控 writeback，增强自动候选生成

特点：

- 自动触发 review
- 自动聚合证据
- 自动生成 writeback candidates
- 最终仍由 `/Aide` 明确决定是否写回

优点：

- 风险最低
- 最符合当前 starter 的治理风格
- 不容易把系统推向无边界自改

缺点：

- 进化速度仍依赖主代理判断

### 方向 B：分级自动化

特点：

- `L1-L2` 只提醒或排队
- `L3` 自动生成明确 writeback 建议
- `L4` 自动要求 `/Aide` 审核
- 只有极低风险的结构性修补允许自动应用

优点：

- 自动化程度更高，但仍保留安全阈值

缺点：

- 需要认真定义哪些写回算“低风险”

### 方向 C：引入“进化候选注册表”

特点：

- 新增冷状态文件记录候选、证据、目标、状态、采纳结果
- 热路径不读取全量候选，只读当前待处理摘要

优点：

- 比把经验散落在 runtime memory 或文档里更稳定
- 更适合持续迭代的项目

缺点：

- 需要额外定义候选生命周期

### 方向 D：角色自动调整矩阵

特点：

- 明确不同信号默认调整哪个角色
- 明确不同问题默认写回哪个 authority

例如：

- 架构假设反复错误 -> 优先调整 `architect`
- 验收边界反复不清 -> 优先调整 `tester`
- 代码总放错模块 -> 优先调整 routing 或 `coder` / `architect` 边界
- QC 重复抓到同类问题 -> 优先调整 `tester`、`coder` 或 `/qc`

优点：

- `/Aide` 的路由和进化可以用统一逻辑

缺点：

- 初始定义要足够清楚，否则会变成新一层模糊规则

## 讨论时建议坚持的原则

- `/Aide` 优化的是团队系统，不是只修当前症状
- 角色进化应基于证据，不应基于单次噪声
- 自动触发不等于自动改文件
- 一条规则只应有一个真正权威
- 进化的结果应让系统更短、更稳，而不是越来越膨胀
- `architect` 的结构化回顾应被视为常规知识输入，不是异常分支
- 不要把 starter 变成会无限自改的黑箱系统

## 希望新线程最终回答的问题

建议新线程至少输出：

1. 当前 `/Aide` 已有治理能力总结
2. 当前离“支持进化”还缺什么
3. 角色自动调整应覆盖哪些层
4. 哪些信号算足够证据
5. 自动触发、自动建议、自动应用的边界
6. 推荐的冷状态 / 注册表模型
7. 推荐的 writeback 权威分配
8. 最小迁移方案
9. 暂时不要自动化的部分
