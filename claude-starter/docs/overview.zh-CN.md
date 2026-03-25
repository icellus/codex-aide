# 概述

## 这套 Starter 是什么

`claude-starter` 是一套面向项目本地 Claude/Codex 工作流的轻启动 starter。

它适合那种大多数任务都应该先走轻路径、直接执行、按仓库信号做验证，但又需要在复杂任务里按需启用更强规划、架构、质量审计和发布控制的仓库。

## 设计原则

- 默认轻启动
- 对外命令面尽量小
- 验证命令优先从仓库推断
- 只有任务需要时才启用更重的角色和模块
- intake / 治理 和 交付路由分离
- 只有在协作确实需要时才保留持久状态

## 角色与模块模型

| 项目 | 类型 | 责任 | 默认状态 |
| --- | --- | --- | --- |
| `/Aide` | command | 仓库扫描、项目简报、称呼偏好、治理 | 启用 |
| `prd` | 内部 skill | 澄清 WHAT、WHY、MVP | 关闭 |
| `architect` | 内部 skill | 澄清系统层 HOW | 关闭 |
| `conduct` | 内部 skill | 决定交付模式、拥有可选 `workspace prep`、协调内部编排 | 关闭 |
| `plan` | 内部 skill | 生成 `Implementation Plan` | 关闭 |
| `tester` | agent | 基于需求编写或更新测试 | 关闭 |
| `coder` | agent | 实现改动并完成验证 | 关闭 |
| `/qc` | command | 按轻量、计划或发布深度做审计 | 关闭 |
| `/follow` | command | 跟进推送后的 CI / 发布状态 | 关闭 |
| `auto_qc` | 内部 skill | 在启用运行时自动化时自动触发 QC | 关闭 |
| hooks | 可选运行时层 | 会话上下文、git 校验、运行态状态记录 | 关闭 |

## 交付模式

| 模式 | 适用场景 | 常见模块 |
| --- | --- | --- |
| `direct` | 小、局部、边界清晰的任务 | main agent、定向验证 |
| `plan-driven` | 需要稳定实施说明的任务 | 可选 `prd`、可选 `architect`、可选 `plan` |
| `orchestrated` | 多步骤、跨会话、发布类或更高风险任务 | `conduct`、可选进度跟踪、可选 `qc`、可选 `follow` |

`workspace prep` 归 `conduct` 所有。它是执行前准备能力，不是对外角色，也不属于 `/Aide` 的 intake 范围。

## 任务类型默认值

| 任务类型 | 默认模式 | 说明 |
| --- | --- | --- |
| `bugfix` | `direct` | 大多数 bugfix 不应默认启用 PM、架构和计划 |
| `feature` | `plan-driven` | 只有边界不清时才加 `prd` 或 `architect` |
| `refactor` | `direct` | 只有范围或风险扩大时才升级 |
| `release` | `orchestrated` | 从协调和质量门开始 |
| `exploration` | `direct` | 优先扫描、分析和轻量记录 |

## 持久产物

| 产物 | 负责人 | 作用 |
| --- | --- | --- |
| `.claude/project-profile.md` | `/Aide` | 项目画像、验证画像、任务矩阵、协作偏好 |
| `PRD.md` 或 scoped PRD 文件 | `prd` | 产品范围与 MVP |
| `ARCHITECTURE.md` 或 scoped architecture 文件 | `architect` | 系统层设计决策 |
| `Implementation Plan` | `plan` | 实施 handoff 与验证说明 |
| `PROGRESS.md` | `conduct` | 跨会话或发布协调状态 |
| runtime state JSON | hooks | 可选运行时自动化状态 |

## 运行时自动化

hooks 默认关闭。

启用后可以提供：

- 会话上下文
- git 校验
- 运行态状态跟踪
- 可选的 `auto_qc` 后续动作

## 适用场景

这套 starter 更适合：

- 中小型仓库
- 以 bugfix、定向 feature、局部 refactor 为主的日常开发
- 希望保留更强控制能力，但不想每次都强推完整重流程的团队

它同样可以承接更高风险任务，但应按任务启用对应模块，而不是默认整套全开。
