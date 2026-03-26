# 使用说明

这份文档用于解释使用方式，不是运行时权威。
运行时权威在 `AGENTS.md`、`.agents/skills/*/SKILL.md` 和 `.codex/routing-policy.md`。

英文文档是主版本。
中文文档是同步说明。

## 安装

1. 将 `AGENTS.md`、`.agents/skills/`、`.codex/`、`.product/` 复制到目标仓库根目录。
2. 如果需要 runtime helpers 或 smoke tests，确保 `node` 在 `PATH` 上可用。
3. 从 `/Aide` 开始。

## 首次运行

使用下面任意一种：

```text
/Aide
/Aide 修复登录回调 bug
```

如果新线程一开始没有显式 slash command，就把用户第一条消息按 `/Aide` intake 处理。

首次运行时，`/Aide` 应该：

- 简短打招呼
- 扫描仓库
- 更新 `.codex/state/task-context.json`
- 更新 `.codex/state/repo-context.json`
- 更新 `.codex/project-profile.md`
- 更新 `.codex/validation-profile.json`
- 选择当前任务最轻且合理的路线

当前没有独立的 repo scan 脚本。
`/Aide` 通过针对性的仓库检索和可选的只读探索完成 scan。

后续回合通常应：

- 跳过重复问候
- 先汇报当前 active task 和未结束历史任务
- 复用已有状态
- 只有在路由真的变化时才提变化
- 启动低成本 evolution sweep，但不阻塞首条 route

如果当前回合只是问答、分析、方案讨论或选项比较，而用户没有要求持久产物：

- `/Aide` 直接回答
- 默认不启用执行角色
- 默认不写持久状态
- 只读取回答当前问题所需的最小上下文

仓库里的 `.codex/*.json`、`.codex/project-profile.md`、`.product/*.json` 都是 starter 默认值。真实项目中应在正常使用里持续演进。

## 用户命令

| 命令 | 适用场景 |
| --- | --- |
| `/Aide` | intake、路由、治理、刷新状态 |
| `/qc` | coding 线任务需要显式审计 |
| `/submit` | coding 线任务需要进入受控交付 |

## 常见路径

| 任务 | 常见路径 |
| --- | --- |
| 小 bugfix | `/Aide -> coder -> sanity checks -> /submit` |
| 较高风险 bugfix | `/Aide -> tester -> coder -> tester 或 /qc -> /submit` |
| feature | `/Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> optional /qc -> /submit` |
| discussion / Q&A | `/Aide` 直接处理 |
| product | `/Aide -> product_assistant` |
| release | `/Aide -> conduct -> optional /qc -> /submit` |

## Product 任务

当主要交付物是非代码产物时，走 product 线。

例如：

- 文档
- API 描述
- 结构化内容文件
- 打包交付物
- 其他非代码输出

对 product 任务：

- `/Aide` 路由到 `product_assistant`
- 一般不会启用 `tester`、`/qc`、`/submit`
- `product_assistant` 可以在需要时读取技术材料
- `.product/*` 写回应保持轻量
- `/Aide` 在接受长期记忆或进化写回前，应先复看真实聊天记录

如果完成边界还不稳，`/Aide` 应做简短、自然的反馈确认，而不是套固定问卷。

## Coding 任务

当主要交付物是下面这些内容时，走 coding 线：

- 代码实现
- 行为变更
- 任务级验证
- 受控交付

对非平凡行为改动，`tester` 负责任务级验证 handoff。

## Runtime Helpers

常用入口：

1. `node .codex/scripts/task-overview.mjs`
2. `node .codex/scripts/aide-evolution.mjs`
3. `node .codex/scripts/aide-governance.mjs`
4. `node .codex/scripts/session-context.mjs`
5. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
6. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

`runtime-state.json` 按需生成。QC 提醒只会在当前任务明确启用了 `/qc` 时出现。

## Smoke Test

```bash
node tests/runtime-hooks.smoke.mjs
```
