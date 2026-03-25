# 概述

## 这套 Starter 主要优化什么

`claude-starter` 适合那种大多数任务都应保持轻量 direct，但在必要时又需要更强规划、审计和发布控制的仓库。

## 设计原则

- 默认轻启动
- 对外命令面尽量小
- 验证命令优先从仓库推断
- 运行时 authority 只保留一份
- intake / 治理 和交付路由分离
- 只有协作确实需要时才保留持久状态

## 运行时 Authority

| 文件 | 责任 |
| --- | --- |
| `CLAUDE.md` | 全局操作原则 |
| `.claude/routing-policy.md` | 路由和模块启用 authority |
| `.claude/project-profile.md` | 当前仓库事实和当前任务状态 |
| `.claude/validation-profile.json` | 结构化验证命令与约束 |

## 角色与模块

| 项目 | 责任 | 默认状态 |
| --- | --- | --- |
| `/Aide` | intake、当前状态、治理 | 启用 |
| `conduct` | 交付路由和 `workspace prep` | 关闭 |
| `prd` | WHAT、WHY、MVP 澄清 | 关闭 |
| `architect` | 系统层 HOW | 关闭 |
| `plan` | 实施 handoff | 关闭 |
| `tester` | 测试设计和验证优先工作 | 关闭 |
| `coder` | 实现和定向验证 | 关闭 |
| `/qc` | 审计门 | 关闭 |
| `/follow` | 推送后跟进 | 关闭 |
| hooks | 可选运行时自动化 | 关闭 |

## 交付形态

- `direct`：小、局部、边界清晰的任务
- `plan-driven`：需要一份实施说明的任务
- `orchestrated`：多步骤、跨会话、发布类或高风险任务

`workspace prep` 归 `conduct`，不归 `/Aide`。
精确的任务默认值和升级条件以 `.claude/routing-policy.md` 为准。

## 持久产物

- `.claude/project-profile.md`：当前仓库事实和当前任务状态
- `.claude/validation-profile.json`：结构化验证命令事实
- `PRD.md` 或 scoped PRD 文件：可选产品范围
- `ARCHITECTURE.md` 或 scoped architecture 文件：可选系统设计
- `Implementation Plan`：可选实施说明
- `PROGRESS.md`：仅 orchestration 使用的进度状态
- `.claude/state/runtime-state.json`：hooks 维护的运行时记忆

## 运行时自动化

hooks 默认关闭。

启用后可提供：

- 会话提醒
- git 校验
- 运行时状态跟踪
- 可选 auto QC 后续动作

只有当前任务显式启用 `/qc` 时，才应出现自动 QC 提醒。

## 适用场景

这套 starter 更适合：

- 中小型仓库
- 以 bugfix、定向 feature、局部 refactor 为主的日常开发
- 希望保留可选控制能力，但不想默认走重流程的团队
