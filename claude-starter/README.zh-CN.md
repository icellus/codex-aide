# claude-starter

面向项目本地 Claude/Codex 工作流的轻启动 starter。

它默认保持 direct 路径、对外命令面尽量小，只有当前任务确实需要时才启用更重的规划、QC 或发布控制。

## 一眼看懂

- 默认命令：`/Aide`、`/qc`、`/follow`
- 小任务默认模式：`direct`
- runtime hooks：默认关闭
- 路由 authority：`.claude/routing-policy.md`
- 当前任务状态：`.claude/project-profile.md`
- 结构化验证命令：`.claude/validation-profile.json`

## 快速开始

1. 将 `CLAUDE.md` 和 `.claude/` 复制到目标仓库。
2. 使用 `/Aide` 或 `/Aide [你的目标]` 开始。
3. 让 `/Aide` 扫描仓库、更新当前状态，并给出最轻可行路由建议。
4. 除非任务明确需要，否则保持 direct，不要默认升级到 plan、orchestration、QC 或 follow-through。

## 运行时 Authority

- `CLAUDE.md`：全局原则
- `.claude/routing-policy.md`：路由和模块启用 authority
- `.claude/project-profile.md`：当前仓库事实和当前任务状态
- `.claude/validation-profile.json`：结构化验证命令事实

启用 hooks 后，会按需创建 `.claude/state/runtime-state.json`。
启用 orchestration 时，`PROGRESS.md` 使用 `## Current Work`，并可包含由 hooks 维护的 `Session Retrospective` 和 `Learning Queue` 区块。
只有当前任务显式启用 `/qc` 时，才会排队自动 QC 提醒；即使是没有 tracked story path 的 direct 或 plan-driven 任务也一样。

## 文档

- English overview: [`docs/overview.md`](./docs/overview.md)
- English usage: [`docs/usage.md`](./docs/usage.md)
- 中文概述: [`docs/overview.zh-CN.md`](./docs/overview.zh-CN.md)
- 中文使用说明: [`docs/usage.zh-CN.md`](./docs/usage.zh-CN.md)
