# codex-starter 中文指南

这份文档面向首次接入 `codex-starter` 的外部使用者。

它的目标不是替代所有英文文档，而是用一份中文说明快速回答这几个问题：

- 这个 starter 是做什么的
- 应该把哪些文件复制到你的仓库
- `AGENTS.md`、`.agents`、`.codex` 分别负责什么
- `/Aide`、`/qc`、`/follow` 应该怎么用
- 初次接入时应该怎么保持上下文和运行时成本可控

## 1. 这个 starter 是什么

`codex-starter` 是一套项目本地的 Codex 工作流骨架。

它的设计目标是：

- 默认保持轻量，优先直接完成小任务
- 只在任务确实需要时启用更重的规划、审计、发布跟进能力
- 把技能协议、路由策略、运行时状态和子代理定义拆开管理
- 尽量减少主会话的无效上下文，让运行时 token 成本保持可控

如果你的仓库大多数工作是：

- 小型 bugfix
- 局部 feature
- 局部 refactor
- 偶发的高风险审核或发布跟进

那么这个 starter 比“所有任务都走重流程”更合适。

## 2. 快速开始

把下面这些内容复制到目标仓库根目录：

1. `AGENTS.md`
2. `.agents/skills/`
3. `.codex/`
4. 可选复制 `docs/`
5. 可选复制 `tests/`

然后确认：

- 本地有 `node`
- 你愿意让运行时辅助脚本写入 `.codex/state/*.json`

接入后的首次使用通常是：

```text
/Aide
```

或者：

```text
/Aide 修复登录回调 bug
```

首次运行时，`/Aide` 应该：

- 扫描仓库
- 更新热状态文件
- 推断验证命令
- 选择当前任务最轻的路线

## 3. 目录结构说明

当前 starter 采用三层结构：

### `AGENTS.md`

作用：

- 全局入口
- slash command 到 skill 的映射
- 运行时文件总览
- 少量全局 guardrails

它应该保持短，不应该重新变成一份“大而全总规则”。

### `.agents/`

作用：

- 存放 repo-local skills
- 定义 `/Aide`、`/qc`、`/follow` 和内部 skill 的行为协议

当前约定路径是：

```text
.agents/skills/*/SKILL.md
```

可以把它理解为“技能层”。

### `.codex/`

作用：

- 存放运行时策略、子代理、状态、脚本和模板

典型内容包括：

- `.codex/agents/*.toml`：子代理定义
- `.codex/state/*.json`：热状态和运行时状态
- `.codex/scripts/*.mjs`：运行时辅助脚本
- `.codex/routing-policy.md`：路由策略
- `.codex/validation-profile.json`：验证命令配置

可以把它理解为“运行时层”。

## 4. 为什么拆成 `.agents` 和 `.codex`

这不是为了增加目录，而是为了把两类内容分开：

- `.agents` 负责“技能协议”
- `.codex` 负责“运行时执行”

这样拆开的好处是：

- 技能文档和机器状态不混在一起
- 热状态可以单独 JSON 化，减少恢复成本
- 子代理定义、路由策略、runtime hooks 更容易独立演进
- 对外文档和内部运行时不容易互相污染

如果你更偏好单目录，也可以后续收敛到 `.codex/`。  
但当前 starter 先保留这种分层方式，原因是治理边界更清楚。

## 5. 关键运行时文件

外部使用时，最需要理解的是下面几个文件：

### `.codex/state/task-context.json`

热任务状态。

里面放的是：

- 当前任务
- 任务状态
- 风险级别
- 当前 delivery mode
- 已启用模块
- QC / follow 策略
- 协作偏好

这是运行时优先读取的任务上下文。

### `.codex/state/repo-context.json`

仓库缓存事实。

里面放的是：

- 语言和框架
- 仓库形态
- CI / 部署信号
- release 路径
- validation 信号

它的作用是避免每次都做全仓重扫。

### `.codex/validation-profile.json`

结构化验证命令。

它描述：

- 快速反馈命令
- focused validation
- build / lint / typecheck / integration / e2e
- 哪些命令昂贵
- 哪些命令依赖外部服务

### `.codex/project-profile.md`

这是给人看的短摘要，不是热状态主文件。

它应该保持简短，用来帮助人快速了解当前项目和任务概况。

