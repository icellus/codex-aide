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

如果新线程一开始没有显式 slash command，那么用户的第一条消息也应默认按 `/Aide` intake 处理。

首次运行时，`/Aide` 应该：

- 简短打招呼
- 扫描仓库
- 更新 `.codex/state/task-context.json`
- 更新 `.codex/state/repo-context.json`
- 更新 `.codex/project-profile.md`
- 在验证信号清晰时更新 `.codex/validation-profile.json` 中的仓库级验证基线
- 推荐当前任务最轻且合理的路线

后续回合里，`/Aide` 一般应：

- 跳过重复问候
- 先汇报当前 active task 和历史未结束任务
- 复用已有状态
- 只有在路由确实变化时才说明变化
- 启动低成本 evolution sweep，但不阻塞首个 route 输出

在真正的冷启动第一回合里，`/Aide` 还应额外用一行简短提醒用户可用的 `/Aide`、`/qc`、`/submit`。

仓库里提交的 `.codex/state/*.json`、`.codex/project-profile.md`、`.codex/validation-profile.json` 都只是 starter 默认值。  
将 starter 拷贝到真实项目后，应由 `/Aide` 重写为项目专用状态。

## 用户命令

| 命令 | 适用场景 |
| --- | --- |
| `/Aide` | 开始工作、刷新状态、路由、治理 |
| `/qc` | 任务风险更高，或你想做显式审计 |
| `/submit` | 实现或验证已完成，任务需要进入受控的 commit、push 或可选的推送后交付步骤 |

## `/Aide` 真正负责什么

- `/Aide` 不只是入口命令，它还是这套 starter 里负责让团队越来越稳的治理入口。
- 其他角色解决的是“当前这个功能怎么做好”；`/Aide` 解决的是“团队为什么会产出这种错误或工作流断裂”。
- 问题调查与默认路由：如果代码放错地方、输出质量差、handoff 断裂，`/Aide` 应先查系统原因，再决定谁来处理。
- 质量审计：`/Aide` 检查 Agent 和 Skill 文件里的系统性契约问题，这些问题会持续拉低团队效能。
- 去重：`/Aide` 查找跨 Agent / Skill 文件的重复规则，并提出收敛到单一权威的方案。
- 定级：`/Aide` 应先用 `L1` 到 `L4` 给治理问题定级，再决定是提醒、排队还是 writeback。
- 结构化知识捕获归 `architect`，不归 `conduct`。每次 architect 会话都应收尾到“做了什么决策、哪个假设错了、哪些经验值得写回”。
- 即使轻流程跳过了 `architect`，`/Aide` 也应在启动时做一次低成本进化检查。

## 常见路径

| 任务 | 常见路径 | 通常会跳过 |
| --- | --- | --- |
| 小 bugfix | `/Aide -> coder -> sanity checks -> /submit` | `prd`、`architect`、`plan` |
| 较高风险 bugfix | `/Aide -> tester -> coder -> tester 或 /qc -> /submit` | 不增加价值的模块 |
| feature | `/Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> tester 或 optional /qc -> /submit` | 不增加价值的重模块 |
| refactor | 先 lightweight，只有在契约、风险、handoff 变大时才升级 | 低风险局部 refactor 不需要 long-running 跟踪 |
| release | `/Aide -> conduct -> optional /qc -> /submit` | 多步骤发布任务中的 `long-running` 模式 |

## Environment Setup

`environment setup` 属于 `conduct`，不属于 `/Aide`。

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
如果要改自动进化阈值或允许的低风险自动写回规则，应修改 `.codex/evolution-policy.json`。

`/Aide` 的三项核心治理能力是：

- 问题调查与默认路由：把坏产物当成症状，去找根因和默认责任方
- 质量审计：找出会持续降低团队效能的系统性契约问题
- 去重：把重复规则收回到单一权威文件

建议统一使用 `L1` 到 `L4`：

- `L1`：局部症状或一次性表述问题
- `L2`：单角色契约漂移
- `L3`：路由、handoff、自动化层面的工作流断裂
- `L4`：共享规则的权威缺陷、重复或冲突

## Runtime Helpers

runtime helpers 位于 `.codex/scripts/`。  
当项目需要提醒、QC 跟进或 git 安全检查时再启用。

常用入口：

1. `node .codex/scripts/task-overview.mjs`
2. `node .codex/scripts/aide-evolution.mjs`
3. `node .codex/scripts/aide-governance.mjs`
4. `node .codex/scripts/session-context.mjs`
5. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
6. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

runtime state 会按需写到 `.codex/state/runtime-state.json`。
任务注册表会落到 `.codex/state/task-registry.json`，用于保留当前任务、历史未结束任务，以及按需查询的已完成任务。
evolution registry 会落到 `.codex/state/evolution-registry.json`，用于记录后台 sweep 结果和 settled-task review 历史。
evolution policy 位于 `.codex/evolution-policy.json`，用于决定哪些重复信号类别允许自动做低风险 writeback。

需要注意：

- `/Aide` 默认只汇报当前任务和未结束任务；已完成任务按需查询
- `/Aide` 的治理审查也可以被自动触发，例如重复 QC 失败、blocked handoff、任务未正常收口、settled-task review、architect 的结构化回顾
- architect 的结构化回顾是每次会话结束都应发生的知识捕获，不是只在失败后触发
- QC 提醒只在当前任务明确启用了 `/qc` 时生成
- `PROGRESS.md` 只记录 active checkpoint
- runtime 提醒和学习状态留在 `.codex/state/runtime-state.json`
- 真正表示任务完成时，优先使用 `task_settled`，不要依赖 `session_end`

对于非平凡功能或行为修改，`tester` 应负责任务级验证 handoff。  
可以使用 tester 内联报告，或复用 `.codex/templates/validation-handoff.md`，明确写出：

- validation targets
- selected checks
- coverage rationale
- remaining gaps

## Smoke Test

运行：

```bash
node tests/runtime-hooks.smoke.mjs
```
