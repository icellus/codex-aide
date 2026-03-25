# claude-starter

面向项目本地 Claude/Codex 工作流的轻启动 starter。

它默认走最轻可行路径，只保留很少的用户命令面；只有当任务复杂度、风险或协作方式明确需要时，才启用更重的规划、路由或发布模块。

## 特性

- 默认对外命令只有 `/Aide`、`/qc`、`/follow`
- `/Aide` 负责仓库接入、项目简报、称呼偏好和治理动作
- `conduct` 负责交付路由和可选的 `workspace prep`
- `prd`、`architect`、`plan`、`tester`、`coder`、`qc`、`follow`、hooks 全部按需启用
- 验证命令优先从仓库信号推断，不依赖固定 starter 预设
- hooks 默认关闭

## 对外命令

| 命令 | 作用 |
| --- | --- |
| `/Aide` | 仓库扫描、项目简报、角色/模块建议、治理动作入口 |
| `/qc` | 可选质量审计，适合高风险任务或用户显式要求的核查 |
| `/follow` | 可选的推送后 CI / 发布跟进 |

## 内部模型

| 项目 | 类型 | 责任 | 默认状态 |
| --- | --- | --- | --- |
| `Aide` | command | intake、仓库扫描、项目画像、治理 | 启用 |
| `prd` | skill | 澄清 WHAT、WHY、MVP | 关闭 |
| `architect` | skill | 澄清系统层 HOW | 关闭 |
| `conduct` | skill | 决定交付模式并拥有可选 `workspace prep` | 关闭 |
| `plan` | skill | 在需要持久执行说明时生成 `Implementation Plan` | 关闭 |
| `tester` | agent | 基于需求编写或更新测试 | 关闭 |
| `coder` | agent | 实现改动并完成验证 | 关闭 |
| `auto_qc` | skill | 可选的运行时 QC 自动触发能力 | 关闭 |
| hooks | 运行时可选层 | 会话上下文、git 校验、运行态状态记录 | 关闭 |

## 快速开始

1. 将 `CLAUDE.md` 和 `.claude/` 复制到目标仓库根目录。
2. 使用 `/Aide` 或 `/Aide [你的目标]` 开始。
3. 让 `/Aide` 扫描仓库、写入 `.claude/project-profile.md`，并给出初始角色/模块组合建议。
4. 小任务直接做。
5. 只有当任务确实需要时，才由 `conduct` 启用 `workspace prep`、`plan`、内部编排或执行 handoff。

## 默认任务路由

| 任务类型 | 默认模式 | 典型路径 |
| --- | --- | --- |
| `bugfix` | `direct` | `/Aide` -> 直接实现 -> 最小验证 |
| `feature` | `plan-driven` | `/Aide` -> 可选 `prd` -> 可选 `architect` -> `conduct` -> 可选 `plan` |
| `refactor` | `direct` | `/Aide` -> 直接处理 -> 仅在范围扩大时升级 |
| `release` | `orchestrated` | `/Aide` -> `conduct` -> 可选 `/qc` -> 可选 `/follow` |
| `exploration` | `direct` | `/Aide` -> 定向分析 -> 轻量记录 |

## 目录结构

- `CLAUDE.md`：项目操作模型
- `.claude/project-profile.md`：项目画像、验证画像、路由矩阵、协作偏好
- `.claude/commands/`：对外命令
- `.claude/skills/`：内部工作流逻辑
- `.claude/agents/`：可选执行角色
- `.claude/templates/`：PRD、架构、计划、进度、研究等模板
- `.claude/hooks/`：可选运行时自动化
- `.claude/settings.json`：默认关闭 hooks
- `.claude/settings.hooks.example.json`：hooks 示例配置

启用 hooks 后，运行态状态文件会按需创建在 `.claude/state/runtime-state.json`。

## 文档

- English overview: [`docs/overview.md`](./docs/overview.md)
- English usage: [`docs/usage.md`](./docs/usage.md)
- 中文概述: [`docs/overview.zh-CN.md`](./docs/overview.zh-CN.md)
- 中文使用说明: [`docs/usage.zh-CN.md`](./docs/usage.zh-CN.md)
