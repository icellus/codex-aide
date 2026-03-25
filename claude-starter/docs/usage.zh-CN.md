# 使用说明

## 安装

1. 将 `CLAUDE.md` 和 `.claude/` 复制到目标仓库根目录。
2. 除非你明确要启用运行时 hooks，否则保持 `.claude/settings.json` 原样不动。
3. 从 `/Aide` 开始。

## 首次进入项目

可以这样用：

```text
/Aide
/Aide 修一下登录回调的 bug
```

首次运行时，`/Aide` 应该：

- 简短问候
- 扫描仓库
- 更新 `.claude/project-profile.md`
- 在验证信号明确时更新 `.claude/validation-profile.json`
- 给出当前任务最轻可行的路由建议

后续回合里，`/Aide` 通常应跳过重复问候，复用已记录状态，只有在路由真的变化时才说明变化。

## 命令

| 命令 | 使用场景 |
| --- | --- |
| `/Aide` | 开始工作、刷新状态、路由、治理 |
| `/qc` | 任务风险较高或你需要显式审计 |
| `/follow` | 代码已推送，且 CI 或发布后续跟进重要 |

## 常见路径

| 任务 | 典型路径 | 通常跳过 |
| --- | --- | --- |
| 小 bugfix | `/Aide -> 直接实现 -> 定向验证` | `prd`、`architect`、`plan`、`tester`、`coder`、`/qc`、`/follow` |
| 功能开发 | `/Aide -> 可选 prd -> 可选 architect -> conduct -> 可选 plan -> 实现` | 不产生价值的更重模块 |
| 重构 | `先 direct，只有在边界、风险或 handoff 变大时才升级` | 局部低风险重构的 orchestration |
| 发布 | `/Aide -> conduct -> 可选 /qc -> 可选 /follow` | 多步骤发布工作下的 direct 模式 |

## Workspace Prep

`workspace prep` 归 `conduct`，不归 `/Aide`。

只有在执行明确需要时才运行，例如：

- 需要独立 branch 或 worktree
- 需要安装或刷新依赖
- 需要启动本地服务、数据库或容器
- 编码或测试前需要窄范围 readiness check

小 bugfix、纯文档、prompt/config 小改和已 ready 的工作区通常应跳过。

## 治理

通过 `/Aide` 触发持久治理动作：

```text
/Aide audit
/Aide dedup
/Aide prune
/Aide 以后叫我老周
/Aide 不要让 tester 没跑真实命令就宣称 red phase 完成
```

运行时路由规则应改在 `.claude/routing-policy.md`，不要继续堆进 `.claude/project-profile.md`。

## 可选 Hooks

`.claude/settings.json` 默认关闭 hooks。

只有当项目确实需要运行时自动化时才启用：

1. 查看 `.claude/settings.hooks.example.json`
2. 将需要的 hooks 配置复制到 `.claude/settings.json`
3. 确认 `node` 已在 `PATH` 中可用

启用后，运行态状态文件会按需创建在 `.claude/state/runtime-state.json`。
只有当前任务显式启用 `/qc` 时，才会排队 QC 提醒。
