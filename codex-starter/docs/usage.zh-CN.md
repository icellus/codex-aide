# 使用说明

## 安装

1. 将 `AGENTS.md`、`.agents/skills/`、`.codex/` 复制到目标仓库根目录。
2. 如果要使用 runtime helpers 或 smoke tests，确保 `node` 在 `PATH` 上可用。
3. 从 `/Aide` 开始。

## 首次运行

使用下面任意一种：

```text
/Aide
/Aide 修复登录回调 bug
```

首次运行时，`/Aide` 应该：

- 简短打招呼
- 扫描仓库
- 更新 `.codex/state/task-context.json`
- 更新 `.codex/state/repo-context.json`
- 更新 `.codex/project-profile.md`
- 在验证信号清晰时更新 `.codex/validation-profile.json`
- 推荐当前任务最轻且合理的路线

后续回合里，`/Aide` 一般应：

- 跳过重复问候
- 复用已有状态
- 只有在路由确实变化时才说明变化

仓库里提交的 `.codex/state/*.json`、`.codex/project-profile.md`、`.codex/validation-profile.json` 都只是 starter 默认值。  
将 starter 拷贝到真实项目后，应由 `/Aide` 重写为项目专用状态。

## 用户命令

| 命令 | 适用场景 |
| --- | --- |
| `/Aide` | 开始工作、刷新状态、路由、治理 |
| `/qc` | 任务风险更高，或你想做显式审计 |
| `/follow` | 代码已经推送，CI 或 release follow-through 已相关 |

## 常见路径

| 任务 | 常见路径 | 通常会跳过 |
| --- | --- | --- |
| 小 bugfix | `/Aide -> coder -> focused validation` | `prd`、`architect`、`plan`、`/follow` |
| 较高风险 bugfix | `/Aide -> tester -> coder -> /qc` | 不增加价值的模块 |
| feature | `/Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester/coder -> optional /qc` | 不增加价值的重模块 |
| refactor | 先 direct，只有在契约、风险、handoff 变大时才升级 | 低风险局部 refactor 的 orchestration |
| release | `/Aide -> conduct -> optional /qc -> optional /follow` | 多步骤发布任务中的 direct 模式 |

## Workspace Prep

`workspace prep` 属于 `conduct`，不属于 `/Aide`。

只有在执行确实需要时才运行：

- 需要隔离分支或 worktree
- 需要依赖安装或刷新
- 需要本地服务、数据库或容器
- 需要在编码或测试前做一次窄范围 readiness check

下列场景通常应跳过：

- 小 bugfix
- 纯文档修改
- prompt / config-only 修改
- 工作区本来就已经 ready

## 治理动作

用 `/Aide` 做持久治理：

```text
/Aide audit
/Aide dedup
/Aide prune
/Aide 从现在开始叫我老周
/Aide tester 没跑真实命令时，不允许宣称 red phase
```

如果要改运行时路由规则，应修改 `.codex/routing-policy.md`，而不是 `.codex/project-profile.md`。

## Runtime Helpers

runtime helpers 位于 `.codex/scripts/`。  
当项目需要提醒、QC 跟进或 git 安全检查时再启用。

常用入口：

1. `node .codex/scripts/session-context.mjs`
2. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
3. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

runtime state 会按需写到 `.codex/state/runtime-state.json`。

需要注意：

- QC 提醒只在当前任务明确启用了 `/qc` 时生成
- `PROGRESS.md` 只记录 active checkpoint
- runtime 提醒和学习状态留在 `.codex/state/runtime-state.json`

## Smoke Test

运行：

```bash
node tests/runtime-hooks.smoke.mjs
```
