# 概览

## 这个 Starter 主要优化什么

`codex-starter` 适合这样一类仓库：

- 大多数工作应该保持轻量、直接
- 但在任务需要时，仍然要能启用更强的规划、审计和发布控制

它的目标不是让每个任务都走重流程，而是：

- 默认轻量
- 按需升级
- 把运行时上下文保持在必要的最小范围内

## 设计原则

- 默认从轻开始
- 用户可见命令面保持小
- 验证命令尽量从仓库中推导
- 运行时权威尽量单一
- 将 intake / governance 与 delivery routing 分开
- 只有在协调真正需要时才引入 durable state

## 运行时权威文件

| 文件 | 作用 |
| --- | --- |
| `AGENTS.md` | 全局入口、命令映射、少量全局规则 |
| `.agents/skills/*/SKILL.md` | repo-local skills 与 slash command 协议 |
| `.codex/agents/*.toml` | 自定义子代理定义 |
| `.codex/config.toml` | 子代理并发默认配置 |
| `.codex/routing-policy.md` | 路由与模块启用策略 |
| `.codex/state/task-context.json` | 热任务状态与协作偏好 |
| `.codex/state/task-registry.json` | 冷任务注册表，用于当前任务、未结束任务和已完成历史 |
| `.codex/state/repo-context.json` | 仓库缓存事实 |
| `.codex/validation-profile.json` | 仓库级验证基线与限制 |
| `.codex/project-profile.md` | 给人看的短摘要 |
| `.codex/scripts/*.mjs` | 可选的运行时辅助脚本 |

## 角色与模块

| 项目 | 作用 | 默认状态 |
| --- | --- | --- |
| `/Aide` | 入口、当前状态维护、系统治理与团队能力写回 | 启用 |
| `conduct` | delivery routing 与 `environment setup` | 关闭 |
| `prd` | WHAT / WHY / MVP 澄清 | 关闭 |
| `architect` | HOW 层面的系统设计 | 关闭 |
| `plan` | 实施计划与 handoff | 关闭 |
| `auto_qc` | 在符合条件时为 tester / coder 完成结果追加 QC 跟进 | 关闭 |
| `tester` | 任务级验证 owner 与测试设计 | 关闭 |
| `coder` | 实现与 sanity checks | 关闭 |
| `/qc` | 质量审计 gate | 关闭 |
| `/follow` | 推送后或发布后的跟进 | 关闭 |
| runtime helpers | Node 辅助自动化 | 默认关闭 |

## `/Aide` 真正优化什么

- 其他角色关注的是“这次任务怎么做对”；`/Aide` 关注的是“团队以后怎么更稳、更少重复犯错”。
- 问题调查与默认路由：当代码放错地方、输出质量下降、handoff 断裂时，`/Aide` 不只修表面症状，而是追根因并把问题路由到最小正确权威。
- 质量审计：`/Aide` 审的是 Agent / Skill 契约里会持续拖慢团队的系统性问题，不是文案挑刺。
- 去重：`/Aide` 查找跨 Agent / Skill 文件的重复规则，把同一条规则收敛回单一权威。
- 治理评级：`/Aide` 用 `L1` 到 `L4` 给问题定级，决定是提醒、排队还是直接 writeback。
- 知识捕获：每次设计会话结束后，负责结构化回顾的是 `architect`，不是 `conduct`。`/Aide` 会把这些设计决策、错误假设和写回候选当成治理输入。

## 三种交付形态

- `lightweight`：小范围、局部、清晰任务
- `standard`：需要一个明确实施计划的任务
- `long-running`：跨 session、多 checkpoint、发布或更高风险任务

`environment setup` 属于 `conduct`，不属于 `/Aide`。  
具体任务默认模式和升级条件在 `.codex/routing-policy.md`。

## 持久化产物

- `.codex/state/task-context.json`：热任务状态
- `.codex/state/task-registry.json`：冷任务注册表与按需查询的任务历史
- `.codex/state/repo-context.json`：仓库缓存事实
- `.codex/validation-profile.json`：仓库级验证基线
- `.codex/templates/validation-handoff.md`：可选的 tester 任务级验证 handoff 模板
- `.codex/project-profile.md`：人类可读短摘要
- `PRD.md` 或 scoped PRD：可选需求文档
- `ARCHITECTURE.md` 或 scoped architecture：可选架构文档
- `Implementation Plan`：可选实施计划
- `PROGRESS.md`：仅 long-running 模式下使用的 checkpoint 跟踪
- `.codex/state/runtime-state.json`：运行时 memory，由脚本按需生成

`PROGRESS.md` 应只承载 checkpoint、next step、blockers 等可恢复信息，不应承担运行时学习队列或大量机器态。

## 运行时自动化

runtime helpers 是可选的。

启用后可以提供：

- session 提醒
- git 安全校验
- runtime state 跟踪
- 可选的 auto QC 跟进
- 来自重复 QC 失败、blocked handoff、任务未正常收口、architect 回顾的自动 `/Aide` 治理触发

Auto QC 只应在当前任务明确启用了 `/qc` 时出现。

## 最适合什么团队

这个 starter 更适合：

- 小到中型仓库
- 大多数任务是 bugfix、局部 feature、局部 refactor
- 希望有 optional controls，但不想默认重流程
- 希望主会话保持干净，具体执行尽量交给角色化子代理