### `PROGRESS.md`

只在 `orchestrated` 模式下使用。

它现在只负责：

- 当前 checkpoint
- next step
- blockers
- resume-safe 的追踪信息

它不应该承载越来越多的运行时机器状态。

## 6. 三种工作模式

### `direct`

适合：

- 小 bug
- 小范围改动
- 明确、局部、低风险任务

典型路径：

```text
/Aide -> coder -> focused validation -> done
```

### `plan-driven`

适合：

- 需要一个明确实施计划
- 但还没复杂到要整套 orchestration

典型路径：

```text
/Aide -> conduct -> optional plan -> tester/coder -> validate
```

### `orchestrated`

适合：

- 跨 session
- 多 checkpoint
- release
- 高风险任务

典型路径：

```text
/Aide -> conduct -> PROGRESS.md -> tester/coder -> optional /qc -> optional /follow
```

## 7. 三个用户命令

### `/Aide`

入口命令。

适合：

- 开始一个新任务
- 刷新仓库状态
- 更新路由
- 做治理动作，例如 audit / dedup / prune

### `/qc`

质量审计。

适合：

- 高风险任务
- 需要独立审查 tester / coder handoff
- 发布前的额外质量确认

它不是默认每次都要执行的步骤。

### `/follow`

推送后、CI、发布跟进。

适合：

- 代码已经推送
- CI / workflow / release follow-through 已经相关

如果代码还没推送，通常不应该先跑 `/follow`。

## 8. 对外接入建议

如果你准备把这个 starter 复制到自己的仓库，建议按下面顺序落地：

1. 先只接 `AGENTS.md`、`.agents/skills/`、`.codex/`
2. 跑一次 `/Aide`
3. 让 `/Aide` 更新 `.codex/state/task-context.json`
4. 让 `/Aide` 更新 `.codex/state/repo-context.json`
5. 补全 `.codex/validation-profile.json`
6. 只在任务确实需要时再启用 `plan`、`/qc`、`/follow`

不要一开始就把所有模块都当成默认路径。

## 9. 如何控制上下文和 token 成本

这是外部使用时最值得遵守的原则：

### 保持热路径文件短

优先让运行时读取：

- `.codex/state/task-context.json`
- `.codex/state/repo-context.json`
- `.codex/validation-profile.json`

不要把所有规则重新塞回 `AGENTS.md`。

### 让 `PROGRESS.md` 只做 checkpoint 跟踪

不要把：

- retrospective
- 学习队列
- 大段运行日志

全都塞进 `PROGRESS.md`。

### 小任务默认走 `direct`

只有在下面这些情况才升级：

- 需求不稳定
- 架构边界不稳定
- 需要 durable plan
- 需要更强的 QA / release gate

### 子代理只读最小必要上下文

写代码的子代理应优先读取：

1. `.codex/state/task-context.json`
2. `.codex/validation-profile.json`
3. 与当前任务直接相关的代码和测试

而不是每次都全量读文档。

## 10. 适合什么样的团队

这个 starter 更适合：

- 希望默认流程轻量的团队
- 需要 optional governance，而不是强制重流程的团队
- 想把主会话保持干净，把具体执行交给子代理的团队

如果你的团队希望：

- 所有任务都强制写 PRD
- 所有任务都必须走完整 plan / audit / release gate

那这个 starter 可能会显得太轻。

## 11. 推荐阅读顺序

如果你是首次接入，建议按这个顺序阅读：

1. `README.md`
2. 本文档
3. `docs/overview.zh-CN.md`
4. `docs/usage.zh-CN.md`
5. `docs/detailed-guide.zh-CN.md`
6. `docs/overview.md`
7. `docs/usage.md`
8. `AGENTS.md`
9. `.codex/routing-policy.md`

如果你准备实际落地，再看：

1. `.agents/skills/aide/SKILL.md`
2. `.agents/skills/qc/SKILL.md`
3. `.agents/skills/follow/SKILL.md`
4. `.codex/agents/*.toml`
5. `.codex/scripts/*.mjs`

## 12. 一句话总结

可以把 `codex-starter` 理解成：

“一套默认轻量、按需升级、把技能层和运行时层拆开管理的项目本地 Codex 工作流骨架。”
